# Analise Tecnica Completa — PF-D1 e PF-D2

**Data:** 2026-04-04
**Metodo:** Leitura direta do workflow N8N via SSH read-only (docker exec n8n export:workflow)
**Workflow:** Premium Main (tyJ3YAAtSg1UurFj) — 257KB, atualizado 2026-04-03

---

## 1. Arquitetura Real do Debounce

O documento de analise de 2026-04-03 descrevia 3 gates (If19, If17, If18). O workflow real tem uma arquitetura DIFERENTE — sao 2 mecanismos independentes em serie:

### Mecanismo A: "Sou o Ultimo?" (Owner-based)

```
Mensagem chega
  → pushRedisMessage          PUSH em {phone}_debounce
  → Gerar Debounce ID         timestamp + random (ex: "1743782400000_a8f3k2")
  → Set Debounce Owner        SET {phone}_debounce_owner = debounce_id (TTL: 15s)
  → firstGet                  GET {phone}_debounce (snapshot da lista)
  → Code9                     Extrai mensagem + historico
  → Wait                      3 SEGUNDOS
  → Get Debounce Owner        GET {phone}_debounce_owner
  → Sou o Ultimo?             debounce_owner == MEU debounce_id?
      TRUE  → processa (classificador → Agent → resposta)
      FALSE → No Operation (morre)
```

**Funciona bem.** O ultimo a escrever no `_debounce_owner` ganha. TTL de 15s garante cleanup.

### Mecanismo B: lastGet vs firstGet (pos-processamento)

APOS o Agent executar (incluindo tool calls que alteram o banco), cada branch faz:

```
lastGetN → IfN: lastGetN.Lista.length == firstGet.Lista.length?
  TRUE  → Redis DELETE + enviar resposta
  FALSE → No Operation (resposta ENGOLIDA)
```

**6 instancias deste padrao:**

| Branch | lastGet | If | Delete |
|--------|---------|-----|--------|
| padrao | lastGet1 | If18 | Redis3 |
| registrar_gasto single | lastGet2 | If | Redis |
| registrar_gasto batch | lastGet5 | If5 | Redis6 |
| criar_evento single | lastGet3 | If2 | Redis2 |
| criar_evento batch | lastGet7 | If9 (DISABLED) | Redis8 |
| evento_recorrente | lastGet10 | If22 | Redis10 |

---

## 2. PF-D1: Race Condition Pos-Agent

### O problema fundamental

O Mecanismo A protege a janela de 3 segundos do Wait. Mas o processamento do Agent (classificacao + LLM + tool call + webhook externo) leva 3-10 segundos ADICIONAIS. Qualquer mensagem nessa janela:

- Passa pelo "Sou o Ultimo?" da propria execucao (eh a mais recente, ganha)
- MAS tambem invalida o firstGet da execucao anterior que JA ESTA NO AGENT

```
Exec 1 (edicao):  [PUSH][firstGet=1][Wait 3s][Owner ✓][Agent 5s][lastGet1] ← length=2!
Exec 2 (ok):                                                [PUSH=2][Wait 3s][Owner ✓]
                                                              ↑
                                                        Este PUSH invalida
                                                        o lastGet da Exec 1
```

### Por que eh especialmente grave para edicoes

Para `padrao` (texto): perder a resposta eh ruim mas toleravel — nada foi alterado no banco.

Para edicoes: a tool ja executou via HTTP Request:
- `editar_eventos` → webhook /editar-eventos → Calendar WebHooks → UPDATE Supabase + PATCH Google
- `editar_financeiro` → webhook /editar-supabase → UPDATE Supabase

Nao ha rollback. O banco mudou, mas o usuario nao sabe.

### Detalhe critico: edicoes caem em `padrao`

O Switch2 roteia por `parsed_output.acao`. Quando o Agent faz uma edicao, a `acao` no output geralmente eh `"padrao"` (porque edicao nao tem branch proprio no Switch2 — so `registrar_gasto`, `criar_evento`, `evento_recorrente` tem).

Entao edicoes passam pelo MESMO path de respostas de texto simples → lastGet1 → If18.

### Evidencia do workflow

Saidas do Switch2 confirmadas:
- Output 0: `padrao` → lastGet1 → If18 (TODAS as respostas de texto, incluindo confirmacoes de edicao)
- Output 1: `registrar_gasto` → If4 → lastGet2/lastGet5
- Output 2: `criar_evento` → If7 → lastGet3/lastGet7
- Output 3: `evento_recorrente` → lastGet10 → If22

---

## 3. PF-D2: Classificador Cego

### Codigo real do Code9 (secao 2)

```javascript
// Trecho real extraido do workflow
const coletadas = [];

if (Array.isArray(listaDebounce)) {
  for (const v of listaDebounce) {
    const texto = extractMessageText(v);
    if (texto) coletadas.push(texto);
  }
}

mensagemPrincipal = coletadas.filter(Boolean).slice(-1)[0] ?? '';
```

`.slice(-1)[0]` → apenas a ULTIMA mensagem.

### Onde mensagemPrincipal eh usada

```javascript
// Code9, secao 3
mensagemFinal += `Mensagem principal do usuario: ${mensagemPrincipal}`;
```

`mensagemFinal` alimenta o **"Escolher Branch"** (Chain LLM, gpt-4.1-mini). Eh o UNICO input do classificador.

### O Agent recebe tudo — mas nao importa

O input `text` do AI Agent:
```javascript
$json.Lista.map(i => { /* extract */ })
  .filter(t => t.length)
  .filter((v,i,a) => a.indexOf(v) === i)  // deduplica
  .join(', ')                              // TODAS as msgs
```

O Agent VE todas as mensagens. MAS se o classificador errou o branch, o Agent:
- Pode nao receber as instrucoes especificas de edicao
- Pode estar no branch `padrao` em vez de `editar_evento_agenda`
- Ainda pode chamar a tool certa (GPT-5.4-mini eh inteligente), mas sem garantia

### Cenario real

```
t=0s  "muda a reuniao de amanha pras 15h"   → PUSH (lista=1)
t=1s  "a das 14h com o Joao"                → PUSH (lista=2)

Exec 2 ganha "Sou o Ultimo?"
Code9: coletadas = ["muda a reuniao...", "a das 14h com o Joao"]
       .slice(-1)[0] = "a das 14h com o Joao"

Classificador recebe: "Mensagem principal do usuario: a das 14h com o Joao"
  → Sem "muda"/"editar" → pode ir para padrao ou criar_evento (em vez de editar)
  → Rota ERRADA

Agent recebe: "muda a reuniao de amanha pras 15h, a das 14h com o Joao"
  → Entende, mas esta no branch errado
```

---

## 4. Interacao entre PF-D1 e PF-D2 — Cascata

Os bugs se amplificam:

```
t=0.0s  "muda a reuniao de amanha pras 15h"   → PUSH (lista=1)
t=0.8s  "na verdade pra 16h"                  → PUSH (lista=2)

Exec 1: "Sou o Ultimo?" → FALSE → MORRE (correto, Mecanismo A funciona)

Exec 2: "Sou o Ultimo?" → TRUE
  Code9: .slice(-1)[0] = "na verdade pra 16h"         ← PF-D2
  Classificador: "padrao" (sem contexto de agenda)     ← ROTA ERRADA
  Agent: recebe tudo, tenta editar mesmo assim
  Agent chama editar_eventos → banco alterado           ← SIDE-EFFECT
  Switch2 → padrao → lastGet1 → If18

  t=7.0s  Usuario manda "?" (impaciente)               → PUSH (lista=3)
  If18: length 3 != 2 → FALSE                          ← PF-D1
  Resposta ENGOLIDA

  Exec 3 processa "?" isolado → resposta generica
  Usuario: confuso, nao sabe se edicao funcionou
```

---

## 5. Nodes completos encontrados no workflow

### Redis nodes do debounce (14 total)

| Node | Operacao | Key | Funcao |
|------|----------|-----|--------|
| pushRedisMessage | PUSH | {phone}_debounce | Adiciona msg a lista |
| Set Debounce Owner | SET (TTL 15s) | {phone}_debounce_owner | Registra owner |
| firstGet | GET | {phone}_debounce | Snapshot da lista |
| Get Debounce Owner | GET | {phone}_debounce_owner | Le owner atual |
| lastGet | GET | {phone}_debounce | Pre-Agent (branch infos) |
| lastGet1 | GET | {phone}_debounce | Pos-Agent (padrao) |
| lastGet2 | GET | {phone}_debounce | Pos-Agent (gasto single) |
| lastGet3 | GET | {phone}_debounce | Pos-Agent (evento single) |
| lastGet5 | GET | {phone}_debounce | Pos-Agent (gasto batch) |
| lastGet7 | GET | {phone}_debounce | Pos-Agent (evento batch) |
| lastGet10 | GET | {phone}_debounce | Pos-Agent (recorrente) |
| Redis3/Redis/Redis2/Redis6/Redis8/Redis10 | DELETE | {phone}_debounce | Cleanup pos-resposta |

### If nodes do debounce (8 total)

| Node | Condicao | Posicao |
|------|----------|---------|
| Sou o Ultimo? | debounce_owner == debounce_id | Pre-processamento (Mecanismo A) |
| If17 | lastGet.length == firstGet.length | Pre-Agent (branch infos) |
| If18 | lastGet1.length == firstGet.length | Pos-Agent (padrao) |
| If | lastGet2.length == firstGet.length AND itemIndex==0 | Pos-Agent (gasto single) |
| If5 | lastGet5.length == firstGet.length AND itemIndex==0 | Pos-Agent (gasto batch) |
| If2 | lastGet3.length == firstGet.length AND itemIndex==0 | Pos-Agent (evento single) |
| If9 | lastGet7.length == firstGet.length (DISABLED) | Pos-Agent (evento batch) |
| If22 | lastGet10.length == firstGet.length AND itemIndex==0 | Pos-Agent (recorrente) |

---

## 6. Diagnostico final

| Aspecto | Mecanismo A (Sou o Ultimo?) | Mecanismo B (lastGet vs firstGet) |
|---------|------------------------------|-----------------------------------|
| Quando age | Pre-processamento (apos 3s wait) | Pos-processamento (apos Agent + tools) |
| Como decide | Owner ID match | List length comparison |
| Side-effects ao descartar | Nenhum | Banco JA alterado, Google JA patcheado |
| TTL | 15s no owner key | Nenhum na lista (so DELETE explicito) |
| Efetividade | Alta (resolve 90% dos casos) | DESTRUTIVA (descarta trabalho feito) |

**O Mecanismo A eh bem desenhado. O Mecanismo B eh o problema.** Ele foi adicionado como "safety net" para mensagens que chegam durante o processamento do Agent, mas cria um cenario pior do que o que tenta prevenir.

**Correcao:** Remover o Mecanismo B (gates pos-Agent), manter o Mecanismo A (owner-based) + If17 (pre-Agent). Corrigir Code9 para concatenar todas as mensagens.
