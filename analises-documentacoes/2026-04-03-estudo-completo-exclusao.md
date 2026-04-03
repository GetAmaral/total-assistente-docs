# Estudo Completo — Fluxo de Exclusao no Total Assistente

**Data:** 2026-04-03
**Autor:** Auditoria automatizada (squad auditor-real)
**Escopo:** Analise profunda de TODOS os caminhos, workflows, nodes e decisoes envolvidos numa exclusao de evento/financeiro
**Fonte de testes:** BATERIA-EDICAO-EXCLUSAO-2026-04-03.md

---

## Indice

1. [Visao Geral — Como uma exclusao acontece](#1-visao-geral)
2. [Caminho A — Exclusao por texto livre](#2-caminho-a-texto-livre)
3. [Caminho B — Exclusao por botao interativo](#3-caminho-b-botao-interativo)
4. [Workflow Calendar WebHooks — O motor de exclusao](#4-calendar-webhooks)
5. [Classificacao — Como o sistema decide que e exclusao](#5-classificacao)
6. [Prompt de exclusao — O que o AI Agent recebe](#6-prompt-excluir)
7. [Tools do AI Agent — buscar_eventos e excluir_evento](#7-tools)
8. [Exclusao financeira — Fluxo paralelo](#8-exclusao-financeira)
9. [Standard vs Premium — Diferencas na exclusao](#9-standard-vs-premium)
10. [Pontos fracos identificados](#10-pontos-fracos)
11. [Evidencias dos testes](#11-evidencias-testes)
12. [Mapa completo de conexoes entre nodes](#12-mapa-conexoes)

---

## 1. Visao Geral

Uma exclusao no Total Assistente percorre **3 workflows** e pode seguir **2 caminhos** distintos:

| Caminho | Gatilho | Passa por IA? | Workflows envolvidos |
|---------|---------|---------------|---------------------|
| **Texto livre** | Usuario digita "exclui X" | Sim (classificador + AI Agent) | Fix Conflito v2 → Calendar WebHooks |
| **Botao interativo** | Usuario clica botao de exclusao | Nao (direto) | Fix Conflito v2 → Calendar WebHooks |

Ambos os caminhos convergem no mesmo endpoint do Calendar WebHooks: `POST /excluir-evento-total`. Ou seja, o **Calendar WebHooks e o motor real de exclusao** — Fix Conflito v2 apenas decide QUANDO e COM QUAL ID chamar esse motor.

### Workflows envolvidos

| Workflow | ID | Papel na exclusao |
|----------|-----|-------------------|
| **Fix Conflito v2** | ImW2P52iyCS0bGbQ | Classifica intencao, monta prompt, AI Agent decide qual evento excluir |
| **Calendar WebHooks** | sSEBeOFFSOapRfu6 | Recebe event_id, deleta do Google Calendar e do Supabase |
| **User Standard** | c8gtSmh1BPzZXbJa | Apenas exclusao financeira (sem agenda) |

---

## 2. Caminho A — Exclusao por Texto Livre

Quando o usuario envia uma mensagem como "exclui a consulta de amanha", o fluxo completo e:

```
WhatsApp (usuario digita mensagem)
  |
  v
Evolution API (recebe mensagem, extrai phone, texto, messageType)
  |
  v
Fix Conflito v2 — Webhook "premium" (entrada principal)
  |
  v
Code9 (extrai mensagem_principal + historico confirmados)
  |
  v
[CLASSIFICACAO — 2 niveis]
  |
  +--> Text Classifier (1o nivel — LLM classifica em 14+ categorias)
  |      resultado: "excluir_evento_agenda"
  |
  +--> Escolher Branch (2o nivel — LLM mais detalhado, confirma branch)
  |      resultado: { "branch": "excluir_evento_agenda" }
  |
  v
Switch - Branches1 (roteia pelo branch)
  |  output 6 = excluir_evento_agenda
  v
prompt_excluir (Set node — injeta prompt especifico de exclusao)
  |
  v
Aggregate (agrega prompt no campo data[0].prompt)
  |
  v
AI Agent (gpt-4.1-mini + Redis Chat Memory)
  |
  |  O AI Agent tem acesso a 2 tools:
  |  - buscar_eventos (GET /busca-total-evento)
  |  - excluir_evento (POST /excluir-evento-total)
  |
  |  Fluxo interno do Agent:
  |  1. Chama buscar_eventos com nome/data/descricao
  |  2. Analisa resultados (0, 1, ou N eventos)
  |  3. Se 1 resultado: chama excluir_evento com sessao_id
  |  4. Se N resultados: lista e pede escolha
  |  5. Se 0: "Nao encontrei nenhum evento"
  |  6. Monta resposta JSON {"acao":"padrao","mensagem":"..."}
  |
  v
Resposta enviada ao usuario via WhatsApp
```

### Tempo de resposta

O AI Agent formula e envia sua resposta **ANTES** de saber se o Calendar WebHooks processou com sucesso. Isso acontece porque:

1. O AI Agent chama a tool `excluir_evento` (HTTP POST)
2. O Calendar WebHooks processa (busca registro, deleta Google, deleta Supabase)
3. Calendar WebHooks retorna resposta
4. Mas o AI Agent ja formulou "Evento excluido!" baseado no fato de ter CHAMADO a tool, nao no resultado

Isso e um padrao de **fire-and-forget** — o Agent assume que se ele chamou, deu certo.

---

## 3. Caminho B — Exclusao por Botao Interativo

Quando o usuario clica um botao de exclusao na interface do WhatsApp:

```
WhatsApp (usuario clica botao com conversation="evt_del_{uuid}")
  |
  v
Evolution API (messageType = "interactive")
  |
  v
Fix Conflito v2 — Switch (roteia por messageType)
  |  output "exclui/edita" (para interactive)
  v
Extrair Acao do Botao (Code node)
  |
  |  Codigo:
  |  const conversation = $json.conversation  // ex: "evt_del_abc123"
  |  const map = {
  |    evt_del_:  'excluir_evento',
  |    evt_edit_: 'editar_evento',
  |    fin_del_:  'excluir_financeiro',
  |    rec_del_:  'excluir_recorrente',
  |  }
  |  Resultado: { acao: 'excluir_evento', entityId: 'abc123' }
  |
  v
Tipo de Acao (Switch — roteia por $json.acao)
  |
  +-- excluir_evento     --> Excluir Evento (Botao)
  +-- excluir_financeiro --> Excluir Financeiro (Botao)
  +-- excluir_recorrente --> Excluir Recorrente (Botao)
  +-- editar_evento      --> (sem conexao)
  +-- gc_sim             --> Registrar Sim
  +-- gc_nao             --> Registrar Nao
```

### Excluir Evento (Botao)

```
POST https://totalassistente.com.br/webhook/excluir-evento-total
Auth: HTTP Basic (Avelum Credential)
Body:
  event_id = $json.entityId    // UUID extraido do prefixo do botao
  user_id  = $('setar_user').item.json.id_user
```

Apos o POST, envia confirmacao:

```
Confirmar Exclusao Evento:
POST https://graph.facebook.com/v23.0/744582292082931/messages
Body: { "type": "text", "text": { "body": "🗑️ Evento excluido com sucesso!" } }
```

**Ponto importante:** Neste caminho NAO ha IA envolvida. O botao ja carrega o UUID do evento. A exclusao e direta — sem busca, sem verificacao, sem confirmacao.

### Excluir Recorrente (Botao)

Usa o **mesmo endpoint** (`excluir-evento-total`) com os mesmos parametros. A unica diferenca e a mensagem de confirmacao:
- Evento normal: "Evento excluido com sucesso!"
- Recorrente: "Evento recorrente excluido!"

Ou seja, o Calendar WebHooks nao distingue evento recorrente de evento normal na exclusao — ambos sao tratados com DELETE simples.

### Excluir Financeiro (Botao)

Vai para um endpoint **diferente**:
```
POST https://totalassistente.com.br/webhook/excluir-supabase
Body: id_gasto = entityId, id_user = user_id
```
Confirmacao: "Registro financeiro desfeito!"

---

## 4. Calendar WebHooks — O Motor de Exclusao

O workflow Calendar WebHooks (sSEBeOFFSOapRfu6) e o destino final de TODA exclusao de evento. Ele recebe o `event_id` e `user_id` e faz o trabalho real.

### Fluxo completo node a node

```
Excluir eventos - Webhook
  |  Recebe: POST /excluir-evento-total
  |  Body: { event_id, user_id }
  |  Auth: HTTP Basic
  v
Edit Fields4
  |  Extrai:
  |  - event_id = $json.body.event_id
  |  - user_id  = $json.body.user_id
  v
Get a row
  |  Supabase SELECT da tabela "calendar"
  |  Filtros: id = event_id AND user_id = user_id
  |  Retorna: registro completo do evento (nome, datas, google_id, etc.)
  v
buscar_conexao_user2
  |  HTTP GET para Supabase REST API:
  |  URL: https://ldbdtakddxznfridsarn.supabase.co/rest/v1/google_calendar_connections
  |  Filtros: user_id = user_id, is_connected = true
  |  Select: encrypted_refresh_token, updated_at
  |  Order: updated_at desc, limit 1
  |  
  |  Verifica se o usuario tem Google Calendar conectado.
  v
Edit Fields1
  |  Re-seta user_id (garante que esta disponivel nos proximos nodes)
  v
If3
  |  Condicao: encrypted_refresh_token EXISTE?
  |  (verifica se o usuario tem token Google valido)
  |
  +-- TRUE (tem Google) ──────────────────────────────+
  |                                                    |
  |  token2                                            |
  |  |  Extrai encrypted_refresh_token e updated_at    |
  |  v                                                 |
  |  descriptografar_token_prod2                       |
  |  |  POST para Supabase RPC: decrypt_token_json     |
  |  |  Body: { encrypted_token, key: 'google_calendar_secret_key_2024' }
  |  |  Retorna: token descriptografado                |
  |  v                                                 |
  |  refresh_access2                                   |
  |  |  POST para https://oauth2.googleapis.com/token  |
  |  |  Body: grant_type=refresh_token,                |
  |  |        refresh_token=token_descriptografado,     |
  |  |        client_id=351327701355-...                |
  |  |  Retorna: access_token fresco                   |
  |  v                                                 |
  |  tudo_edit1                                        |
  |  |  Agrega: access_token + session_event_id_google |
  |  |  + user_id + todos os dados do evento           |
  |  v                                                 |
  |  excluir_evento_google                             |
  |  |  DELETE na Google Calendar API:                  |
  |  |  URL: /calendars/{calendarId}/events/{eventId}  |
  |  |  calendarId: calendar_id_google || 'primary'    |
  |  |  eventId: session_event_id_google || event_id   |
  |  |  Auth: Bearer access_token                      |
  |  v                                                 |
  |  limpar_tokens_e_reduzir_saida2                    |
  |  |  Set node VAZIO — limpa todos os campos         |
  |  |  (remove tokens da memoria para seguranca)      |
  |  v                                                 |
  |  delete_supabase                                   |
  |  |  Supabase DELETE na tabela "calendar"            |
  |  |  Filtros:                                       |
  |  |    session_event_id_google = (do tudo_edit1)    |
  |  |    id = event_id (do Edit Fields4)              |
  |  |  HARD DELETE — registro removido permanentemente |
  |  v                                                 |
  |  sucesso_google2                                   |
  |  |  Retorna: "exclusao do evento na agenda google  |
  |  |  e padrao feito com sucesso."                   |
  |                                                    |
  +-- FALSE (sem Google) ─────────────────────────────+
  |                                                    |
  |  delete_supabase1                                  |
  |  |  Supabase DELETE na tabela "calendar"            |
  |  |  Filtro: id = event_id (do Edit Fields4)        |
  |  |  HARD DELETE — registro removido permanentemente |
  |  v                                                 |
  |  sucesso_padrao2                                   |
  |  |  Retorna: "evento excluido na agenda padrao     |
  |  |  com sucesso, usuario nao possui conexao com    |
  |  |  google agenda."                                |
  +----------------------------------------------------+
```

### Pontos criticos do Calendar WebHooks na exclusao

1. **Hard delete em AMBOS os caminhos** — tanto `delete_supabase` quanto `delete_supabase1` usam `operation: "delete"`. O registro e permanentemente removido da tabela `calendar`.

2. **Nao ha verificacao de sucesso do Google** — o fluxo vai de `excluir_evento_google` direto para `limpar_tokens` e depois `delete_supabase`. Se o DELETE no Google falhar (401, 404, 500), o workflow pode continuar e deletar do Supabase mesmo assim (depende da configuracao de `onError` do node).

3. **Limpeza de tokens** — o node `limpar_tokens_e_reduzir_saida2` zera todos os campos. Isso e uma medida de seguranca (nao propagar access_token), mas tambem significa que qualquer node posterior NAO tem acesso aos dados do evento deletado para confirmar o que foi feito.

4. **Duplo filtro no Google path** — `delete_supabase` filtra por `session_event_id_google` E `id`. Isso e mais seguro que `delete_supabase1` que filtra so por `id`.

5. **Sem resposta ao chamador sobre o que foi deletado** — os nodes `sucesso_google2` e `sucesso_padrao2` retornam mensagens genericas. Nao incluem o nome do evento, data, ou qualquer detalhe que permita ao AI Agent confirmar QUAL evento foi excluido.

---

## 5. Classificacao — Como o Sistema Decide que e Exclusao

A classificacao acontece em **2 niveis sequenciais** no Fix Conflito v2:

### Nivel 1 — Text Classifier

| Campo | Valor |
|-------|-------|
| Node | Text Classifier |
| Tipo | @n8n/n8n-nodes-langchain.textClassifier v1.1 |
| Modelo | gpt-4.1-mini |

Categorias relevantes para exclusao:

| Categoria | Descricao |
|-----------|-----------|
| `excluir` | "Para exclusao de registros ou gastos ou entradas financeiras" |
| `excluir_limite` | "quando o usuario solicitar uma exclusao do limite" |
| `excluir_evento_agenda` | "Quando identificar que o usuario deseja excluir algum evento ou lembrete da agenda." |

O prompt deste classificador inclui:
- Etapas de raciocinio: verificar se e AGENDA ou FINANCEIRO, depois selecionar branch CRUD
- Historico das ultimas 5 interacoes para desambiguar
- Branches disponiveis: agenda_criar, agenda_editar, **agenda_excluir**, agenda_listar, financeiro_criar, financeiro_editar, **financeiro_excluir**, financeiro_listar

### Nivel 2 — Escolher Branch

| Campo | Valor |
|-------|-------|
| Node | Escolher Branch |
| Tipo | @n8n/n8n-nodes-langchain.chainLlm v1.7 |
| Modelo | gpt-4.1-mini (OpenAI Chat Model2) |

Este e o classificador PRINCIPAL, com prompt muito detalhado. Regras de exclusao:

**REGRA DE EXCLUSAO (literal do prompt):**
```
Retorne excluir_evento_agenda SOMENTE quando a mensagem atual contiver
verbos EXPLICITOS de exclusao:
"exclua/exclui/excluir/apague/apaga/apagar/delete/remova/remove/
remover/tire/tira/tirar"
"quero que exclua/apague/remova"
NUNCA classifique como excluir quando nao houver verbo de exclusao
na MENSAGEM ATUAL.
```

**REGRA DE DESAMBIGUACAO — GASTO vs EVENTO:**
```
Quando editar ou excluir algo com nome AMBIGUO:
DEFAULT = branch FINANCEIRO
So usar branch de EVENTO quando nome for CLARAMENTE de agenda

Nomes SEMPRE financeiro: uber, ifood, mercado, luz, gasolina,
farmacia, restaurante, delivery, parking, supermercado, almoco, lanche,
boleto, fatura

Nomes SEMPRE evento: reuniao, consulta, dentista, academia, aula,
treino, faculdade, pilates, yoga, corrida, futebol, natacao, musculacao
```

**Branches disponiveis no Switch - Branches1:**

| Output | Branch | Destino |
|--------|--------|---------|
| 3 | excluir | excluir2 (prompt exclusao financeira) |
| 6 | excluir_evento_agenda | prompt_excluir (prompt exclusao agenda) |

### Ponto fraco da classificacao

A regra diz "verbos EXPLICITOS de exclusao" mas nao distingue a **posicao sintatica** da palavra. Exemplo real que falhou:

- Input: "marca reuniao excluir teste amanha as 11h"
- O que o classificador viu: a palavra "excluir" esta presente → classificou como `excluir_evento_agenda`
- O que deveria ter visto: o verbo de acao e "marca" (imperativo, posicao 1) → deveria ser `criar_evento_agenda`

A palavra "excluir" aparece como PARTE DO NOME do evento, nao como verbo de acao. Mas o classificador faz matching por keyword, nao por analise gramatical.

---

## 6. Prompt de Exclusao — O que o AI Agent Recebe

O node `prompt_excluir` (tipo Set) injeta o seguinte prompt no campo `data[0].prompt`, que depois e lido pelo system message do AI Agent:

### Estrutura do prompt

```
MODULO: AGENDA — EXCLUIR EVENTOS
FORMATO: JSON {"acao":"padrao", "mensagem":"texto"}
EMOJIS: 🗑️=status, 📅=nome, 📝=descricao, ⏰=horarios
```

### Fluxo obrigatorio (do prompt)

1. SEMPRE chamar `buscar_eventos` antes de excluir
2. 1 resultado → chamar `excluir_evento` direto → confirmar com emojis
3. Varios resultados → listar numerado → pedir "Excluir 1, 2..."
4. Lote ("todos", "apague tudo") → buscar → confirmar: "Confirma excluir N eventos?" → so apos confirmacao
5. Cancelamento ("cancelar", "desistir") → "Ok, exclusao cancelada."

### Regras de interpretacao

- Periodos: "dessa tarde" = 12:00-17:59, "de noite" = 18:00-23:59, "de manha" = 06:00-11:59
- "ultimo" / "mais recente" → inicio mais recente nos resultados
- "aquele" / "esse" → contexto da listagem anterior
- Sem criterio nenhum → usar contexto/memoria recente do ultimo compromisso

### Verificacao pos-exclusao (do prompt)

```
Apos excluir, chamar buscar_eventos novamente para confirmar.
Se ainda aparecerem: informar que pode demorar segundos.
```

**Na pratica:** O AI Agent NAO segue esta regra. Ele responde "Evento excluido!" imediatamente apos chamar a tool, sem verificar o resultado.

### Formato de resposta

```
1 evento excluido:
"🗑️ Evento excluido!\n\n📅 Nome: X\n📝 Descricao: Y\n⏰ Inicio: dd/mm/aaaa as HH:mm\n⏰ Fim: dd/mm/aaaa as HH:mm"

0 resultados:
"🗑️ Nao encontrei nenhum evento com esses criterios.\n\nMe diga o nome ou a data aproximada."

Varios:
Lista numerada com 📅⏰ cada, pedir escolha
```

---

## 7. Tools do AI Agent — buscar_eventos e excluir_evento

### buscar_eventos

| Campo | Valor |
|-------|-------|
| Tipo | httpRequestTool v4.2 |
| Descricao | "Utilize essa tool para fazer as buscas da agenda." |
| URL | `https://totalassistente.com.br/webhook/busca-total-evento` |
| Metodo | GET |
| Auth | HTTP Basic (Avelum Credential) |

**Parametros do body (preenchidos pela IA via $fromAI):**

| Parametro | Descricao para a IA |
|-----------|---------------------|
| `nome_evento` | "coloque o nome para busca" |
| `descricao_evento` | "coloque a descricao para busca" |
| `data_inicio_evento` | "coloque a data inicial de busca" |
| `data_fim_evento` | "coloque a data final de busca" |
| `user_id` | Hardcoded: `$('setar_user').item.json.id_user` |

**O que retorna:** Lista de eventos do usuario que batem com os filtros. Cada evento contem: uuid (sessao_id), nome, descricao, inicio, fim, google_event_id, etc.

### excluir_evento

| Campo | Valor |
|-------|-------|
| Tipo | httpRequestTool v4.2 |
| Descricao | "Utilize essa tool para excluir eventos, envie a sessao do evento." |
| URL | `https://totalassistente.com.br/webhook/excluir-evento-total` |
| Metodo | POST |
| Auth | HTTP Basic (Avelum Credential) |

**Parametros do body:**

| Parametro | Valor |
|-----------|-------|
| `event_id` | `$fromAI('parameters0_Value', 'coloque o id encontrada do evento aqui.', 'string')` |
| `user_id` | `$('setar_user').item.json.id_user` |

**Ponto fraco:** A descricao para a IA diz "coloque o id encontrada do evento" — e ambiguo sobre QUAL campo da busca usar como ID. Se a IA extrair `session_event_id_google` em vez do `uuid`, pode excluir o evento errado ou falhar silenciosamente.

---

## 8. Exclusao Financeira — Fluxo Paralelo

A exclusao financeira segue um caminho analogo mas com workflows diferentes:

### Classificacao

Mesmo classificador "Escolher Branch", branch `excluir` (output 3) → node `excluir2`

### Prompt (excluir2)

Prompt menor que o de agenda. Foco em:
- Tools: `buscar_registro/buscar_financeiro` + `excluir_registro/excluir_financeiro`
- Fluxo: interpretar → montar filtros → buscar → selecionar alvo → excluir
- Emojis: 🗑️📝💰🗓️
- Regra: "Nunca afirmar exclusao sem chamada de tool bem-sucedida"

### Tool excluir_financeiro

```
POST https://totalassistente.com.br/webhook/excluir-supabase
Body:
  id_gasto = $fromAI(...)
  id_user  = $('setar_user').item.json.id_user
```

Endpoint diferente do de agenda (`/excluir-supabase` vs `/excluir-evento-total`).

### Exclusao de limite

Existe um terceiro tipo de exclusao: limites de gasto.

```
prompt_excluir_limite → AI Agent → excluir_limite tool
POST https://primary-production-0c99.up.railway.app/webhook/excluir_limite
Body: id_user
```

---

## 9. Standard vs Premium — Diferencas na Exclusao

| Aspecto | Premium (Fix Conflito v2) | Standard (User Standard) |
|---------|--------------------------|--------------------------|
| Exclusao de evento agenda | SIM (prompt_excluir + excluir_evento) | NAO — nao tem |
| Exclusao financeira | SIM (excluir2 + excluir_financeiro) | SIM (excluir2 + excluir_financeiro) |
| Exclusao de limite | NAO (nao tem no premium) | SIM (prompt_excluir_limite + excluir_limite) |
| Exclusao por botao | SIM (3 tipos: evento, financeiro, recorrente) | NAO — nao tem botoes |
| Classificador | 2 niveis (Text Classifier + Escolher Branch) | 1 nivel (Escolher Branch) |
| Branches de exclusao | excluir + excluir_evento_agenda | excluir + excluir_limite |

**Implicacao:** Usuarios standard NAO conseguem excluir eventos da agenda pelo chat. So premium tem essa capacidade.

---

## 10. Pontos Fracos Identificados

### PF-1: Hard Delete sem Audit Trail

**Onde:** Calendar WebHooks → nodes `delete_supabase` e `delete_supabase1`
**O que acontece:** Ambos os nodes usam `operation: "delete"` na tabela `calendar`. O registro e permanentemente removido do Supabase.
**Consequencias:**
- Exclusao por engano = dado perdido para sempre
- Nao ha coluna `active`, `deleted_at`, ou tabela de historico
- Impossivel fazer rollback
- Impossivel auditar exclusoes posteriores
- Se o usuario perguntar "o que eu excluir ontem?", nao ha como responder

### PF-2: Classificador Confunde Nome com Intencao

**Onde:** Fix Conflito v2 → "Text Classifier" e "Escolher Branch"
**O que acontece:** A presenca da palavra "excluir" (ou sinonimos) no NOME do evento aciona a classificacao como `excluir_evento_agenda`, mesmo quando o verbo de acao e de criacao ("marca", "cria").
**Evidencia:** SETUP-3 — "marca reuniao excluir teste" foi classificado como exclusao.
**Consequencia cascata:** O evento nunca foi criado → DEL-Q1 (que pretendia testar exclusao desse evento) ficou impossibilitado.
**Raiz do problema:** O classificador faz matching por keyword, nao por analise da posicao sintatica do verbo.

### PF-3: AI Agent Responde Antes de Verificar Resultado

**Onde:** Fix Conflito v2 → AI Agent
**O que acontece:** O AI Agent chama a tool `excluir_evento` e imediatamente formula uma resposta "Evento excluido!" sem esperar ou analisar a resposta do Calendar WebHooks.
**Evidencias:**
- DEL-Q2: IA confirmou exclusao, mas nao se sabe se o Calendar WebHooks realmente processou corretamente
- Padrao observado tambem na edicao (MOD-Q4, MOD-B3): IA confirma acoes que nao aconteceram
**Raiz do problema:** O AI Agent opera em modo fire-and-forget. Ele considera que "chamar a tool = sucesso". O prompt diz para verificar apos excluir (chamar buscar_eventos novamente), mas o LLM nao segue essa instrucao consistentemente.

### PF-4: Resposta do Calendar WebHooks e Generica

**Onde:** Calendar WebHooks → nodes `sucesso_google2` e `sucesso_padrao2`
**O que acontece:** As respostas retornadas sao:
- "exclusao do evento na agenda google e padrao feito com sucesso."
- "evento excluido na agenda padrao com sucesso, usuario nao possui conexao com google agenda."
**Problema:** Nao incluem nome do evento, data, ou qualquer dado que permita ao AI Agent confirmar QUAL evento foi excluido. O Agent teria que confiar na memoria de qual evento ele mandou excluir.

### PF-5: Sem Verificacao de Sucesso do Google Calendar

**Onde:** Calendar WebHooks → entre `excluir_evento_google` e `delete_supabase`
**O que acontece:** O fluxo vai direto de `excluir_evento_google` → `limpar_tokens` → `delete_supabase`. Nao ha node IF verificando se o DELETE no Google retornou 204 (sucesso).
**Cenarios de falha:**
- Token expirado (401) → Google nao deleta, mas Supabase sim → evento orfao no Google
- Evento ja deletado no Google (404) → erro, mas Supabase pode ou nao deletar (depende de onError)
- Google fora do ar (500) → idem
**Resultado:** Possivel inconsistencia entre Google Calendar e Supabase.

### PF-6: Limpeza de Tokens Remove Contexto

**Onde:** Calendar WebHooks → `limpar_tokens_e_reduzir_saida2`
**O que acontece:** Este Set node e VAZIO — zera todos os campos. E uma medida de seguranca valida (nao propagar access_token Google para nodes posteriores).
**Efeito colateral:** O node `delete_supabase` precisa referenciar dados de nodes anteriores (`$('tudo_edit1')` e `$('Edit Fields4')`), nao do node imediatamente anterior. Se a cadeia de expressoes quebrar, o delete pode falhar.

### PF-7: Ambiguidade no Campo event_id da Tool

**Onde:** Fix Conflito v2 → tool `excluir_evento`
**O que acontece:** A descricao $fromAI diz "coloque o id encontrada do evento aqui" — mas nao especifica qual campo do resultado de buscar_eventos usar.
**Campos possiveis no resultado da busca:**
- `uuid` (ID interno do Supabase — o campo correto)
- `session_event_id_google` (ID do Google Calendar)
- `id` (pode ser sequencial)
**Risco:** Se a IA usar o campo errado, o Calendar WebHooks procura por um ID que nao existe, nao encontra o registro, e o fluxo falha silenciosamente.

### PF-8: Exclusao por Botao Nao Verifica Nada

**Onde:** Fix Conflito v2 → "Excluir Evento (Botao)"
**O que acontece:** O caminho de botao faz POST direto para `/excluir-evento-total` com o entityId e depois envia "Evento excluido com sucesso!" via WhatsApp.
**Problema:** Nao ha nenhuma verificacao:
- Nao checa se o POST retornou sucesso
- Nao checa se o evento realmente foi deletado
- Mensagem de sucesso e enviada SEMPRE, independente do resultado
**Cenario de falha:** Se o entityId for invalido (evento ja excluido, UUID corrompido), a mensagem "Excluido com sucesso!" e enviada mesmo assim.

### PF-9: Recorrentes Tratados Igual a Eventos Normais

**Onde:** Calendar WebHooks
**O que acontece:** O endpoint `/excluir-evento-total` nao distingue evento recorrente de evento normal. Ambos recebem o mesmo DELETE.
**Implicacao:** Nao ha logica para:
- Excluir apenas uma ocorrencia de um evento recorrente
- Perguntar "Quer excluir todas as ocorrencias ou so esta?"
- Manter outras ocorrencias ao excluir uma

### PF-10: Sem Rate Limit ou Protecao contra Exclusao em Massa

**Onde:** Calendar WebHooks + Fix Conflito v2
**O que acontece:** O prompt do AI Agent tem regra para pedir confirmacao em exclusao de lote ("apaga todos"). Mas:
- Se o usuario confirma, o Agent chama `excluir_evento` N vezes em sequencia
- Cada chamada dispara um POST independente para o Calendar WebHooks
- Nao ha limite de quantos eventos podem ser excluidos de uma vez
- Nao ha periodo de "cooling off" apos exclusao em massa

---

## 11. Evidencias dos Testes

### Testes de exclusao executados

| ID | Input | Exec | Resultado | Detalhes |
|----|-------|------|-----------|----------|
| DEL-Q1 | "cancela a reuniao excluir teste" | 13732 | SKIP | Evento nao existia (SETUP-3 falhou por PF-2) |
| DEL-Q2 | "exclui a consulta dentista teste" | 13744 | FAIL CRITICO | IA confirmou, registro sumiu hard delete (PF-1) |
| DEL-Q3 | "cancela a aula de violao" | 13738 | PASS | 0 resultados, respondeu corretamente |
| DEL-Q6 | "apaga todos os meus compromissos" | 13775 | PASS | Pediu confirmacao antes de excluir 13 eventos |

### Teste DEL-Q2 — Analise detalhada

Este e o unico teste de exclusao que efetivamente EXECUTOU a exclusao:

1. AI Agent chamou `buscar_eventos` com `nome_evento="consulta dentista teste"`
2. Resultado: encontrou o evento (criado no SETUP-5, exec 13723)
3. AI Agent chamou `excluir_evento` com o ID do evento
4. Calendar WebHooks recebeu → processou → deletou do Supabase (hard delete)
5. AI Agent respondeu: "🗑️ Evento excluido! Consulta Dentista Teste 07/04 15:00"

**Anomalia encontrada:** No banco, apos a exclusao:
- O registro "Consulta Dentista Teste" NAO aparece nem como ativo nem como inativo
- Dois registros "Dentista" aparecem ativos (com datas diferentes)
- Possibilidade: o evento correto foi excluido, e os dois "Dentista" ativos sao eventos pre-existentes (nao criados nesta bateria de testes)

### Teste SETUP-3 — Impacto na exclusao

- Input: "marca reuniao excluir teste amanha as 11h"
- Exec 13717: classificou como `excluir_evento_agenda` (errado!)
- O AI Agent tentou EXCLUIR um evento chamado "Reuniao Teste Auditoria" (o que foi criado no SETUP-1)
- Resultado: nao excluiu (nao encontrou match exato), mas o evento de setup nunca foi criado
- **Impacto:** DEL-Q1 dependia desse evento existir → teste pulado

---

## 12. Mapa Completo de Conexoes entre Nodes

### Fix Conflito v2 — Caminho de exclusao de evento (texto)

```
Code9 (mensagem + historico)
  |
  v
Text Classifier ──[excluir_evento_agenda]──> Escolher Branch
                                                |
Escolher Branch ──[output 6]──> Switch - Branches1
                                    |
                              [excluir_evento_agenda]
                                    |
                                    v
                              prompt_excluir (Set)
                                    |
                                    v
                              Aggregate
                                    |
                                    v
                              AI Agent (gpt-4.1-mini)
                                ├── buscar_eventos (tool)
                                │     GET /busca-total-evento
                                │     → Calendar WebHooks
                                ├── excluir_evento (tool)
                                │     POST /excluir-evento-total
                                │     → Calendar WebHooks
                                └── Think (tool interno)
```

### Fix Conflito v2 — Caminho de exclusao de evento (botao)

```
Switch (messageType = interactive)
  |
  v
Extrair Acao do Botao (Code)
  |  conversation = "evt_del_{uuid}"
  |  → acao = "excluir_evento", entityId = uuid
  v
Tipo de Acao (Switch)
  |  [excluir_evento]
  v
Excluir Evento (Botao) (HTTP)
  |  POST /excluir-evento-total
  |  body: { event_id: entityId, user_id }
  v
Confirmar Exclusao Evento (HTTP)
  |  POST WhatsApp API
  |  "🗑️ Evento excluido com sucesso!"
```

### Calendar WebHooks — Exclusao completa

```
Excluir eventos - Webhook (/excluir-evento-total)
  |
  v
Edit Fields4 (event_id, user_id)
  |
  v
Get a row (Supabase calendar WHERE id=event_id AND user_id=user_id)
  |
  v
buscar_conexao_user2 (Supabase google_calendar_connections)
  |
  v
Edit Fields1 (user_id)
  |
  v
If3 (encrypted_refresh_token exists?)
  |
  +--[TRUE]--+                              +--[FALSE]--+
  |           |                              |            |
  v           |                              v            |
token2        |                     delete_supabase1      |
  |           |                       (DELETE calendar)   |
  v           |                              |            |
descriptografar_token_prod2                  v            |
  |                                 sucesso_padrao2       |
  v                                                       |
refresh_access2                                           |
  |                                                       |
  v                                                       |
tudo_edit1                                                |
  |                                                       |
  v                                                       |
excluir_evento_google (DELETE Google Calendar API)        |
  |                                                       |
  v                                                       |
limpar_tokens_e_reduzir_saida2 (limpa campos)            |
  |                                                       |
  v                                                       |
delete_supabase (DELETE calendar)                        |
  |                                                       |
  v                                                       |
sucesso_google2                                           |
  +-------------------------------------------------------+
```

---

## Conclusao

A exclusao no Total Assistente funciona em DOIS caminhos distintos (texto e botao) que convergem no mesmo endpoint do Calendar WebHooks. O fluxo e funcional — eventos sao de fato excluidos quando o caminho e percorrido corretamente. Porem, existem **10 pontos fracos** estruturais que tornam o processo fragil:

Os mais criticos:
- **Hard delete** sem possibilidade de recuperacao (PF-1)
- **Classificador que confunde nome com intencao** (PF-2) — pode impedir criacao de eventos ou roteiar para exclusao indevida
- **Resposta otimista** do AI Agent (PF-3) — confirma sucesso sem verificar

Estes tres pontos se reforçam: o classificador pode rotear errado (PF-2), a IA pode confirmar algo que nao aconteceu (PF-3), e quando acontece de verdade, o dado e permanentemente perdido (PF-1).
