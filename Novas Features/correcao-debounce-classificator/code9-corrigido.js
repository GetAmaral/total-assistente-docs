// ============================================================
// Node: "Code9" — v5 FIX PF-D2 (classificador recebe TODAS as msgs)
// ============================================================
// CORRECOES v5:
// 1. mensagem_principal agora concatena TODAS as msgs do debounce (nao so a ultima)
// 2. Msgs formatadas com prefixo numerico para contexto claro
// 3. Limite de 10 mensagens para evitar prompt explosion
// 4. Mantém 100% compativel com extractMessageText() da v4
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

// Extrai texto puro de uma entrada de debounce (string ou objeto)
function extractMessageText(v) {
  if (!v) return '';

  // Se for objeto direto: { message_user: "..." }
  if (typeof v === 'object' && v !== null) {
    return sanitize(v.message_user ?? v.text ?? '');
  }

  // Se for string, pode ser JSON simples ou duplo-stringificado
  if (typeof v === 'string') {
    // 1. Normalizar caracteres de controle ANTES do parse
    const normalized = v
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    const p = safeParse(normalized);

    if (p && typeof p === 'object' && !Array.isArray(p)) {
      return sanitize(p.message_user ?? p.text ?? '');
    }

    // 2. Tentar parse do original (caso ja esteja escapado corretamente)
    const pOrig = safeParse(v);

    if (pOrig && typeof pOrig === 'object' && !Array.isArray(pOrig)) {
      return sanitize(pOrig.message_user ?? pOrig.text ?? '');
    }

    // Parse retornou string → pode ser duplo-stringificado
    if (typeof pOrig === 'string') {
      const p2 = safeParse(pOrig);
      if (p2 && typeof p2 === 'object') {
        return sanitize(p2.message_user ?? p2.text ?? '');
      }
      return sanitize(pOrig);
    }

    // 3. Ultimo recurso: extrair via regex
    const match = v.match(/"message_user"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (match) {
      return sanitize(match[1].replace(/\\n/g, ' ').replace(/\\"/g, '"'));
    }

    // Parse falhou completamente → usar string raw
    return sanitize(v);
  }

  return '';
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

// Monta pares completos (para AI Agent — 5 pares)
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

// Pares reduzidos para o classificador (2 pares, SEM respostas da IA)
const paresClassificador = paresCompletos.slice(-2);

// ================================
// 2) MENSAGEM ATUAL (DEBOUNCE)
// ================================
// >>> FIX PF-D2: Concatenar TODAS as mensagens, nao so a ultima <<<
let mensagemPrincipal = '';

try {
  const firstGetItems = $('firstGet').all();
  if (firstGetItems?.length) {
    const redisDebounce = firstGetItems[0].json;
    const listaDebounce = redisDebounce?.Lista ?? redisDebounce?.lista ?? [];
    const coletadas = [];

    if (Array.isArray(listaDebounce)) {
      for (const v of listaDebounce) {
        const texto = extractMessageText(v);
        if (texto) coletadas.push(texto);
      }
    } else if (typeof listaDebounce === 'string') {
      const texto = extractMessageText(listaDebounce);
      if (texto) coletadas.push(texto);
    } else if (typeof listaDebounce === 'object' && listaDebounce !== null) {
      const texto = extractMessageText(listaDebounce);
      if (texto) coletadas.push(texto);
    }

    // ============================================================
    // FIX PF-D2: Em vez de .slice(-1)[0], concatenar todas
    // ============================================================
    const msgsUnicas = coletadas.filter(Boolean);

    if (msgsUnicas.length === 1) {
      // Mensagem unica — manter comportamento original
      mensagemPrincipal = msgsUnicas[0];
    } else if (msgsUnicas.length > 1) {
      // Multiplas mensagens — concatenar com contexto
      // Limitar a 10 para evitar prompt explosion
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
// 3) TEXTO FINAL PARA CLASSIFICADOR (historico reduzido)
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
