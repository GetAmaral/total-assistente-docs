# Reescrita Completa: Debounce + Classificador — Premium Main

**Data:** 2026-04-04
**Workflow:** Premium Main (`tyJ3YAAtSg1UurFj`)
**Base:** Estudo de debounce (30+ fontes) + mapeamento completo do workflow atual

---

## Indice

1. [Diagnostico: O Que Esta Errado Hoje](#1-diagnostico)
2. [Arquitetura Nova vs Antiga](#2-arquitetura)
3. [PASSO 1 — Reordenar o Debounce](#passo-1)
4. [PASSO 2 — Code9 Corrigido (v5)](#passo-2)
5. [PASSO 3 — Classificador Corrigido](#passo-3)
6. [PASSO 4 — Remover Gates Pos-Agent](#passo-4)
7. [PASSO 5 — Limpar Nodes Orfaos](#passo-5)
8. [Mapa Visual Antes vs Depois](#mapa-visual)
9. [Testes de Validacao](#testes)
10. [Checklist Final](#checklist)

---

## 1. Diagnostico: O Que Esta Errado Hoje {#1-diagnostico}

### 1.1 Debounce — 7 problemas

| # | Problema | Gravidade | Causa raiz |
|---|---------|-----------|------------|
| D1 | Wait de 3s em TODA mensagem | Alta (UX) | Wait antes do gate, toda execucao espera |
| D2 | Lista Redis sem TTL | Alta | pushRedisMessage nao tem EXPIRE |
| D3 | firstGet ANTES do Wait | Media | Snapshot pode nao ter todas as msgs do burst |
| D4 | 6 gates pos-Agent descartam resposta apos mutacao | Critica | lastGet/If DEPOIS do Agent + tool calls |
| D5 | 6 Redis DEL duplicados (um por branch) | Alta (complexidade) | Cada branch limpa independentemente |
| D6 | 36 nodes para debounce | Alta (manutencao) | Duplicacao de logica em cada branch |
| D7 | TOCTOU entre lastGet e DEL | Media | Mensagem pode chegar entre leitura e delete |

### 1.2 Classificador — 4 problemas

| # | Problema | Gravidade | Causa raiz |
|---|---------|-----------|------------|
| C1 | Code9 pega so ultima msg (.slice(-1)[0]) | Alta | Classificador cego para multi-msg |
| C2 | 3 branches mortos no prompt (criar/editar/excluir_limite) | Media | Sem output no Switch |
| C3 | 1 branch morto no Switch (criar_lembrete_agenda output 7) | Baixa | Prompt nao emite mais esse branch |
| C4 | Text Classifier node isolado/nao usado | Baixa | Legado, consome recursos |

### 1.3 Fluxo atual (36 nodes de debounce)

```
Merge1 → pushRedisMessage → Gerar Debounce ID → Set Debounce Owner
  → firstGet ← (ANTES do Wait — snapshot incompleto)
  → Aggregate7 → Redis Chat Memory7
  → Code9 ← (.slice(-1)[0] — so ultima msg)
  → Wait 3s ← (TODA mensagem espera)
  → Get Debounce Owner → Sou o Ultimo?
    → TRUE → Escolher Branch → Switch-Branches1
      → [12 Set nodes] → Aggregate → infos → Redis1
      → lastGet → If17 ← (gate pre-Agent redundante)
      → AI Agent → Code in JavaScript → Switch2
        → [padrao]           lastGet1 → If18 → Redis3 DEL → Send
        → [registrar_gasto]  lastGet2 → If → Redis DEL → action
        →                    lastGet5 → If5 → Redis6 DEL → action
        → [criar_evento]     lastGet3 → If2 → Redis2 DEL → action
        →                    lastGet7 → If9 → Redis8 DEL → action
        → [evento_recorrente] lastGet10 → If22 → Redis10 DEL → action
    → FALSE → No Operation

Nodes de debounce: ~36
Gates pos-Agent: 6 (todos podem descartar resposta apos banco alterado)
Redis DEL nodes: 6 (um por branch)
```

---

## 2. Arquitetura Nova vs Antiga {#2-arquitetura}

### Principio da reescrita

Baseado no estudo de debounce (secao 9 — Side Effects e Idempotencia):

> **Side effects devem acontecer DEPOIS do gate de debounce, NUNCA antes.**
> **O DELETE da lista deve acontecer ANTES do processamento, nao depois.**

### Fluxo novo (9 nodes de debounce)

```
Merge1 → pushRedisMessage ← (com timestamp na msg)
  → Gerar Debounce ID
  → Set Debounce Owner (TTL 15s)
  → Wait 2s ← (reduzido de 3s)
  → Get Debounce Owner
  → Sou o Ultimo?
    → TRUE → firstGet ← (DEPOIS do gate — tem TODAS as msgs)
           → Redis DEL lista ← (UNICO delete, ANTES do processamento)
           → Aggregate7 → Redis Chat Memory7
           → Code9 ← (CORRIGIDO — concatena todas)
           → Escolher Branch ← (CORRIGIDO — prompt atualizado)
           → Switch-Branches1
           → [12 Set nodes] → Aggregate → infos → Redis1
           → AI Agent → Code in JavaScript → Switch2
             → [padrao]           → Send ← (DIRETO, sem gate)
             → [registrar_gasto]  → action ← (DIRETO, sem gate)
             → [criar_evento]     → action ← (DIRETO, sem gate)
             → [evento_recorrente] → action ← (DIRETO, sem gate)
    → FALSE → No Operation

Nodes de debounce: 9
Gates pos-Agent: 0
Redis DEL nodes: 1
```

### Por que funciona

| Preocupacao | Como resolve |
|---|---|
| "E se chega msg durante o Agent?" | A lista ja foi deletada. A nova msg cria uma NOVA lista e novo ciclo de debounce. Nao interfere na execucao atual. |
| "A execucao atual nao perde a nova msg?" | Nao. A execucao atual ja tem todas as msgs capturadas em firstGet (em memoria). A nova msg sera processada por sua propria execucao. |
| "E se duas execucoes passam 'Sou o Ultimo?'?" | Impossivel. O mecanismo owner-based garante que apenas UMA execucao tem o ID correto. |
| "E se o N8N crashar apos o DEL?" | As msgs foram capturadas em firstGet (em memoria da execucao). Se crashar, o usuario manda de novo. O owner key expira em 15s. |
| "E se crashar ANTES do DEL (lista orfao)?" | O pushRedisMessage agora inclui timestamp. Code9 filtra msgs com mais de 60s de idade. |

### Contagem de mudancas

| Acao | Nodes |
|---|---|
| Nodes REMOVIDOS | ~27 (6 lastGet + 7 If + 6 Redis DEL + 6 NoOp + lastGet pre-Agent + If17) |
| Nodes ADICIONADOS | 1 (Redis DEL unico apos firstGet) |
| Nodes MOVIDOS | 1 (firstGet: de antes do Wait para depois do Sou o Ultimo?) |
| Nodes ALTERADOS | 3 (pushRedisMessage, Code9, Escolher Branch) |
| **Saldo** | **-23 nodes** |

---

## PASSO 1 — Reordenar o Debounce {#passo-1}

### 1.1 Mover firstGet para DEPOIS do "Sou o Ultimo?"

**ANTES:**
```
Set Debounce Owner → firstGet → Aggregate7 → Redis Chat Memory7 → Code9 → Wait → Get Debounce Owner → Sou o Ultimo?
```

**DEPOIS:**
```
Set Debounce Owner → Wait → Get Debounce Owner → Sou o Ultimo? [TRUE] → firstGet → Redis DEL → Aggregate7 → Redis Chat Memory7 → Code9
```

**Como fazer:**

1. **Desconectar** a saida de `Set Debounce Owner` do `firstGet`
2. **Conectar** `Set Debounce Owner` → `Wait`
3. **Desconectar** a saida de `Code9` do `Wait`
4. **Conectar** `Sou o Ultimo?` [output 0 TRUE] → `firstGet`
5. **Conectar** `firstGet` → novo node `Redis DEL Lista` (ver 1.3)
6. **Conectar** `Redis DEL Lista` → `Aggregate7`

### 1.2 Alterar pushRedisMessage — Adicionar timestamp

**Node:** pushRedisMessage
**Campo:** messageData

**ANTES:**
```
={"message_user":"{{ $json.mensagem }}"}
```

**DEPOIS:**
```
={"message_user":"{{ $json.mensagem }}","ts":{{ Date.now() }}}
```

Isso permite ao Code9 filtrar mensagens velhas (protecao contra listas orfas).

### 1.3 Criar node "Redis DEL Lista" (unico)

**Tipo:** Redis
**Posicao:** Entre `firstGet` e `Aggregate7`
**Conexao:** firstGet → **Redis DEL Lista** → Aggregate7

**Configuracao:**
```
Operation: Delete
Key:       ={{ $('Evolution API- Take all').item.json.phone }}_debounce
```

Esse eh o UNICO node de delete da lista no workflow inteiro. Todos os outros 6 serao removidos.

### 1.4 Reduzir Wait para 2 segundos

**Node:** Wait
**Campo:** amount

**ANTES:** `3`
**DEPOIS:** `2`

**Justificativa:** O estudo mostra que 2-3s eh o consenso para WhatsApp. 2s captura a maioria dos bursts e economiza 1s de latencia em TODA mensagem. Se necessario, ajustar para 2.5s apos testes.

### 1.5 Reconectar o "Sou o Ultimo?" → firstGet

Atualmente: `Sou o Ultimo?` [TRUE] → `Escolher Branch`
Depois: `Sou o Ultimo?` [TRUE] → `firstGet` → `Redis DEL Lista` → `Aggregate7` → ... → `Code9` → `Escolher Branch`

**Desconectar:** `Sou o Ultimo?` [TRUE] do `Escolher Branch`
**Conectar:** `Sou o Ultimo?` [TRUE] → `firstGet`
**Conectar:** `Code9` → `Escolher Branch` (ja existe essa conexao, manter)

---

## PASSO 2 — Code9 Corrigido (v5) {#passo-2}

Copiar o conteudo INTEIRO do arquivo `code9-corrigido.js` desta mesma pasta.

### Mudancas em relacao ao Code9 atual

**1. Concatenacao de mensagens (fix PF-D2):**

```javascript
// ANTES (v4):
mensagemPrincipal = coletadas.filter(Boolean).slice(-1)[0] ?? '';

// DEPOIS (v5):
const msgsUnicas = coletadas.filter(Boolean);
if (msgsUnicas.length === 1) {
  mensagemPrincipal = msgsUnicas[0];
} else if (msgsUnicas.length > 1) {
  const limitadas = msgsUnicas.slice(-10);
  mensagemPrincipal = limitadas
    .map((msg, i) => `[${i + 1}] ${msg}`)
    .join('\n');
}
```

**2. Filtro de mensagens velhas (protecao contra lista orfa):**

Adicionar no inicio da secao 2 (MENSAGEM ATUAL), dentro do loop `for`:

```javascript
// NOVO — filtrar msgs com mais de 60s (protecao contra lista orfa)
if (Array.isArray(listaDebounce)) {
  for (const v of listaDebounce) {
    // Filtro de idade: ignorar msgs com mais de 60s
    if (typeof v === 'object' && v !== null && v.ts) {
      if (Date.now() - v.ts > 60000) continue;  // msg velha, pular
    } else if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        if (parsed.ts && Date.now() - parsed.ts > 60000) continue;
      } catch {}
    }
    
    const texto = extractMessageText(v);
    if (texto) coletadas.push(texto);
  }
}
```

### Como aplicar

1. Abrir node **Code9** no workflow
2. Selecionar todo (Ctrl+A) → Deletar
3. Colar o conteudo de `code9-corrigido-v5.js` (arquivo nesta pasta)
4. Fechar e salvar

---

## PASSO 3 — Classificador Corrigido {#passo-3}

### 3.1 O que muda no prompt do "Escolher Branch"

**Mudanca 1 — Remover branches mortos:**

Na linha de BRANCHES, remover `criar_limite | editar_limite | excluir_limite`:

**ANTES:**
```
# BRANCHES
criar_gasto | buscar | editar | excluir | criar_limite | editar_limite | excluir_limite | criar_evento_agenda | criar_evento_recorrente | buscar_evento_agenda | editar_evento_agenda | excluir_evento_agenda | gerar_relatorio | padrao
```

**DEPOIS:**
```
# BRANCHES
criar_gasto | buscar | editar | excluir | criar_evento_agenda | criar_evento_recorrente | buscar_evento_agenda | editar_evento_agenda | excluir_evento_agenda | gerar_relatorio | padrao
```

**Mudanca 2 — Regra R8 (limites) redireciona para padrao:**

**ANTES:**
```
## R8 — LIMITES
"criar limite" → criar_limite | "mudar/editar limite" → editar_limite | "remover/excluir limite" → excluir_limite
```

**DEPOIS:**
```
## R8 — LIMITES
Qualquer mensagem sobre limites (criar, editar, remover) → padrao
O Agent tratara via conversa geral.
```

**Mudanca 3 — Nova regra R0 para multi-mensagem:**

Adicionar ANTES de R1 (sera a primeira regra a ser avaliada):

```
## R0 — MULTI-MENSAGEM
Se a mensagem contiver formato "[1] ... [2] ..." (multiplas mensagens do usuario agrupadas):
→ Trate TODAS as mensagens como uma unica intencao.
→ A PRIMEIRA mensagem geralmente contem o verbo/acao principal.
→ As mensagens seguintes complementam, corrigem ou detalham a primeira.
→ Aplique as regras R1-R14 considerando o CONJUNTO COMPLETO de mensagens.

Exemplos:
"[1] muda a reuniao pra 15h [2] a de amanha" → editar_evento_agenda (R6: "muda")
"[1] cancela o dentista [2] o de sexta" → excluir_evento_agenda (R7: "cancela")
"[1] gastei 50 no mercado [2] nao, 60" → criar_gasto (R9: "gastei" + valor)
"[1] cafe com a Ana segunda [2] 15 reais" → criar_evento_agenda (R11: data + valor)
```

### 3.2 Prompt completo corrigido

O prompt corrigido esta no arquivo `prompt-escolher-branch-v2.txt` nesta pasta. Copiar o conteudo inteiro no campo `text` do node `Escolher Branch`.

### 3.3 Como aplicar

1. Abrir node **Escolher Branch** no workflow
2. Clicar em "Define" → campo de prompt
3. Selecionar todo o texto do prompt (Ctrl+A) → Deletar
4. Colar o conteudo de `prompt-escolher-branch-v2.txt`
5. Fechar e salvar

---

## PASSO 4 — Remover Gates Pos-Agent {#passo-4}

### 4.1 Remover lastGet + If17 (pre-Agent)

**ANTES:**
```
Redis1 → lastGet → If17 → AI Agent
                     ↓ (FALSE)
              No Operation, do nothing
```

**DEPOIS:**
```
Redis1 → AI Agent
```

**Como fazer:**
1. Desconectar `Redis1` de `lastGet`
2. Conectar `Redis1` direto ao `AI Agent`
3. Desconectar `lastGet` e `If17` (nao deletar, apenas desconectar)

**Justificativa:** O "Sou o Ultimo?" ja garantiu que somos a unica execucao. A lista ja foi deletada. Nao ha risco de interferencia.

### 4.2 Remover os 6 gates pos-Agent

Para CADA gate, o padrao eh identico: bypass o lastGet e If, conectar direto ao proximo node util.

**Gate 1: padrao (Switch2 output 0)**

ANTES: `Switch2 [0] → lastGet1 → If18 → Redis3 DEL → Send message`
DEPOIS: `Switch2 [0] → Send message`

1. Desconectar Switch2 [output 0] de lastGet1
2. Conectar Switch2 [output 0] direto em Send message

**Gate 2: registrar_gasto single (Switch2 output 1 → If4 TRUE)**

ANTES: `If4 [TRUE] → lastGet2 → If → Redis DEL → HTTP - Create Tool1`
DEPOIS: `If4 [TRUE] → HTTP - Create Tool1`

1. Desconectar If4 [TRUE] de lastGet2
2. Conectar If4 [TRUE] direto em HTTP - Create Tool1

**Gate 3: registrar_gasto batch (Switch2 output 1 → If4 FALSE)**

ANTES: `Aggregate2 → lastGet5 → If5 → Redis6 DEL → Send message1`
DEPOIS: `Aggregate2 → Send message1`

1. Desconectar Aggregate2 de lastGet5
2. Conectar Aggregate2 direto em Send message1

**Gate 4: criar_evento single (Switch2 output 2 → If7 TRUE)**

ANTES: `If7 [TRUE] → lastGet3 → If2 → Redis2 DEL → Buscar Conflitos (Unico)`
DEPOIS: `If7 [TRUE] → Buscar Conflitos (Unico)`

1. Desconectar If7 [TRUE] de lastGet3
2. Conectar If7 [TRUE] direto em Buscar Conflitos (Unico)

**Gate 5: criar_evento batch (Switch2 output 2 → If7 FALSE)**

ANTES: `Aggregate5 → lastGet7 → If9 → Redis8 DEL → Set Range (Batch)`
DEPOIS: `Aggregate5 → Set Range (Batch)`

Nota: If9 ja estava DISABLED. Mesmo assim, remover os nodes intermediarios.

1. Desconectar Aggregate5 de lastGet7
2. Conectar Aggregate5 direto em Set Range (Batch)

**Gate 6: evento_recorrente (Switch2 output 3)**

ANTES: `Switch2 [3] → lastGet10 → If22 → Redis10 DEL → HTTP - Create Calendar Tool3`
DEPOIS: `Switch2 [3] → HTTP - Create Calendar Tool3`

1. Desconectar Switch2 [output 3] de lastGet10
2. Conectar Switch2 [output 3] direto em HTTP - Create Calendar Tool3

---

## PASSO 5 — Limpar Nodes Orfaos {#passo-5}

Apos os passos 1-4, estes nodes estarao desconectados. NAO DELETAR — apenas confirmar que estao isolados (sem conexoes). Isso permite reverter facilmente se necessario.

### Nodes orfaos (27 total)

**lastGet (7):**
- lastGet (pre-Agent)
- lastGet1 (padrao)
- lastGet2 (gasto single)
- lastGet3 (evento single)
- lastGet5 (gasto batch)
- lastGet7 (evento batch)
- lastGet10 (recorrente)

**If gates (7):**
- If17 (pre-Agent)
- If18 (padrao)
- If (gasto single)
- If2 (evento single)
- If5 (gasto batch)
- If9 (evento batch — ja disabled)
- If22 (recorrente)

**Redis DEL (6):**
- Redis (gasto single)
- Redis2 (evento single)
- Redis3 (padrao)
- Redis6 (gasto batch)
- Redis8 (evento batch)
- Redis10 (recorrente)

**No Operation (7):**
- No Operation, do nothing (If17 false)
- No Operation, do nothing1 (If18 false)
- No Operation, do nothing3 (If false)
- No Operation, do nothing4 (If2 false)
- No Operation, do nothing6 (If5 false)
- No Operation, do nothing8 (If9 false)
- No Operation, do nothing11 (If22 false)

**Legado (2):**
- Text Classifier (node isolado, nunca conectado)
- OpenAI Chat Model1 (alimentava o Text Classifier)

---

## Mapa Visual Antes vs Depois {#mapa-visual}

### ANTES (simplificado)

```
MSG → push → ID → Owner → firstGet → Code9 → Wait 3s → Owner? → Sou o Ultimo?
  │                  ↑                                              │
  │            (snapshot ANTES                                      │
  │             do Wait)                                     TRUE   │   FALSE
  │                                                           │     │
  │                                                           ↓     ↓
  │                                                     Classificar  STOP
  │                                                           │
  │                                                      AI Agent
  │                                                           │
  │                                                       Switch2
  │                                                      /  |  |  \
  │                                                     /   |  |   \
  │                                              padrao  gasto evt  recorr
  │                                                │     │    │     │
  │                                            lastGet1 lG2  lG3  lG10
  │                                                │     │    │     │
  │                                              If18   If   If2   If22
  │                                              / \   / \  / \   / \
  │                                            T   F T   F T  F  T   F
  │                                            │   │ │   │ │  │  │   │
  │                                          DEL  ✗ DEL ✗ DEL ✗ DEL  ✗
  │                                            │     │     │     │
  │                                          Send  Tool  Cal   Cal
```

### DEPOIS

```
MSG → push → ID → Owner → Wait 2s → Owner? → Sou o Ultimo?
                                                    │
                                             TRUE   │   FALSE
                                               │    │
                                               ↓    ↓
                                          firstGet  STOP
                                               │
                                          DEL lista  ← (UNICO delete, ANTES do processamento)
                                               │
                                          Aggregate7 → ChatMem → Code9
                                               │
                                         Classificar
                                               │
                                          AI Agent
                                               │
                                           Switch2
                                          /  |  |  \
                                         /   |  |   \
                                  padrao  gasto evt  recorr
                                     │     │    │     │
                                   Send  Tool  Cal   Cal  ← (DIRETO, sem gate)
```

**Diferenca visual:**
- O "funil" inferior (6 lastGet → 6 If → 6 DEL) desapareceu
- O firstGet moveu para DEPOIS do gate (captura TUDO)
- Um unico DEL ANTES do processamento
- Cada branch vai DIRETO para sua acao

---

## Testes de Validacao {#testes}

### Teste 1: Mensagem unica (regressao basica)

```
Enviar: "qual minha agenda de amanha?"
```

Esperado: Resposta normal em ~4-5s (2s wait + 2-3s Agent)
Verificar: Classificado como `buscar_evento_agenda`, resposta com eventos do dia

### Teste 2: Duas mensagens rapidas (debounce basico)

```
t=0s: "reuniao amanha 10h"
t=1s: "com o Joao"
```

Esperado:
- Exec1 perde "Sou o Ultimo?" (owner sobrescrito) → STOP
- Exec2 ganha, firstGet tem [msg1, msg2]
- Code9: `"[1] reuniao amanha 10h [2] com o Joao"`
- Classificador: `criar_evento_agenda`
- Agent cria evento "reuniao com o Joao" amanha 10h

### Teste 3: Edicao fragmentada (fix PF-D2)

```
t=0s: "muda a reuniao pra 16h"
t=1s: "a de amanha"
```

Esperado:
- Code9: `"[1] muda a reuniao pra 16h [2] a de amanha"`
- Classificador: `editar_evento_agenda` (R6: "muda")
- Agent edita o evento

### Teste 4: Mensagem durante processamento do Agent (fix PF-D1)

```
t=0s: "muda o dentista de segunda pra terca"
(esperar 5-6s enquanto Agent processa)
t=6s: "obrigado"
```

Esperado:
- Exec1: ganha "Sou o Ultimo?", firstGet=[msg1], DEL lista, Agent edita, RESPONDE "Prontinho!"
- Exec2: push "obrigado" em NOVA lista (a antiga foi deletada), ganha seu proprio ciclo
- Exec2: firstGet=["obrigado"], classificado como `padrao`, Agent responde "De nada!"
- **AMBAS as respostas chegam ao usuario** (sem descarte)

### Teste 5: Tres mensagens rapidas (debounce com burst)

```
t=0.0s: "oi"
t=0.5s: "tudo bem?"
t=1.0s: "me adiciona reuniao amanha 14h"
```

Esperado:
- Exec1 e Exec2 perdem "Sou o Ultimo?" → STOP
- Exec3: firstGet tem todas as 3 msgs
- Code9: `"[1] oi [2] tudo bem? [3] me adiciona reuniao amanha 14h"`
- Classificador: `criar_evento_agenda` (R11: data/hora na msg 3)

### Teste 6: Exclusao por negacao (classificador robusto)

```
t=0s: "nao vou mais no dentista"
t=1s: "sexta"
```

Esperado:
- Code9: `"[1] nao vou mais no dentista [2] sexta"`
- Classificador: `excluir_evento_agenda` (R7: "nao vou mais")

### Teste 7: Gasto com correcao

```
t=0s: "gastei 50 no mercado"
t=1s: "nao, 60"
```

Esperado:
- Code9: `"[1] gastei 50 no mercado [2] nao, 60"`
- Classificador: `criar_gasto` (R9: "gastei" + valor)
- Agent registra 60 (a correcao)

### Teste 8: Latencia de mensagem unica

Medir tempo entre envio e resposta para uma mensagem simples:
```
Enviar: "oi"
```

**Antes:** ~6-9s (3s wait + 3-6s processamento)
**Depois:** ~4-7s (2s wait + 2-5s processamento)
**Melhoria:** ~2s de reducao

---

## Checklist Final {#checklist}

### Pre-requisitos

- [ ] Backup do workflow atual (Menu → Download → salvar JSON)
- [ ] Anotar o webhook URL atual (nao mudar)
- [ ] Ter acesso ao N8N DEV

### Aplicacao

**PASSO 1 — Reordenar debounce:**
- [ ] Desconectar `Set Debounce Owner` → `firstGet`
- [ ] Conectar `Set Debounce Owner` → `Wait`
- [ ] Desconectar `Code9` → `Wait`
- [ ] Conectar `Sou o Ultimo?` [TRUE] → `firstGet` (em vez de Escolher Branch)
- [ ] Criar node `Redis DEL Lista` (operation: delete, key: {phone}_debounce)
- [ ] Conectar `firstGet` → `Redis DEL Lista` → `Aggregate7`
- [ ] Conectar `Code9` → `Escolher Branch`
- [ ] Alterar pushRedisMessage: adicionar `,"ts":{{ Date.now() }}` no messageData
- [ ] Alterar Wait: amount de 3 para 2

**PASSO 2 — Code9:**
- [ ] Substituir codigo do Code9 por `code9-corrigido-v5.js`

**PASSO 3 — Classificador:**
- [ ] Substituir prompt do Escolher Branch por `prompt-escolher-branch-v2.txt`

**PASSO 4 — Remover gates pos-Agent:**
- [ ] Gate 1 (padrao): Switch2[0] → Send message (bypass lastGet1 + If18 + Redis3)
- [ ] Gate 2 (gasto single): If4[TRUE] → HTTP Create Tool1 (bypass lastGet2 + If + Redis)
- [ ] Gate 3 (gasto batch): Aggregate2 → Send message1 (bypass lastGet5 + If5 + Redis6)
- [ ] Gate 4 (evento single): If7[TRUE] → Buscar Conflitos (bypass lastGet3 + If2 + Redis2)
- [ ] Gate 5 (evento batch): Aggregate5 → Set Range Batch (bypass lastGet7 + If9 + Redis8)
- [ ] Gate 6 (recorrente): Switch2[3] → HTTP Create Calendar Tool3 (bypass lastGet10 + If22 + Redis10)
- [ ] Remover lastGet + If17 pre-Agent: Redis1 → AI Agent direto

**PASSO 5 — Limpeza:**
- [ ] Verificar que todos os 27 nodes orfaos estao desconectados
- [ ] Salvar workflow

### Validacao

- [ ] Teste 1: Mensagem unica — resposta normal
- [ ] Teste 2: Duas msgs rapidas — debounce funciona
- [ ] Teste 3: Edicao fragmentada — classificador correto
- [ ] Teste 4: Msg durante Agent — AMBAS respostas chegam
- [ ] Teste 5: Tres msgs rapidas — burst agrupado
- [ ] Teste 6: Exclusao por negacao — classificador correto
- [ ] Teste 7: Gasto com correcao — classificador correto
- [ ] Teste 8: Latencia — ~2s mais rapido que antes
