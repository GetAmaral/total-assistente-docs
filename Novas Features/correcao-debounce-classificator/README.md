# Correcao Debounce + Classificador — Premium Main

**Data:** 2026-04-04
**Workflow:** Premium Main (`tyJ3YAAtSg1UurFj`)
**Bugs:** PF-D1 (resposta descartada apos mutacao no banco) + PF-D2 (classificador recebe apenas ultima msg)
**Base:** Analise completa do fluxo de edicao 2026-04-03

---

## Resumo dos 2 Bugs

### PF-D1: Resposta descartada DEPOIS do banco ser alterado

O workflow tem um debounce pos-Agent em CADA branch. Apos o AI Agent chamar uma tool (editar_eventos, editar_financeiro), o banco ja foi alterado. Mas o check `lastGetN.length == firstGet.length` ainda pode falhar se o usuario enviou qualquer mensagem durante o processamento.

**Nodes envolvidos:**

| Branch | lastGet | If (gate) | Resultado se FALSE |
|--------|---------|-----------|-------------------|
| padrao | lastGet1 | If18 | resposta engolida |
| registrar_gasto (single) | lastGet2 | If | resposta engolida |
| registrar_gasto (batch) | lastGet5 | If5 | resposta engolida |
| criar_evento (single) | lastGet3 | If2 | resposta engolida |
| criar_evento (batch) | lastGet7 | If9 (DISABLED) | — |
| evento_recorrente | lastGet10 | If22 | resposta engolida |

**Timeline do problema:**
```
t=0s   Msg "muda reuniao pra 16h" → PUSH (lista=1), firstGet.length=1
t=3s   "Sou o Ultimo?" → TRUE (mecanismo owner OK)
t=3s   Agent chama editar_eventos → UPDATE Supabase + PATCH Google ← IRREVERSIVEL
t=6s   Agent gera "Prontinho!" → Switch2 → padrao → lastGet1
t=6s   Usuario manda "ok" → PUSH (lista=2)
t=6s   If18: lastGet1.length(2) != firstGet.length(1) → FALSE → DESCARTA
```

**O banco foi alterado, mas o usuario nao recebe confirmacao.**

### PF-D2: Classificador recebe apenas a ultima mensagem

O Code9 usa `.slice(-1)[0]` para extrair `mensagem_principal`. Se o usuario mandou 2 mensagens rapidas:
```
"muda a reuniao pra 15h"   ← PERDIDA para o classificador
"ah nao, pra 16h"          ← unica que o classificador ve
```

O classificador recebe "ah nao, pra 16h" sem contexto → pode classificar como `padrao` ou `financeiro` em vez de `editar_evento_agenda`.

**NOTA:** O AI Agent recebe todas as mensagens (via `$json.Lista.join(', ')`), mas se o CLASSIFICADOR errar o branch, o Agent recebe instrucoes erradas.

---

## Arquivos nesta pasta

| Arquivo | O que eh | Como usar |
|---------|----------|-----------|
| `PASSO-1-CODE9-FIX.md` | Codigo corrigido do Code9 | Copiar JS inteiro no node Code9 |
| `PASSO-2-REMOVER-LASTGET-GATES.md` | Instrucoes para remover/alterar os gates pos-Agent | Reconectar nodes no canvas |
| `code9-corrigido.js` | JS puro do Code9 (ctrl+c ctrl+v) | Colar no editor do Code9 |
| `ANALISE-COMPLETA.md` | Analise tecnica profunda dos 2 bugs | Referencia |

---

## Ordem de Aplicacao

```
1. BACKUP do workflow atual (Menu → Download)
2. Aplicar PASSO 1 — Code9 fix (classificador recebe todas as mensagens)
3. Aplicar PASSO 2 — Remover gates pos-Agent (resposta nunca descartada apos mutacao)
4. Salvar
5. Testar com cenarios da secao "Testes" abaixo
```

---

## Testes de Validacao

### Teste PF-D2 (classificador)

Enviar 2 mensagens rapidas (intervalo < 3s):
```
MSG1: "muda a reuniao de amanha pra 16h"
MSG2: "a das 15h"
```

**Esperado:** Classificador recebe contexto completo → branch `editar_evento_agenda`
**Antes do fix:** Classificador recebia apenas "a das 15h" → branch `padrao`

### Teste PF-D1 (resposta pos-mutacao)

Enviar mensagem de edicao e em seguida outra msg enquanto processa:
```
MSG1: "muda o dentista de segunda pra terca"
(esperar 4-5s, enquanto processa)
MSG2: "obrigado"
```

**Esperado:** Recebe confirmacao da edicao ("Prontinho!") + nova execucao processa "obrigado"
**Antes do fix:** Confirmacao da edicao engolida, "obrigado" processado sem contexto

### Teste regressao (debounce basico)

Enviar mensagem unica:
```
MSG1: "qual minha agenda de amanha?"
```

**Esperado:** Resposta normal, sem mudanca de comportamento

---

## Riscos e Mitigacao

| Risco | Mitigacao |
|-------|----------|
| Sem gate pos-Agent, usuario recebe resposta de execucao "velha" | O mecanismo "Sou o Ultimo?" ja garante que so a ultima execucao processa. O gate pos-Agent era redundante e destrutivo |
| Code9 concatenar msgs pode confundir classificador | Msgs sao concatenadas com `\n` (uma por linha), com prefixo `[1]`, `[2]`. Classificador recebe contexto claro |
| Multi-msg pode gerar prompt longo | Limitado a 10 mensagens max no Code9 corrigido |
