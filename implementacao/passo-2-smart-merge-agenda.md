# Passo 2 — Smart Merge (Calendar WebHooks)

**Onde:** Sub-workflow "Calendar WebHooks - Total Assistente"
**Resolve:** PF-CW2 (corrupção de data), PF-A5 (duração no backend), PF-CW3 (string vazia), PF-CW5 (start < end)

---

## O Que Fazer

Substituir o node **Edit Fields5** (Set node) por um **Code node** chamado "Smart Merge".

- **Recebe de:** Switch output 1 (exatamente 1 resultado)
- **Envia para:** Get a row1 (mesma conexão que Edit Fields5 tinha)
- **Posição:** mesma do Edit Fields5 atual

---

## Como Fazer no N8N

1. Abra o sub-workflow "Calendar WebHooks"
2. Encontre o node **Edit Fields5** (está entre o Switch e o Get a row1)
3. Anote as conexões (de onde vem e pra onde vai)
4. Delete o node Edit Fields5
5. Adicione um novo node **Code** (JavaScript)
6. Nomeie como: `Smart Merge`
7. Cole o código abaixo
8. Conecte: Switch (output 1) → Smart Merge → Get a row1

---

## Código do Smart Merge

Cole este código no node Code:

```javascript
// Smart Merge — Substitui Edit Fields5
// Resolve: PF-CW2 (||), PF-A5 (duração), PF-CW3 (""), PF-CW5 (start<end)

const webhook = $('Editar eventos - webhook').item.json.body;
const evento = $json.data[0].output[0];

// --- 1. Extrair valores do webhook (string vazia = não fornecido) ---
const novoNome = (webhook.novo_nome_evento && webhook.novo_nome_evento.trim() !== "")
  ? webhook.novo_nome_evento
  : null;

const novaDesc = (webhook.novo_desc_evento && webhook.novo_desc_evento.trim() !== "")
  ? webhook.novo_desc_evento
  : null;

const novoInicio = (webhook.novo_inicio_evento && webhook.novo_inicio_evento.trim() !== "")
  ? webhook.novo_inicio_evento
  : null;

const novoFim = (webhook.novo_fim_evento && webhook.novo_fim_evento.trim() !== "")
  ? webhook.novo_fim_evento
  : null;

// --- 2. Montar campos finais ---
const sessao = evento.uuid;
const user_id = webhook.user_id;

// Nome e descrição: se não fornecido, manter original
const nome_final = novoNome || evento.nome;
const desc_final = novaDesc || evento.descricao;

// --- 3. Lógica de data/hora com preservação de duração ---
let inicio_final;
let fim_final;

if (novoInicio && novoFim) {
  // Caso 1: Usuário informou início E fim → usar ambos
  inicio_final = novoInicio;
  fim_final = novoFim;

} else if (novoInicio && !novoFim) {
  // Caso 2: Só novo início → preservar duração original
  inicio_final = novoInicio;

  const inicioOriginal = new Date(evento.inicio_evento);
  const fimOriginal = new Date(evento.fim_evento);
  const duracaoMs = fimOriginal.getTime() - inicioOriginal.getTime();

  if (duracaoMs > 0) {
    // Duração conhecida: aplicar mesma duração ao novo início
    const novoFimDate = new Date(new Date(novoInicio).getTime() + duracaoMs);
    // Formatar como YYYY-MM-DD HH:mm:ss-03
    const pad = (n) => String(n).padStart(2, '0');
    // Converter para horário -03
    const offset = -3 * 60 * 60 * 1000;
    const local = new Date(novoFimDate.getTime() + offset);
    fim_final = `${local.getUTCFullYear()}-${pad(local.getUTCMonth()+1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}-03`;
  } else {
    // Duração desconhecida ou inválida: +30 minutos
    const novoFimDate = new Date(new Date(novoInicio).getTime() + 30 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const offset = -3 * 60 * 60 * 1000;
    const local = new Date(novoFimDate.getTime() + offset);
    fim_final = `${local.getUTCFullYear()}-${pad(local.getUTCMonth()+1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}-03`;
  }

} else if (!novoInicio && novoFim) {
  // Caso 3: Só novo fim → manter início original
  inicio_final = evento.inicio_evento;
  fim_final = novoFim;

} else {
  // Caso 4: Nenhum horário novo → manter originais
  inicio_final = evento.inicio_evento;
  fim_final = evento.fim_evento;
}

// --- 4. Validação start < end ---
const startDate = new Date(inicio_final);
const endDate = new Date(fim_final);

if (startDate >= endDate) {
  // Se início >= fim, forçar fim = início + 30 minutos
  const corrigido = new Date(startDate.getTime() + 30 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const offset = -3 * 60 * 60 * 1000;
  const local = new Date(corrigido.getTime() + offset);
  fim_final = `${local.getUTCFullYear()}-${pad(local.getUTCMonth()+1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}-03`;
}

// --- 5. Retornar no mesmo formato que Edit Fields5 retornava ---
return [{
  json: {
    sessao: sessao,
    novo_nome: nome_final,
    nova_desc: desc_final,
    novo_comeco: inicio_final,
    novo_fim: fim_final,
    user_id: user_id
  }
}];
```

---

## O Que Este Código Faz (vs Edit Fields5 antigo)

| Cenário | Edit Fields5 (antigo) | Smart Merge (novo) |
|---------|----------------------|-------------------|
| novo_fim="" e novo_inicio preenchido | `"" \|\| fim_original` → puxa fim de outra data | Calcula novo_fim = novo_inicio + duração original |
| novo_fim="" e novo_inicio="" | `"" \|\| fim_original` → OK neste caso | Mantém ambos originais → OK |
| start > end após merge | Salva no banco (inválido) | Corrige: fim = início + 30min |
| Mudança de dia (04/04 → 10/04) | Puxa fim do dia 04/04 (errado) | Calcula fim no dia 10/04 (correto) |
| String vazia em nome/desc | `"" \|\| original` → funciona por acaso | Verifica explicitamente `.trim() !== ""` |

---

## Verificação após Passo 2

Teste no N8N DEV:

1. **"muda a reunião de amanhã pras 16h"** (evento original 15:00-15:30)
   - Esperado: novo_comeco=16:00, novo_fim=16:30 (duração preservada)
   - Antes: novo_fim seria 15:30 (errado)

2. **"passa o dentista de terça pra quinta às 10h"** (mudança de dia)
   - Esperado: novo_comeco=quinta 10:00, novo_fim=quinta 10:30
   - Antes: novo_fim seria terça XX:XX (dia errado)

3. **"renomeia a reunião pra 'Daily'"** (só nome, sem horário)
   - Esperado: nome=Daily, horários originais mantidos
   - Antes: funcionava (por acaso, || com valor preenchido)
