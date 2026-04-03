# Análise Completa — Fluxo de Edição (Agenda + Gastos)

**Data:** 2026-04-03  
**Método:** Leitura direta de todos os workflows N8N (Main, Premium, Calendar WebHooks, Financeiro)  
**Escopo:** Rastreamento end-to-end do fluxo de edição, desde o WhatsApp até o UPDATE no banco

---

## MAPA DO FLUXO COMPLETO

### Edição de Evento de Agenda

```
WHATSAPP
  │
  ▼
MAIN WORKFLOW
  trigger-whatsapp (normaliza payload)
    → Edit Fields (extrai messageSet = texto ou botão)
      → If1 (filtra status updates)
        → Get a row (busca profiles por phone)
          → If8 (user existe?) → If9 (plano ativo?)
            → setar_user (telefone, nome, id_user)
              → Send "Processando..." (WhatsApp)
                → If2 (plan_type == "premium"?)
                  → HTTP POST → Premium webhook (10 campos)
  │
  ▼
PREMIUM WORKFLOW
  webhook premium (recebe body com 10 campos)
    → Evolution API Take all (extrai messageType, conversation, phone)
      → setar_user (telefone, nome, id_user)
        → Switch (audio/texto/img/pdf/interactive)
          → [texto] Edit Fields9 (mensagem = conversation)
          → [audio] download → transcreve → Edit Fields7 (mensagem = texto)
            → Merge1
              → pushRedisMessage (PUSH na key {phone}_debounce)
                → firstGet (GET lista debounce, salva .length)
                  → Aggregate7 → Redis Chat Memory7 (GET chatmem-{phone})
                    → Code9 (extrai mensagem_principal + histórico 2 pares)
                      → mediumGet (GET debounce novamente)
                        → If19 (mediumGet.length == firstGet.length?)
                          → [igual] Escolher Branch (gpt-4.1-mini classifica)
                            → Switch - Branches1
                              → [output 5: editar_evento_agenda]
                                → prompt_editar1 (Set: define prompt de edição)
                                  → Aggregate (agrega prompt)
                                    → infos (seta nome, limite, datetime)
                                      → Redis1 (GET {phone}_idobject)
                                        → lastGet (GET debounce)
                                          → If17 (lastGet.length == firstGet.length?)
                                            → [igual] AI Agent (gpt-4.1-mini)
  │
  ▼
AI AGENT (8 tools disponíveis)
  chama tool "editar_eventos"
    → HTTP POST https://totalassistente.com.br/webhook/editar-eventos
  │
  ▼
CALENDAR WEBHOOKS (sub-workflow)
  webhook editar-eventos (auth Basic, responseMode lastNode)
    → Edit Fields3 (extrai 5 campos de BUSCA: nome, desc, start, end, user_id)
      → criterios1 (Aggregate → { criterios: [...] })
        → If4 (user_id exists?)
          → [true] Code (normaliza datas → UTC, monta queryString PostgREST)
            → Get many rows (calendar WHERE start_event <= endUTC AND end_event >= startUTC AND user_id = X)
              → Aggregate9 (junta rows em { data: [...] })
                → Information Extractor (gpt-4.1-mini, similaridade ≥ 0.90)
                  → Aggregate (re-agrega)
                    → Switch (quantos resultados?)
                      → [>1] ████ SEM CONEXÃO ████
                      → [==1] Edit Fields5 (monta novos valores com || fallback)
                        → Get a row1 (busca registro completo por uuid)
                          → antiduplicados2
                            → Code2 (fallback null em desc_evento)
                              → Code3 (merge: filtra null/undefined, NÃO filtra "")
                                → Update a row1 (UPDATE calendar SET event_name, desc_event, start_event, end_event WHERE id = sessão)
                                  → user_infos → buscar_conexao_user1 (Google connection?)
                                    → If2 (tem Google E connect_google?)
                                      → [true] decrypt token → refresh → tudo_edit → PATCH Google Calendar
                                      → [false] sucesso_padrao1
                      → [<1] ████ SEM CONEXÃO ████
          → [false] falso1 ("não conseguimos buscar")
  │
  ▼
RESPOSTA HTTP retorna ao AI Agent
  │
  ▼
AI Agent gera JSON: {"acao":"padrao","mensagem":"Prontinho..."}
  → Code in JavaScript (parseia JSON, extrai acao/mensagem)
    → Switch2 (acao == ?)
      → [default/padrao] lastGet1 (GET debounce)
        → If18 (lastGet1.length == firstGet.length?)
          → [igual] Redis3 (DELETE {phone}_debounce) → Send message (WhatsApp)
          → [diferente] No Operation (DESCARTA resposta)
```

### Edição de Gasto Financeiro

```
[... mesmo caminho até Switch - Branches1 ...]
  → [output 2: editar]
    → editar_gasto (Set: define prompt de edição financeira)
      → Aggregate → infos → Redis1 → lastGet → If17
        → AI Agent (mesmo Agent, mesmas 8 tools)
          │
          │ PASSO 1: chama tool "buscar_financeiro"
          │   → GET https://totalassistente.com.br/webhook/filtros-supabase
          │     → [Financeiro workflow: filtros-supabase]
          │       entrada2 → fields_nodate → Code4 (monta queryString)
          │         → Get many rows9 (tabela spent) → Aggregate2
          │           → If1 (nome vazio?) → [sim] retorna tudo / [não] Information Extractor1
          │             → Redis cache → resposta com lista de gastos
          │
          │ PASSO 2: chama tool "editar_financeiro"
          │   → POST https://totalassistente.com.br/webhook/editar-supabase
          │     → [Financeiro workflow: editar-supabase]
          │       entrada1 → Get a row4 (spent por id_spent SEM filtro de user)
          │         → Get a row14 (profiles por id_user)
          │           → If4 (ownership: profile.id == spent.fk_user?)
          │             → [true] Update a row (TODOS 6 campos, SEM fallback)
          │               → Redis2 (cache TTL 900s) + Edit Fields30 (retorna {"sucesso":"sucesso"})
          │             → [false] ████ SEM CONEXÃO ████
          │
          ▼
AI Agent gera resposta → mesmo caminho pós-Agent
```

---

## PONTOS FRACOS — POR CAMADA

---

### CAMADA 1: CLASSIFICADOR

#### PF-C1: Zero exemplos de edição de evento no classificador

O prompt do "Escolher Branch" tem exemplos detalhados para edição FINANCEIRA:
> "troca o gasto de 50 no mercado para 60", "editar aquele de uber de ontem", "corrige o de 27,90 para 30"

Para edição de EVENTO, existe apenas UMA frase genérica:
> "Se o usuario claramente estiver mudando horario de algo ja existente e o historico mostra que havia um evento sendo tratado → editar_evento_agenda"

Não há exemplos como "muda a reunião pra 15h", "atrasa o dentista 30 minutos", "passa o evento de segunda pra terça".

**Consequência:** O classificador depende inteiramente da interpretação do LLM para identificar edições de evento. Como o default para edição ambígua é FINANCEIRO, frases como "edita aquele compromisso" podem ir para o branch errado.

#### PF-C2: Default para edição ambígua é financeiro

A regra explícita do classificador:
> "Quando editar algo com nome AMBÍGUO: DEFAULT = branch FINANCEIRO"

Isso protege gastos (que são mais frequentes), mas significa que qualquer edição de evento com nome não-óbvio será roteada para o branch errado. A lista de "nomes SEMPRE evento" é:
> reuniao, consulta, dentista, academia, aula, treino, faculdade, pilates, yoga, corrida, futebol, natacao, musculacao

Nomes como "compromisso", "evento", "horário", "planning", "review", "call", "daily" NÃO estão na lista.

#### PF-C3: Dois mecanismos de classificação com nomes diferentes

Existem DOIS classificadores rodando:
- **Text Classifier** (node inputText): usa categories com nomes como `criar_limite`, `editar_limite`, `relatorio_semanal`
- **Chain LLM** (Escolher Branch): usa branches com nomes como `gerar_relatorio`, `padrao`

5 categories do Text Classifier (`criar_limite`, `editar_limite`, `excluir_limite`, `relatorio_semanal`, `relatorio_mensal`) NÃO existem no Switch. Se retornadas, caem no vazio.

---

### CAMADA 2: DEBOUNCE

#### PF-D1: Resposta pode ser descartada DEPOIS de todo o processamento

O fluxo tem 3 checkpoints de debounce:
1. **If19** (pré-classificador): compara mediumGet vs firstGet
2. **If17** (pré-Agent): compara lastGet vs firstGet
3. **If18** (pós-Agent): compara lastGet1 vs firstGet

Se o usuário manda outra mensagem enquanto o Agent está processando a edição, o **If18 descarta a resposta inteira**. O Agent fez a edição (a tool executou, o banco foi alterado), mas a resposta ao usuário é ENGOLIDA.

**Consequência:** O evento/gasto FOI editado no banco, mas o usuário não recebe confirmação. Ele pode achar que não funcionou e tentar novamente, criando uma segunda edição.

#### PF-D2: Code9 usa apenas a ÚLTIMA mensagem

O Code9 extrai `mensagem_principal` assim:
```javascript
coletadas.filter(Boolean).slice(-1)[0]
```

Se o usuário mandou "muda a reunião pra 15h" e depois "ah não, pra 16h" rapidamente, o Code9 pega APENAS "ah não, pra 16h". A primeira mensagem é perdida. O classificador recebe "ah não, pra 16h" sem contexto de que era sobre uma reunião — pode classificar como `padrao`.

#### PF-D3: Sem TTL na key de debounce

A key `{phone}_debounce` no Redis só é deletada pelo `Redis3` no final do fluxo (após If18=true). Se o workflow falha em qualquer ponto, a key fica órfã para sempre. A próxima mensagem do usuário vai encontrar mensagens antigas na lista de debounce.

---

### CAMADA 3: AI AGENT

#### PF-A1: Agent único com 8 tools para todos os branches

O MESMO AI Agent processa edição de gastos, edição de agenda, exclusão, busca, relatório. Ele sempre VÊ todas as 8 tools:

| Tool | Domínio |
|------|---------|
| buscar_financeiro | Gastos |
| editar_financeiro | Gastos |
| excluir_financeiro | Gastos |
| buscar_eventos | Agenda |
| editar_eventos | Agenda |
| excluir_evento | Agenda |
| gerar_relatorio | Relatório |
| Think | Meta |

O prompt injetado tenta restringir ("use APENAS editar_eventos"), mas o LLM pode ignorar e chamar qualquer tool.

**Evidência real:** Na bateria de testes, o Agent chamou tool de agenda quando deveria usar financeiro (T7 — gasto virou evento).

#### PF-A2: Discrepância de nomes entre prompt e tools

| Prompt do editar_gasto diz | Tool real conectada |
|---------------------------|-------------------|
| `buscar_registro` | `buscar_financeiro` |
| `editar_registros` | `editar_financeiro` |

O LLM provavelmente resolve pelo contexto, mas é fonte de confusão.

#### PF-A3: Confusão entre campos de busca vs edição (agenda)

A tool `editar_eventos` tem 8 campos + user_id:
- **BUSCA:** `nome_evento`, `descricao_evento`, `data_inicio_evento`, `data_fim_evento`
- **EDIÇÃO:** `novo_nome_evento`, `novo_desc_evento`, `novo_inicio_evento`, `novo_fim_evento`

O prompt do `prompt_editar1` documenta claramente a diferença. Mas nas execuções reais (MOD-Q4), o Agent enviou a nova data em `data_inicio_evento` (busca) em vez de `novo_inicio_evento` (edição). O banco não mudou, mas o Agent disse "Prontinho".

**Causa:** Os nomes são muito similares. `data_inicio_evento` vs `novo_inicio_evento` — para o LLM, "data_inicio" parece mais natural para "a nova data de início".

#### PF-A4: Agent responde ANTES de saber o resultado (agenda)

O AI Agent gera a resposta textual em continuação à chamada da tool. Quando chama `editar_eventos`, a tool executa o HTTP POST. A resposta HTTP volta. Mas o modelo tende a gerar "Prontinho, atualizei seu evento" ANTES de analisar detalhadamente o retorno.

**Evidências:**
- MOD-Q4: Tool chamada com campos errados → nada mudou → Agent disse "Prontinho"
- MOD-B3: Tool chamada para evento "Aula de Natação" inexistente → Agent disse "Prontinho"
- MOD-C2: Tool executou mas end_event ficou corrompido → Agent disse "Prontinho"

**Contraste:** Para exclusão de agenda, o prompt instrui re-busca pós-exclusão. Para edição, não existe nenhuma instrução de verificação pós-tool.

#### PF-A5: REGRA DE DURAÇÃO depende 100% do LLM (agenda)

O prompt diz:
> "User informa APENAS novo início: preservar D. novo_fim = novo_inicio + D. Se D desconhecida → +30min."

Isso é uma instrução para o LLM calcular e enviar `novo_fim_evento`. Se o LLM não calcular (envia `""` no novo_fim), a responsabilidade cai no backend — que NÃO tem essa lógica.

**O backend (Calendar WebHooks) não sabe calcular duração.** O Edit Fields5 faz fallback para o `fim_evento` original via `||`, que pode ser de outra data/horário se o start mudou.

#### PF-A6: Edição financeira — Agent não recebe dados atualizados de volta

Quando o Agent chama `editar_financeiro`, o sub-workflow Financeiro retorna apenas:
```json
{"sucesso": "sucesso"}
```

O Agent NÃO recebe de volta os dados que foram realmente gravados no banco. Ele precisa INVENTAR a mensagem de confirmação com base no que ELE enviou — não no que realmente foi salvo.

**Consequência:** Se o Update sobrescreveu campos com vazio (bug EG-1), o Agent não sabe. Ele confirma "Edição concluída! Registro: Mercado" sem saber que `value_spent` foi zerado.

---

### CAMADA 4: CALENDAR WEBHOOKS (sub-workflow de agenda)

#### PF-CW1: Outputs mortos no Switch pós-Information Extractor

O Switch tem 3 saídas:
- Output 0 (>1 resultado): **NÃO CONECTADO** — fluxo morre
- Output 1 (==1 resultado): → Edit Fields5 → funciona
- Output 2 (<1 resultado): **NÃO CONECTADO** — fluxo morre

Quando a busca retorna 0 ou múltiplos resultados, o webhook não retorna NADA. O caller (AI Agent) fica pendurado esperando resposta até timeout.

**Cenário real:** MOD-B3 — Agent buscou "Aula de Natação" que não existe → 0 resultados → output 2 → morto → timeout.

#### PF-CW2: Edit Fields5 — `||` com string vazia

```
novo_fim = body.novo_fim_evento || output[0].fim_evento
```

O `||` trata `""` como falsy, fazendo fallback para o fim original. Isso é **INTENCIONAL** (campo vazio = manter original). Mas há um caso onde falha:

Quando o start mudou para uma data DIFERENTE, o fim original é de OUTRA data. Exemplo:
- Original: start=04/04 15:00, end=04/04 15:30
- Usuário quer: start=10/04 14:00
- Agent envia: novo_inicio=10/04 14:00, novo_fim=""
- Edit Fields5: novo_fim = "" || "04/04 15:30" = "04/04 15:30"
- Update: start=10/04, end=04/04 → end 6 DIAS antes do start

**Raiz:** O backend não tem lógica de preservação de duração. Depende 100% do LLM enviar `novo_fim_evento`.

#### PF-CW3: Code3 não filtra string vazia

```javascript
if (value !== null && value !== undefined && key !== 'id') {
  acc[key] = value;
}
```

Filtra `null` e `undefined`, mas NÃO filtra `""`. Se algum campo do Edit Fields5 for `""`, ele vai para o Update. Na prática, como o Edit Fields5 já faz fallback via `||`, isso não deveria acontecer — mas se o fallback do extractor retornar `""`, o campo vazio passa.

#### PF-CW4: Code2 referencia campo errado

```javascript
antiduplicados.desc_evento = antiduplicados.desc_evento ?? "nao identificado";
```

O campo no Supabase é `desc_event`, não `desc_evento`. Esse null-fallback não tem efeito prático.

#### PF-CW5: PATCH Google sem timeZone

O fluxo de CRIAÇÃO de evento envia `timeZone: 'America/Sao_Paulo'` no start/end. O fluxo de EDIÇÃO NÃO envia timeZone:

```javascript
if (has(o.start_event)) body.start = { dateTime: o.start_event };
```

vs criação:
```javascript
body.start = { dateTime: startEvent, timeZone: 'America/Sao_Paulo' };
```

Se a string salva no Supabase não tiver offset explícito, o Google pode interpretar como UTC.

#### PF-CW6: Busca por sobreposição temporal pode retornar muitos resultados

O `Code` normaliza datas e monta query PostgREST:
```
start_event <= endUTC AND end_event >= startUTC AND user_id = X
```

Se o usuário disser "muda a reunião de amanhã pra 15h" sem especificar horário de busca, o classificador/Agent precisa definir `data_inicio_evento = "2026-04-04 00:00:00-03"` e `data_fim_evento = "2026-04-04 23:59:59-03"`. Isso retorna TODOS os eventos do dia. Se tiver 5 eventos, o Information Extractor precisa filtrar por nome — e aí depende da similaridade semântica funcionar.

---

### CAMADA 5: FINANCEIRO (sub-workflow de gastos)

#### PF-F1: Update envia TODOS os 6 campos SEMPRE — sem fallback

O `Update a row` no Financeiro:

```
name_spent     = body.novo_nome       ← pode ser ""
value_spent    = body.novo_valor      ← pode ser ""
date_spent     = body.nova_data       ← pode ser ""
category_spent = body.nova_categoria  ← pode ser ""
type_spent     = body.novo_tipo       ← pode ser ""
transaction_type = body.entra_sai     ← pode ser ""
```

NÃO existe `||` fallback (como no Calendar). NÃO existe Code de merge (como o Code3 do Calendar). O que o Agent enviar é gravado diretamente.

**Contraste com Calendar:** O Calendar tem Edit Fields5 com `|| valor_original` e Code3 que filtra null/undefined. O Financeiro não tem NENHUMA camada de proteção.

**Impacto:** Qualquer edição parcial destrói os campos não enviados.

#### PF-F2: If4 false sem conexão — timeout silencioso

Se o gasto não pertence ao usuário, o If4 cai no output false que não tem nada conectado. O webhook (responseMode: lastNode) não tem nó final → timeout.

#### PF-F3: Resposta genérica sem detalhes

O webhook retorna apenas `{"sucesso": "sucesso"}`. Não diz QUAIS campos foram alterados, nem os valores novos. O Agent precisa inventar a confirmação.

#### PF-F4: Busca não filtra por nome/valor no banco

O webhook `filtros-supabase` (busca) monta queryString apenas com filtros de DATA e user_id. Os filtros textuais (nome, valor, categoria) são aplicados DEPOIS pela IA (Information Extractor1). Isso significa que o banco retorna TODOS os gastos do período, e a IA filtra depois.

**Consequência:** Se o usuário tem 500 gastos no mês, todos são retornados do Supabase e processados pela IA. Performance degradada + custo de tokens.

---

### CAMADA 6: CROSS-CUTTING (afeta ambos os fluxos)

#### PF-X1: Nenhum fluxo de edição tem validação pós-tool

| Fluxo | Validação pós-tool |
|-------|--------------------|
| Criar evento | ✅ O Agent vê o evento criado na resposta do webhook |
| Registrar gasto | ✅ O Agent vê o gasto registrado na resposta |
| Editar evento | ❌ O Agent confia na chamada da tool |
| Editar gasto | ❌ O Agent recebe apenas {"sucesso":"sucesso"} |
| Excluir evento | ⚠️ Prompt instrui re-busca (mas não enforça) |
| Excluir gasto | ❌ Nenhuma verificação |

#### PF-X2: Sem transação — Supabase atualizado ANTES de verificar Google

Na edição de agenda, o fluxo é:
1. UPDATE Supabase (Update a row1) ← dados podem estar corrompidos
2. PATCH Google Calendar ← Google pode rejeitar

Se o Google rejeitar (ex: end antes do start), o Supabase já foi atualizado com dados errados. Não existe rollback.

**Evidência:** MOD-Q1 e MOD-C2 — Google rejeitou com "time range is empty", mas Supabase ficou com end < start.

#### PF-X3: Sem log de edição

Nenhum dos dois fluxos (agenda ou gastos) registra a edição. Não existe:
- Tabela de audit/log de alterações
- Snapshot do valor anterior
- Quem editou, quando, o que mudou

A tabela `log_total` foi removida e nunca substituída.

#### PF-X4: Chat Memory com TTL de 5 minutos pode perder contexto

O Redis Chat Memory do AI Agent tem TTL de 300s (5 minutos). Se o usuário inicia uma edição, o Agent pede clarificação ("qual reunião?"), e o usuário demora 6 minutos para responder — o Agent perdeu o contexto da conversa. Não sabe mais que era sobre edição de reunião.

---

## TABELA RESUMO DE PONTOS FRACOS

| ID | Ponto Fraco | Camada | Severidade | Afeta |
|----|-------------|--------|-----------|-------|
| PF-C1 | Zero exemplos de edição de evento no classificador | Classificador | ALTO | Agenda |
| PF-C2 | Default para edição ambígua é financeiro | Classificador | ALTO | Agenda |
| PF-C3 | Dois classificadores com nomes diferentes | Classificador | MÉDIO | Ambos |
| PF-D1 | Resposta descartada após processamento completo | Debounce | ALTO | Ambos |
| PF-D2 | Code9 usa apenas última mensagem | Debounce | MÉDIO | Ambos |
| PF-D3 | Sem TTL na key de debounce | Debounce | MÉDIO | Ambos |
| PF-A1 | Agent único com 8 tools | Agent | ALTO | Ambos |
| PF-A2 | Nomes de tools diferentes no prompt vs realidade | Agent | BAIXO | Gastos |
| PF-A3 | Confusão entre campos busca vs edição | Agent | ALTO | Agenda |
| PF-A4 | Agent confirma sem verificar resultado | Agent | CRÍTICO | Agenda |
| PF-A5 | Regra de duração depende 100% do LLM | Agent | CRÍTICO | Agenda |
| PF-A6 | Agent não recebe dados atualizados de volta | Agent | ALTO | Gastos |
| PF-CW1 | Outputs mortos no Switch (0 e >1 resultados) | Calendar WH | ALTO | Agenda |
| PF-CW2 | Edit Fields5 fallback com || em datas cruzadas | Calendar WH | CRÍTICO | Agenda |
| PF-CW3 | Code3 não filtra string vazia | Calendar WH | MÉDIO | Agenda |
| PF-CW4 | Code2 referencia campo errado (desc_evento) | Calendar WH | BAIXO | Agenda |
| PF-CW5 | PATCH Google sem timeZone | Calendar WH | MÉDIO | Agenda |
| PF-CW6 | Busca por sobreposição pode retornar muitos | Calendar WH | BAIXO | Agenda |
| PF-F1 | Update envia TODOS campos sem fallback | Financeiro | CRÍTICO | Gastos |
| PF-F2 | If4 false sem conexão (timeout) | Financeiro | MÉDIO | Gastos |
| PF-F3 | Resposta sem detalhes do que mudou | Financeiro | MÉDIO | Gastos |
| PF-F4 | Busca não filtra no banco, filtra por IA | Financeiro | BAIXO | Gastos |
| PF-X1 | Nenhum fluxo de edição valida pós-tool | Cross | CRÍTICO | Ambos |
| PF-X2 | Supabase atualizado antes de Google (sem rollback) | Cross | ALTO | Agenda |
| PF-X3 | Sem log de edição | Cross | MÉDIO | Ambos |
| PF-X4 | Chat Memory TTL 5min pode perder contexto | Cross | BAIXO | Ambos |

---

## COMO O SISTEMA REAGE — CENÁRIOS REAIS

### Cenário 1: "muda a reunião de amanhã pras 16h"
```
1. Classificador: "reunião" está na lista de SEMPRE evento → editar_evento_agenda ✅
2. Agent: monta editar_eventos com nome="reuniao", data_inicio="amanhã 00:00", novo_inicio="amanhã 16:00"
3. Calendar WH: busca todos eventos de amanhã → Information Extractor filtra por "reunião"
4. Se 1 resultado: Edit Fields5 → novo_comeco = "16:00" ✅, novo_fim = "" || fim_original
5. Se fim_original era 15:30 → novo_fim = 15:30 → end ANTES do start ❌
6. Update Supabase: start=16:00, end=15:30 ❌
7. Google rejeita: "time range is empty" ❌
8. Agent já disse "Prontinho" ❌
```

### Cenário 2: "edita o compromisso de segunda pra terça"
```
1. Classificador: "compromisso" NÃO está na lista de SEMPRE evento
2. Regra: default para edição ambígua = FINANCEIRO
3. Agent recebe prompt de edição FINANCEIRA ❌
4. Agent busca gastos com nome "compromisso" → 0 resultados
5. Agent: "Não encontrei nenhum registro com esses dados" ❌
6. Usuário fica confuso — ele queria editar um EVENTO
```

### Cenário 3: "muda o gasto do uber pra 30 reais"
```
1. Classificador: "uber" + "gasto" → editar (financeiro) ✅
2. Agent: busca_financeiro com nome="uber" → encontra 1 resultado (id=abc, value=27.90)
3. Agent: editar_financeiro com id_gasto="abc", novo_valor="30"
4. Sub-workflow: Update a row com:
   - name_spent = "" (vazio!) ← DESTRÓI o nome ❌
   - value_spent = "30" ✅
   - date_spent = "" (vazio!) ← DESTRÓI a data ❌
   - category_spent = "" ← DESTRÓI a categoria ❌
   - type_spent = "" ← DESTRÓI o tipo ❌
   - transaction_type = "" ← DESTRÓI o tipo de transação ❌
5. Agent: "Edição concluída! Valor atualizado: R$30,00" ← parece OK, mas 5 campos foram zerados
```

### Cenário 4: "muda a reunião..." (mensagem rápida seguida de "pra 15h")
```
1. Msg1: "muda a reunião" → pushRedisMessage → firstGet → Code9 (mensagem_principal = "muda a reunião")
2. Msg2 (2s depois): "pra 15h" → pushRedisMessage (lista cresce)
3. Execução da Msg1: mediumGet → If19 → lista cresceu → NO OPERATION (descartada)
4. Execução da Msg2: Code9 → mensagem_principal = "pra 15h" (apenas ÚLTIMA)
5. Classificador recebe "pra 15h" sem contexto → pode classificar como padrao ❌
6. Resultado: nenhuma das duas mensagens é processada corretamente
```

### Cenário 5: "muda a aula de yoga pra 18h" (evento que não existe)
```
1. Classificador: "aula" + "yoga" → editar_evento_agenda ✅
2. Agent: editar_eventos com nome="aula de yoga"
3. Calendar WH: busca → 0 resultados → Switch output 2 → SEM CONEXÃO
4. Webhook não retorna nada → timeout
5. Agent: já gerou "Prontinho, atualizei" durante a chamada da tool ❌
6. Usuário acha que editou. Nada aconteceu.
```

### Cenário 6: Edição funciona perfeitamente
```
1. Msg: "passa a reunião de amanhã de 10h pra 14h"
2. Classificador: "reunião" → editar_evento_agenda ✅
3. Agent: editar_eventos com nome="reunião", data_inicio="amanhã 00:00-03", data_fim="amanhã 23:59-03",
   novo_inicio="amanhã 14:00:00-03", novo_fim="amanhã 14:30:00-03" (calculou duração: 30min) ✅
4. Calendar WH: busca → 1 resultado (reunião 10:00-10:30)
5. Edit Fields5: novo_comeco = "14:00" ✅, novo_fim = "14:30" ✅ (Agent enviou ambos)
6. Code3: filtra campos, tudo preenchido ✅
7. Update Supabase: start=14:00, end=14:30 ✅
8. Google PATCH: start=14:00, end=14:30 ✅
9. Agent: "Prontinho! Reunião → 14:00-14:30" ✅
```

**A edição funciona quando o LLM acerta TODOS os passos:** classificação correta + campos corretos + duração calculada + tool certa + 1 resultado encontrado. Quando qualquer peça falha, o sistema não compensa.

---

## CONCLUSÃO

O fluxo de edição tem **26 pontos fracos** mapeados em 6 camadas. Os mais destrutivos:

1. **PF-F1** (Financeiro sem fallback): Qualquer edição parcial de gasto DESTRÓI campos não enviados. Este é o bug mais grave porque acontece em TODA edição que não envie todos os 6 campos.

2. **PF-CW2 + PF-A5** (end_event + duração depende do LLM): Quando o LLM não calcula a duração, o backend grava end antes do start. O Google rejeita, mas Supabase fica corrompido.

3. **PF-A4 + PF-X1** (confirma sem verificar): O Agent diz "Prontinho" sem saber se funcionou. Não existe validação pós-tool em NENHUM fluxo de edição.

4. **PF-CW1** (outputs mortos): Se a busca retorna 0 ou >1 resultados, o webhook não responde. O Agent fica travado e inventa uma resposta.

5. **PF-C1 + PF-C2** (classificador sem exemplos + default financeiro): Edições de evento com nomes não-óbvios vão para o branch financeiro.

O fluxo funciona quando o LLM acerta tudo. O sistema não tem defesas quando o LLM erra.

---

*Análise baseada na leitura direta de: Main - Total Assistente(2).json, premium-workflow.json, Calendar WebHooks - Total Assistente(3).json, Financeiro - Total(2).json*
