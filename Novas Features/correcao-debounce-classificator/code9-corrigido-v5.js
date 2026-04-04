// ============================================================
// Node: "Code9" — v5 REWRITE COMPLETO
// ============================================================
// MUDANCAS vs v4:
// 1. mensagem_principal concatena TODAS as msgs (fix PF-D2)
// 2. Filtro de idade: ignora msgs com mais de 60s (protecao lista orfa)
// 3. Mensagem unica: sem prefixo [1] (compatibilidade)
// 4. Multi-mensagem: prefixo [1] [2] para contexto claro
// 5. Limite de 10 mensagens para evitar prompt explosion
// ============================================================

// ===== Helpers =====
function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function sanitize(text) {
  if (!text) return '';
  return String(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMessageText(v) {
  if (!v) return '';

  if (typeof v === 'object' && v !== null) {
    return sanitize(v.message_user ?? v.text ?? '');
  }

  if (typeof v === 'string') {
    const normalized = v
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    const p = safeParse(normalized);
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      return sanitize(p.message_user ?? p.text ?? '');
    }

    const pOrig = safeParse(v);
    if (pOrig && typeof pOrig === 'object' && !Array.isArray(pOrig)) {
      return sanitize(pOrig.message_user ?? pOrig.text ?? '');
    }

    if (typeof pOrig === 'string') {
      const p2 = safeParse(pOrig);
      if (p2 && typeof p2 === 'object') {
        return sanitize(p2.message_user ?? p2.text ?? '');
      }
      return sanitize(pOrig);
    }

    const match = v.match(/"message_user"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (match) {
      return sanitize(match[1].replace(/\\n/g, ' ').replace(/\\"/g, '"'));
    }

    return sanitize(v);
  }

  return '';
}

// Extrai timestamp de uma entrada do debounce
function extractTimestamp(v) {
  if (!v) return null;
  if (typeof v === 'object' && v !== null) return v.ts ?? null;
  if (typeof v === 'string') {
    const parsed = safeParse(v);
    if (parsed && typeof parsed === 'object') return parsed.ts ?? null;
  }
  return null;
}

// ================================
// 1) HISTORICO CONFIRMADO (IA <-> USER)
// ================================
let listaMemoria = [];

try {
  const memItems = $('Redis Chat Memory7').all();
  if (memItems?.length) {
    const redisItem = memItems[0].json;
    if (Array.isArray(redisItem?.Lista)) listaMemoria = redisItem.Lista;
  }
} catch (e) {
  listaMemoria = [];
}

const amostra = listaMemoria.slice(-20);

const eventos = amostra
  .map(raw => (typeof raw === 'string' ? safeParse(raw) : raw))
  .filter(Boolean)
  .map(e => ({
    type: e.type,
    content: sanitize(e.data?.content ?? '')
  }))
  .filter(e => e.content);

const paresCompletos = [];
for (let i = eventos.length - 1; i >= 0 && paresCompletos.length < 5; i--) {
  if (eventos[i].type !== 'ai') continue;
  let j = i - 1;
  while (j >= 0 && eventos[j].type !== 'human') j--;
  if (j >= 0) {
    const userText = eventos[j].content;
    const aiParsed = safeParse(eventos[i].content);
    const respostaFinal = sanitize(aiParsed?.mensagem ?? eventos[i].content);
    paresCompletos.unshift({ pedido: userText, resposta: respostaFinal });
    i = j;
  }
}

const paresClassificador = paresCompletos.slice(-2);

// ================================
// 2) MENSAGEM ATUAL (DEBOUNCE) — REESCRITO v5
// ================================
let mensagemPrincipal = '';
const now = Date.now();
const MAX_AGE_MS = 60000; // 60 segundos — msgs mais velhas sao lixo

try {
  const firstGetItems = $('firstGet').all();
  if (firstGetItems?.length) {
    const redisDebounce = firstGetItems[0].json;
    const listaDebounce = redisDebounce?.Lista ?? redisDebounce?.lista ?? [];
    const coletadas = [];

    const items = Array.isArray(listaDebounce)
      ? listaDebounce
      : [listaDebounce];

    for (const v of items) {
      if (!v) continue;

      // Filtro de idade: ignorar msgs com mais de 60s
      const ts = extractTimestamp(v);
      if (ts && (now - ts) > MAX_AGE_MS) continue;

      const texto = extractMessageText(v);
      if (texto) coletadas.push(texto);
    }

    // ============================================================
    // FIX PF-D2: Concatenar TODAS as mensagens
    // ============================================================
    const msgsUnicas = coletadas.filter(Boolean);

    if (msgsUnicas.length === 1) {
      // Mensagem unica — sem prefixo, comportamento original
      mensagemPrincipal = msgsUnicas[0];
    } else if (msgsUnicas.length > 1) {
      // Multi-mensagem — prefixo numerico, limite 10
      const limitadas = msgsUnicas.slice(-10);
      mensagemPrincipal = limitadas
        .map((msg, i) => `[${i + 1}] ${msg}`)
        .join('\n');
    }
    // ============================================================
  }
} catch (e) {
  mensagemPrincipal = '';
}

mensagemPrincipal = sanitize(mensagemPrincipal);

// ================================
// 3) TEXTO FINAL PARA CLASSIFICADOR
// ================================
let mensagemFinal = '';

if (paresClassificador.length) {
  mensagemFinal += 'Historico recente (apenas pedidos do usuario):\n';
  for (const p of paresClassificador) {
    mensagemFinal += `- "${p.pedido}"\n`;
  }
  mensagemFinal += '\n';
}

mensagemFinal += `Mensagem principal do usuario: ${mensagemPrincipal}`;

// ================================
// 4) SAIDA
// ================================
return {
  json: {
    mensagem_final: mensagemFinal,
    confirmados_classificador: paresClassificador,
    confirmados: paresCompletos,
    mensagem_principal: mensagemPrincipal
  }
};
