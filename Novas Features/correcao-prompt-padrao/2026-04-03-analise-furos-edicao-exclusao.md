# Análise de Furos e Falhas — Edição e Exclusão (Gastos + Agenda)

**Data:** 2026-04-03  
**Fonte:** Leitura direta dos workflows N8N (Premium Main, Calendar WebHooks, Financeiro Total)  
**Escopo:** Fluxos de edição e exclusão para gastos financeiros e eventos de agenda

---

## ARQUITETURA COMPARTILHADA (CONTEXTO)

Todos os fluxos (editar gasto, excluir gasto, editar agenda, excluir agenda) compartilham o **mesmo AI Agent** (GPT-4.1-mini). O Agent tem acesso simultâneo a **8 tools**:

| Tool | Função |
|------|--------|
| `buscar_financeiro` | Busca gastos |
| `editar_financeiro` | Edita gastos |
| `excluir_financeiro` | Exclui gastos |
| `buscar_eventos` | Busca eventos agenda |
| `editar_eventos` | Busca + edita eventos |
| `excluir_evento` | Exclui evento |
| `gerar_relatorio` | Gera relatório |
| `Think` | Raciocínio interno |

O que diferencia o comportamento é o **prompt injetado dinamicamente** via `$('Aggregate').item.json.data[0].prompt`. Cada branch (editar_gasto, excluir, editar_evento_agenda, excluir_evento_agenda) seta um prompt diferente. Mas o Agent sempre VÊ todas as 8 tools.

---

## FALHA ARQUITETURAL #1 — AGENT ÚNICO COM TODAS AS TOOLS

**Problema:** O Agent de edição de gastos tem acesso a `excluir_evento`, `buscar_eventos`, `gerar_relatorio`, etc. O Agent de exclusão de agenda tem acesso a `editar_financeiro`, `excluir_financeiro`, etc.

**Risco:** O LLM pode chamar a tool ERRADA. Se o usuário mandar "exclui o gasto do mercado" e o classificador acertar `excluir`, o prompt de exclusão financeira é injetado — mas o Agent pode decidir chamar `excluir_evento` em vez de `excluir_financeiro` se a mensagem for ambígua.

**Evidência real:** Na bateria de testes, T7 (debounce) mostrou que gasto virou evento de agenda. O Agent viu as duas mensagens no Redis e usou a tool de agenda em vez da financeira.

**Severidade:** ALTA  
**Onde corrigir:** Idealmente, separar em Agents distintos por domínio (financeiro vs agenda), cada um com apenas suas tools. Alternativa: adicionar instruções explícitas no prompt "Use APENAS as tools: X, Y" para cada branch.

---

## FALHA ARQUITETURAL #2 — SWITCH2 PÓS-AGENT NÃO DISTINGUE OPERAÇÃO

O `Switch2` após o AI Agent roteia por `parsed_output.acao`:

| Output | Ação | Destino |
|--------|------|---------|
| 0 | `registrar_gasto` | lastGet1 |
| 1 | `criar_evento` | If4 |
| 2 | `evento_recorrente` | Code in JavaScript1 |
| 3 | (default/fallback) | lastGet10 |

**Problema:** TODA edição e TODA exclusão (gastos e agenda) retorna `acao: "padrao"`, que cai no **output 3 (default)**. Não há como o workflow distinguir se a operação foi edição, exclusão, busca ou conversa geral após o Agent responder.

**Impacto:** Impossível adicionar lógica pós-Agent diferenciada (ex: validação, log, notificação) porque todas as operações saem pelo mesmo caminho.

---

## EDIÇÃO DE GASTOS — FUROS ENCONTRADOS

### FURO EG-1: Edição parcial DESTRÓI campos não enviados (CRÍTICO)

**O que acontece:**

O `Update a row` no sub-workflow Financeiro sempre envia TODOS os 6 campos:

```
name_spent     = body.novo_nome        (pode ser "" ou undefined)
value_spent    = body.novo_valor        (pode ser "" ou undefined)
date_spent     = body.nova_data         (pode ser "" ou undefined)
category_spent = body.nova_categoria    (pode ser "" ou undefined)
type_spent     = body.novo_tipo         (pode ser "" ou undefined)
transaction_type = body.entra_sai       (pode ser "" ou undefined)
```

Se o usuário diz "muda o nome do gasto do mercado pra supermercado", o Agent envia:
- `novo_nome: "Supermercado"` ✅
- `novo_valor: ""` — sobrescreve valor com VAZIO ❌
- `nova_data: ""` — sobrescreve data com VAZIO ❌
- `nova_categoria: ""` — sobrescreve categoria com VAZIO ❌
- `novo_tipo: ""` — sobrescreve tipo com VAZIO ❌
- `entra_sai: ""` — sobrescreve tipo de transação com VAZIO ❌

**Resultado:** O gasto perde valor, data, categoria e tipo. Dados corrompidos.

**Contraste com agenda:** No Calendar WebHooks, o `Edit Fields5` usa `|| valor_original` como fallback (que tem seu próprio bug, mas ao menos tenta preservar dados). No Financeiro, NÃO existe fallback nenhum.

**Correção:** O `Update a row` precisa filtrar campos vazios/undefined antes do UPDATE. Ou: o `Code3` equivalente (que não existe no Financeiro) precisa ser adicionado para fazer merge seletivo.

---

### FURO EG-2: Zero validação de dados (ALTO)

**O que acontece:**

O fluxo de **registrar** gasto passa por um `Information Extractor2` (AI) que normaliza categoria, tipo, nome. O fluxo de **editar** NÃO tem normalização nenhuma.

| Campo | Registrar | Editar |
|-------|-----------|--------|
| Categoria | Normalizada (alimentacao, transporte, etc.) | Qualquer string aceita |
| Tipo | Normalizado (fixo, variavel, etc.) | Qualquer string aceita |
| Valor | Parseado como número | Aceita string, negativo, vazio |
| Data | Formatada | Aceita qualquer formato |
| Nome | Capitalizado | Aceita qualquer string |

**Risco:** O usuário pode acabar com categorias inconsistentes (ex: "alimentação" vs "Alimentação" vs "comida" vs "food") porque a edição não normaliza.

**Correção:** Adicionar a mesma normalização do `Information Extractor2` antes do `Update a row` na edição.

---

### FURO EG-3: If4 sem saída false — timeout silencioso (MÉDIO)

O `If4` (validação de ownership) só tem a saída `true` conectada ao `Update a row`. A saída `false` não está conectada a nada.

**Resultado:** Se o gasto não pertence ao usuário, o webhook simplesmente não responde. O AI Agent fica esperando até timeout. O usuário não recebe feedback.

**Correção:** Conectar a saída `false` do `If4` a um node que retorne erro JSON (ex: `{"erro": "registro não encontrado"}`).

---

### FURO EG-4: Busca inicial sem filtro de user (BAIXO)

O `Get a row4` busca o gasto apenas por `id_spent`, sem filtrar por `fk_user`. Isso carrega dados de outro usuário na memória antes do `If4` verificar ownership.

**Risco:** Baixo (o `If4` depois valida), mas em um cenário de exploit, alguém poderia forçar o Agent a chamar `editar_financeiro` com um `id_gasto` de outro usuário. O Agent receberia os dados do gasto alheio no retorno do `Get a row4` antes do filtro.

---

## EXCLUSÃO DE GASTOS — FUROS ENCONTRADOS

### FURO XG-1: Hard delete sem recovery (ALTO)

O `Delete a row` faz DELETE real na tabela `spent`. O registro desaparece permanentemente.

- Não existe coluna `deleted_at` ou `is_deleted`
- Não existe log da exclusão
- Não existe backup ou trash

**Risco:** Usuário exclui gasto acidentalmente → perda permanente de dado financeiro.

---

### FURO XG-2: Sem confirmação para 1-2 gastos (ALTO)

O prompt do `excluir2` diz:
- 1 resultado → exclui direto, apenas informa
- Vários → tenta desempatar, se ambíguo pergunta qual
- 3+ → lista e pede confirmação (regra geral do systemMessage)

**Risco:** O usuário diz "apaga o gasto do uber" e o Agent encontra 1 resultado → exclui IMEDIATAMENTE sem pedir confirmação. Se era o gasto errado, não há como reverter (hard delete).

**Contraste com agenda:** O prompt de exclusão de agenda (`prompt_excluir`) é mais cauteloso — para lotes usa "Confirma excluir N eventos?" antes de excluir.

---

### FURO XG-3: Sem validação pós-exclusão (MÉDIO)

O prompt de exclusão de GASTOS NÃO instrui o Agent a re-buscar para confirmar que o gasto foi de fato excluído.

**Contraste com agenda:** O prompt de exclusão de AGENDA instrui: "VERIFICAÇÃO PÓS-EXCLUSÃO: Após excluir, chamar buscar_eventos novamente para confirmar."

**Risco:** O Agent pode confirmar exclusão mesmo que o DELETE tenha falhado silenciosamente.

---

### FURO XG-4: Dois caminhos de exclusão sem paridade (BAIXO)

Exclusão pode acontecer por:
1. **Texto livre** → AI Agent → tool `excluir_financeiro`
2. **Botão** (`fin_del_<id>`) → HTTP Request direto → sem Agent

O caminho por botão NÃO tem nenhuma das proteções do Agent (busca antes, desempate, confirmação). Ele dispara o DELETE direto com o ID do botão.

---

## EDIÇÃO DE AGENDA — FUROS ENCONTRADOS

### FURO EA-1: end_event não acompanha start_event (CRÍTICO)

Já documentado no mega estudo, mas agora com causa raiz EXATA:

**Edit Fields5** no Calendar WebHooks:
```javascript
novo_fim = body.novo_fim_evento || output[0].fim_evento
```

O `||` em JavaScript trata `""` como falsy. Quando `novo_fim_evento = ""`:
1. Edit Fields5 faz fallback para `fim_evento` original ✅ (se Information Extractor retornou corretamente)
2. Mas o `Code3` permite `""` passar (filtra null/undefined, NÃO filtra `""`)
3. Se por qualquer razão o fallback falhar, `""` chega ao Supabase

**Cenário real comprovado nos testes:**
- MOD-Q1: start=15:00, end=14:30 (end ANTES do start)
- MOD-C2: start=dia 10, end=dia 5 (5 dias de diferença)

**O prompt `prompt_editar1` tem "REGRA DE DURAÇÃO":**
> "User informa APENAS novo início: preservar D. novo_fim = novo_inicio + D. Se D desconhecida → +30min."

Mas essa regra depende do LLM calcular e enviar `novo_fim_evento`. Quando o LLM não calcula, envia `""`, e o backend não compensa.

**Correção necessária em 2 pontos:**
1. **Code3** — filtrar `""`: `if (value !== null && value !== undefined && value !== '')`
2. **Edit Fields5** — se `novo_inicio` mudou E `novo_fim` está vazio, calcular: `novo_fim = novo_inicio + (fim_original - inicio_original)`

---

### FURO EA-2: IA confirma sem verificar resultado da tool (CRÍTICO)

O Agent responde "Prontinho, atualizei" baseado no fato de ter CHAMADO a tool, não no RESULTADO.

**Causa:** O AI Agent gera texto continuamente. Quando chama a tool `editar_eventos`, a tool executa e retorna. Mas o modelo GPT-4.1-mini tende a gerar a resposta de sucesso imediatamente após a chamada, sem analisar detalhadamente o retorno.

**Evidências:**
- MOD-Q4: Tool foi chamada com campos errados (`data_inicio_evento` em vez de `novo_inicio_evento`). Nada mudou no banco. Agent disse "Prontinho".
- MOD-B3: Tool chamada para evento "Aula de Natação" que NÃO EXISTE. Agent disse "Prontinho, atualizei".

---

### FURO EA-3: Information Extractor outputs mortos (ALTO)

O `Information Extractor` tem 3 saídas via Switch:
- Output 0: `data.length > 1` (múltiplos eventos) — **NÃO CONECTADO**
- Output 1: `data.length == 1` (exato) → Edit Fields5 → Update
- Output 2: `data.length < 1` (nenhum) — **NÃO CONECTADO**

**Problema:** Quando a busca retorna 0 resultados ou múltiplos resultados, o fluxo MORRE ali. Nenhuma resposta é retornada ao webhook caller.

**Impacto:** O AI Agent chamou a tool `editar_eventos`, mas o backend Calendar WebHooks não retorna nada (timeout). O Agent pode interpretar isso como sucesso ou ficar travado.

**Correção:** Conectar outputs 0 e 2 a nodes de resposta que retornem JSON de erro (ex: `{"erro": "nenhum evento encontrado"}` ou `{"erro": "múltiplos eventos, especifique"}`).

---

### FURO EA-4: Prompt confunde campos de busca vs edição (ALTO)

O `prompt_editar1` documenta claramente:
- **BUSCA:** `nome_evento`, `descricao_evento`, `data_inicio_evento`, `data_fim_evento`
- **EDIÇÃO:** `novo_nome_evento`, `novo_desc_evento`, `novo_inicio_evento`, `novo_fim_evento`

Mas nas execuções reais (MOD-Q4), o Agent enviou a nova data no campo `data_inicio_evento` (busca) em vez de `novo_inicio_evento` (edição). O prompt é claro, mas o LLM confundiu.

**Causa provável:** Os 3 tools de edição que existem no JSON (mesmo que só 1 esteja conectada) têm descrições diferentes. A tool `editar_eventos` tem regras duras inline, mas a tool description pode não ser suficiente para o modelo diferenciar 100% das vezes.

---

## EXCLUSÃO DE AGENDA — FUROS ENCONTRADOS

### FURO XA-1: Hard delete sem audit trail (ALTO)

No Calendar WebHooks, os nodes `delete_supabase` e `delete_supabase1` fazem DELETE real:
```
DELETE FROM calendar WHERE id = X AND session_event_id_google = Y
```

Não existe `active = false`, não existe `deleted_at`, não existe log.

---

### FURO XA-2: Re-busca pós-exclusão depende do LLM (MÉDIO)

O prompt diz "VERIFICAÇÃO PÓS-EXCLUSÃO: Após excluir, chamar buscar_eventos novamente para confirmar."

Isso é uma **instrução de prompt**, não um enforce mecânico do workflow. O GPT-4.1-mini pode ou não seguir. Não há gate no N8N que force a re-busca.

**Correção ideal:** Mover essa lógica para o sub-workflow Calendar WebHooks — após o DELETE, o próprio backend faz SELECT para verificar e retorna o resultado.

---

### FURO XA-3: Classificador confunde nome com intenção (MÉDIO)

Documentado nos testes: "marca reunião excluir teste" foi classificado como exclusão por causa da palavra "excluir" no nome do evento.

---

## TABELA COMPARATIVA — GASTOS vs AGENDA

| Aspecto | Edição Gastos | Edição Agenda | Exclusão Gastos | Exclusão Agenda |
|---------|--------------|---------------|-----------------|-----------------|
| **Validação pré-edit** | Busca por ID + ownership check | Busca por nome/data + Information Extractor (similaridade ≥0.90) | Busca por ID + ownership check | Busca por nome/data + buscar_eventos |
| **Preservação de campos** | ❌ Sobrescreve TUDO (inclusive vazios) | ⚠️ Fallback com `\|\|` (bug com "") | N/A | N/A |
| **Validação de dados** | ❌ Nenhuma | ⚠️ Validação JS inline na tool (regex para datas) | ❌ Nenhuma | N/A |
| **Erro de ownership** | ❌ Timeout silencioso (If4 false morto) | ❌ Timeout silencioso (outputs mortos) | ✅ If7 + If checam | ❌ Não verificado |
| **Confirmação antes** | ❌ Exclui direto (1-2 itens) | N/A | ❌ (1-2 itens) | ⚠️ Prompt pede confirmação p/ lote |
| **Validação pós-operação** | ❌ Nenhuma | ❌ Nenhuma | ❌ Nenhuma | ⚠️ Prompt instrui (não enforça) |
| **Tipo de delete** | N/A | N/A | ❌ Hard delete | ❌ Hard delete |
| **Normalização** | ❌ (só existe no registrar) | ⚠️ Parcial (tool com regex) | N/A | N/A |
| **Resposta ao user** | Confia no LLM | Confia no LLM | Confia no LLM | Confia no LLM |

---

## MAPA DE PRIORIZAÇÃO

### P0 — DADOS CORROMPIDOS (corrigir AGORA)

| # | Furo | Impacto | Fix |
|---|------|---------|-----|
| 1 | **EG-1**: Edição parcial destrói campos | Gasto perde valor/data/categoria | Filtrar campos vazios no `Update a row` do Financeiro |
| 2 | **EA-1**: end_event não acompanha start | Evento com end antes do start, Google rejeita | Recalcular end no `Edit Fields5` + filtrar "" no `Code3` |
| 3 | **EA-2**: IA confirma sem verificar | Usuário acha que editou mas não editou | Instruir no prompt: analisar retorno da tool antes de responder |

### P1 — EXPERIÊNCIA QUEBRADA

| # | Furo | Impacto | Fix |
|---|------|---------|-----|
| 4 | **EA-3**: Information Extractor outputs mortos | Tool não retorna nada p/ 0 ou múltiplos resultados | Conectar outputs 0 e 2 a nodes de resposta JSON |
| 5 | **EG-3**: If4 false sem saída | Timeout silencioso na edição quando ownership falha | Conectar false → resposta de erro |
| 6 | **XG-2**: Sem confirmação p/ exclusão de 1-2 gastos | Exclusão acidental irreversível | Adicionar confirmação no prompt |

### P2 — SEGURANÇA E AUDITORIA

| # | Furo | Impacto | Fix |
|---|------|---------|-----|
| 7 | **XG-1 + XA-1**: Hard delete sem recovery | Dado perdido permanentemente | Implementar soft delete (active=false + deleted_at) |
| 8 | **Arquitetural #1**: Agent único com todas as tools | Tool errada pode ser chamada | Restringir tools por branch no prompt (ou separar agents) |
| 9 | **EG-2**: Sem normalização na edição | Categorias/tipos inconsistentes | Adicionar Information Extractor antes do Update |

### P3 — MELHORIAS

| # | Furo | Fix |
|---|------|-----|
| 10 | **EA-4**: Prompt confunde campos busca vs edição | Reforçar exemplos no prompt ou renomear campos |
| 11 | **XA-2**: Re-busca pós-exclusão não enforçada | Mover verificação para o backend |
| 12 | **XA-3**: Classificador confunde nome com intenção | Ajustar peso de verbo vs substantivo |
| 13 | **Arquitetural #2**: Switch2 não distingue operação | Adicionar cases para edição/exclusão |

---

## BUGS COM MAIOR PROBABILIDADE DE AFETAR USUÁRIOS REAIS

**Cenário 1 — Editar nome do gasto (EG-1):**
> Usuário: "muda o nome do gasto do uber pra 99"
> 
> Agent chama `editar_financeiro` com `novo_nome: "99"`, demais campos vazios.
> Supabase UPDATE: name_spent="99", value_spent="", date_spent="", category_spent="", type_spent="", transaction_type=""
> 
> **Resultado:** O gasto perde valor, data, categoria, tipo. Dado destruído.

**Cenário 2 — Editar horário do evento (EA-1):**
> Usuário: "muda a reunião de amanhã pras 16h"
> 
> Agent chama `editar_eventos` com `novo_inicio_evento: "2026-04-04 16:00:00-03"`, `novo_fim_evento: ""`
> Calendar WebHooks: start=16:00, end=14:30 (original)
> 
> **Resultado:** End antes do start. Google Calendar rejeita. Supabase fica corrompido.

**Cenário 3 — Excluir gasto errado (XG-1 + XG-2):**
> Usuário: "apaga o gasto do mercado"
> 
> Agent encontra 1 resultado → exclui direto sem confirmação.
> Mas era o mercado de ontem, não o de hoje.
> 
> **Resultado:** Hard delete. Dado perdido para sempre. Sem undo.

**Cenário 4 — Editar evento que não existe (EA-2 + EA-3):**
> Usuário: "muda a aula de yoga pra 18h"
> 
> Agent chama `editar_eventos` com nome="aula de yoga"
> Information Extractor retorna 0 resultados → output 2 → NÃO CONECTADO → timeout
> Agent não recebe resposta → mas já disse "Prontinho" antes
> 
> **Resultado:** Usuário acha que editou. Nada aconteceu.

---

*Análise baseada na leitura direta de premium-workflow.json, Calendar WebHooks - Total Assistente(3).json, Financeiro - Total(2).json*
