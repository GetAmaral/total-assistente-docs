# 04 — Implementacao: Correcao Resumo PT-BR

**Tipo:** Correcao de bug (code-switching involuntario)
**Onde:** Main Workflow → Node "Message a model" + novo node de validacao
**Tempo estimado:** ~15 minutos no editor N8N
**Risco de regressao:** Baixo (alteracoes aditivas)

---

## Correcao 1 — System Prompt Reforccado (OBRIGATORIA)

### Onde

Node: **"Message a model"**
Campo: **System Message** (system prompt)

### Prompt ATUAL (remover)

```
Voce e um assistente que resume textos de forma clara e concisa em portugues brasileiro. Resuma o texto mantendo os pontos principais. Apenas resuma. Apenas isso.
```

### Prompt NOVO (copiar e colar)

```
Voce e um assistente que resume textos de forma clara e concisa.

REGRAS ABSOLUTAS:
1. Responda EXCLUSIVAMENTE em portugues brasileiro. NUNCA use palavras em outros idiomas (arabe, ingles, espanhol, etc), exceto nomes proprios e siglas tecnicas amplamente conhecidas (ex: VBMAP, PEI, ABA).
2. Resuma o texto mantendo os pontos principais.
3. Seja conciso e direto.
4. Nao adicione informacoes que nao estejam no texto original.
5. Nao cumprimente, nao explique o que voce vai fazer, apenas entregue o resumo.
```

### Como aplicar no N8N

1. Abrir o workflow **Main - Total Assistente** no editor N8N
2. Clicar duas vezes no node **"Message a model"**
3. No campo **"System Message"**, selecionar todo o texto atual e apagar
4. Colar o prompt novo acima (Ctrl+V)
5. **NAO alterar** nenhum outro campo (model, temperature, max tokens, user message)
6. Clicar em **"Save"** no node
7. Clicar em **"Save"** no workflow (canto superior direito)

### Verificacao

Apos salvar, os campos devem estar assim:

| Campo | Valor |
|-------|-------|
| Model | `gpt-5.4-mini` (nao alterar) |
| Temperature | `0.3` (nao alterar) |
| Max Tokens | `500` (nao alterar) |
| System Message | O novo prompt acima |
| User Message | `={{ $json.data }}` (nao alterar) |

---

## Correcao 2 — Node de Validacao Pos-IA (RECOMENDADA)

### O que e

Um node **Code** (JavaScript) entre o "Message a model" e o "Send message5" que detecta caracteres nao-latinos e limpa a resposta antes de enviar ao usuario.

### Onde inserir

```
ANTES:
  Message a model → Send message5
                  → Log: audio_summary

DEPOIS:
  Message a model → Validar PT-BR → Send message5
                                   → Log: audio_summary
```

### Como criar o node

1. No editor N8N, arrastar o node **"Code"** para o canvas
2. Posicionar entre "Message a model" e "Send message5"
3. Renomear o node para **"Validar PT-BR"**
4. Configurar:
   - **Mode:** Run Once for All Items
   - **Language:** JavaScript

### Codigo (copiar e colar no campo "JavaScript Code")

```javascript
// Validar PT-BR — Detecta e corrige caracteres nao-latinos no resumo
// Camada L5 do Swiss Cheese: barreira pos-LLM

const items = $input.all();

for (const item of items) {
  const content = item.json.output?.[0]?.content?.[0]?.text || '';
  
  // Regex: detecta blocos de caracteres arabes, cirílicos, CJK, devanagari, etc.
  const nonLatinPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0400-\u04FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\u0900-\u097F\uAC00-\uD7AF]/g;
  
  const matches = content.match(nonLatinPattern);
  
  if (matches) {
    // Substituir blocos nao-latinos por string vazia
    // O contexto ao redor geralmente mantem o sentido
    let cleaned = content;
    
    // Detecta palavras inteiras que contem caracteres nao-latinos
    const nonLatinWordPattern = /\S*[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0400-\u04FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\u0900-\u097F\uAC00-\uD7AF]+\S*/g;
    cleaned = cleaned.replace(nonLatinWordPattern, '').replace(/\s{2,}/g, ' ').trim();
    
    // Atualiza o output
    item.json.output[0].content[0].text = cleaned;
    
    // Flag para logging
    item.json._ptbr_anomaly = true;
    item.json._ptbr_original = content;
    item.json._ptbr_removed_chars = matches.join('');
  } else {
    item.json._ptbr_anomaly = false;
  }
}

return items;
```

### Reconectar os nodes

1. **Desconectar** a saida do "Message a model" do "Send message5"
2. **Conectar** a saida do "Message a model" na entrada do "Validar PT-BR"
3. **Conectar** a saida do "Validar PT-BR" na entrada do "Send message5"
4. **Conectar** a saida do "Validar PT-BR" TAMBEM na entrada do "Log: audio_summary"

O fluxo final deve ser:

```
Message a model
      |
      v
Validar PT-BR
      |
      ├──> Send message5 (WhatsApp)
      └──> Log: audio_summary (Supabase)
```

---

## Correcao 3 — Log de Anomalia (RECOMENDADA)

### O que e

Ajuste no node "Log: audio_summary" para registrar quando uma anomalia de idioma foi detectada.

### Como fazer

1. Abrir o node **"Log: audio_summary"**
2. Adicionar um campo novo na insercao do Supabase (se o schema da tabela `execution_log` permitir) ou registrar no campo `error_message`

### Opcao A — Se houver campo disponivel na tabela

Adicionar ao body da insercao:

| Campo | Expressao |
|-------|-----------|
| error_message | `={{ $json._ptbr_anomaly ? 'ANOMALY: non-latin chars detected and removed: ' + $json._ptbr_removed_chars : null }}` |

### Opcao B — Se nao quiser alterar o schema

No node "Log: audio_summary", alterar o campo `summary_text` para usar o texto ja limpo:

| Campo | Expressao atual | Expressao nova |
|-------|----------------|---------------|
| summary_text | `={{ $json.output[0].content[0].text }}` | `={{ $json.output[0].content[0].text }}` (sem mudanca — o node Validar PT-BR ja alterou o valor in-place) |

O campo `summary_text` ja vai conter o texto limpo porque o node "Validar PT-BR" modifica o `$json.output[0].content[0].text` antes do log receber.

---

## Resumo Visual da Implementacao

```
╔══════════════════════════════════════════════════════════════╗
║                     ANTES (VULNERAVEL)                       ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Message a model ──────────> Send message5 (WhatsApp)        ║
║       (prompt fraco)    │                                    ║
║                         └──> Log: audio_summary              ║
║                                                              ║
║  Camadas de defesa: 1 (prompt)                               ║
║  Buracos: L4 (prompt), L5 (sem validacao), L6 (sem filtro)   ║
╚══════════════════════════════════════════════════════════════╝

                          ↓ ↓ ↓

╔══════════════════════════════════════════════════════════════╗
║                     DEPOIS (CORRIGIDO)                        ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Message a model ──> Validar PT-BR ──> Send message5         ║
║  (prompt reforccado)   (regex)     │                         ║
║                                    └──> Log: audio_summary   ║
║                                         (com flag anomalia)  ║
║                                                              ║
║  Camadas de defesa: 3 (prompt + validacao + log)             ║
║  Buracos fechados: L4 (prompt), L5 (validacao), L6 (log)    ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Ordem de Execucao

| Passo | Acao | Tempo |
|-------|------|-------|
| 1 | Alterar system prompt do "Message a model" | 2 min |
| 2 | Criar node "Validar PT-BR" (Code) | 5 min |
| 3 | Reconectar nodes | 2 min |
| 4 | Ajustar log de anomalia | 2 min |
| 5 | Salvar workflow | 1 min |
| 6 | Testar (ver checklist em `06-checklist-deploy.md`) | 5 min |
