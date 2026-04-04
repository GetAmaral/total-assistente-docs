# Exclusao Redesenhada — Filosofia BBBK + Seguranca da Aviacao

**Data:** 2026-04-04
**Escopo:** Redesign completo do fluxo de exclusao do Total Assistente, aplicando camadas de defesa da aviacao e design backward da BBBK
**Base:** Estudo dos testes BATERIA-EDICAO-EXCLUSAO-2026-04-03, workflows N8N (Fix Conflito v2, Calendar WebHooks, User Standard), caso BBBK, 10 frameworks de seguranca da aviacao

---

## A Promessa (Projetando de Tras para Frente — Metodo BBBK)

Al Burger nao perguntou "como melhorar nosso servico?". Ele perguntou:

> **"O que eu preciso GARANTIR para vencer? Agora vou construir o sistema que entrega isso."**

Aplicando ao Total Assistente, a promessa para exclusao e:

> **"Toda exclusao que o usuario pedir vai acontecer exatamente como ele quis. Se errarmos, o usuario pode desfazer instantaneamente. O sistema NUNCA vai dizer que excluiu algo que nao excluiu, e NUNCA vai excluir algo que o usuario nao pediu."**

Para cumprir essa promessa, precisamos construir **10 camadas de defesa** (Swiss Cheese) onde cada camada assume que as outras vao falhar.

---

## As 10 Camadas de Defesa para Exclusao

```
CAMADA 1  — Classificacao inteligente (nao confundir nome com intencao)
CAMADA 2  — Confirmacao visual antes de excluir (mostrar O QUE vai excluir)
CAMADA 3  — Verificacao pos-exclusao (confirmar que REALMENTE excluiu)
CAMADA 4  — Soft delete com periodo de grace (reversibilidade)
CAMADA 5  — Resposta do Calendar WebHooks com dados ricos (nao generica)
CAMADA 6  — Validacao de sucesso do Google Calendar
CAMADA 7  — Desambiguacao do event_id (campo correto, sem ambiguidade)
CAMADA 8  — Botao com verificacao (nao fire-and-forget)
CAMADA 9  — Tratamento de recorrentes como caso especial
CAMADA 10 — Auditoria e aprendizado continuo (LOSA + Kaizen)
```

Cada camada esta detalhada abaixo com: **o problema atual**, **a correcao concreta**, e **o framework de aviacao que fundamenta**.

---

## CAMADA 1 — Classificacao Inteligente

### Framework: TEM (Threat and Error Management) + SHELL Model

**Ameaca identificada:** A palavra "excluir" (ou sinonimos) no NOME do evento dispara a classificacao como `excluir_evento_agenda`, mesmo quando o verbo de acao e de criacao.

**Evidencia:** SETUP-3 — "marca reuniao excluir teste amanha as 11h" → classificado como exclusao.

**Analise SHELL:** Desajuste L-S (humano-software). O prompt do classificador diz "verbos EXPLICITOS de exclusao" mas nao ensina a distinguir posicao sintatica. A "interface" entre o prompt e o LLM e ambigua.

### Correcao: Prompt do Escolher Branch — Regra de Exclusao Reescrita

**Atual:**
```
REGRA DE EXCLUSAO

Retorne excluir_evento_agenda SOMENTE quando a mensagem atual contiver
verbos EXPLICITOS de exclusao:
- "exclua/exclui/excluir/apague/apaga/apagar/delete/remova/remove/
remover/tire/tira/tirar"
- "quero que exclua/apague/remova"

NUNCA classifique como excluir quando nao houver verbo de exclusao
na MENSAGEM ATUAL.
```

**Corrigido:**
```
REGRA DE EXCLUSAO (ATUALIZADA)

Retorne excluir_evento_agenda SOMENTE quando o VERBO PRINCIPAL da frase
(o primeiro verbo na posicao de comando/imperativo) for de exclusao.

Verbos de exclusao validos (so contam quando sao o VERBO PRINCIPAL):
"exclua/exclui/excluir/apague/apaga/apagar/delete/remova/remove/
remover/tire/tira/tirar/cancela/cancelar/cancele"

TESTE OBRIGATORIO EM 2 PASSOS:
1. Identifique o VERBO PRINCIPAL da frase (primeiro verbo, posicao de comando)
2. Verifique se esse verbo esta na lista acima

Se o verbo principal for de CRIACAO (marca, cria, agenda, coloca, adiciona, bota)
e a palavra de exclusao aparece DEPOIS de um substantivo (reuniao, compromisso,
evento, lembrete), entao a palavra de exclusao faz parte do NOME — NAO e intencao.

EXEMPLOS CRITICOS:
- "marca reuniao excluir teste amanha" → criar_evento_agenda
  (verbo principal = "marca" = criar. "excluir" e parte do nome "reuniao excluir teste")
- "cria evento deletar planilha amanha 9h" → criar_evento_agenda
  (verbo principal = "cria" = criar. "deletar" e parte do nome)
- "agenda compromisso apagar dados dia 5" → criar_evento_agenda
  (verbo principal = "agenda" = criar. "apagar" e parte do nome)
- "exclui a reuniao de teste" → excluir_evento_agenda
  (verbo principal = "exclui" = exclusao)
- "cancela o compromisso das 14h" → excluir_evento_agenda
  (verbo principal = "cancela" = exclusao)
- "apaga o lembrete de amanha" → excluir_evento_agenda
  (verbo principal = "apaga" = exclusao)
- "quero que exclua a consulta" → excluir_evento_agenda
  (verbo principal = "exclua" = exclusao)
- "tira o treino de sexta" → excluir_evento_agenda
  (verbo principal = "tira" = exclusao)

REGRA DE OURO: Se a frase comeca com verbo de CRIACAO e contem palavra
de exclusao no meio/fim, e SEMPRE criacao. O verbo que manda e o primeiro.

NUNCA classifique como excluir quando:
• O verbo principal e de criacao ("marca", "cria", "agenda", "coloca", "bota")
• A palavra de exclusao aparece apos substantivo (faz parte do nome do evento)
• Nao ha verbo de exclusao na MENSAGEM ATUAL como verbo principal
```

### Analise BowTie desta camada

```
Causa: palavra de exclusao no nome ──┐
Causa: LLM faz keyword matching    ──┤── BARREIRA: teste de 2 passos ──> PERIGO EVITADO
Causa: prompt ambiguo               ──┘   (identificar verbo principal)
```

Se esta barreira falhar, a Camada 2 (confirmacao visual) ainda protege o usuario.

---

## CAMADA 2 — Confirmacao Visual Antes de Excluir

### Framework: CRM (Crew Resource Management) + BBBK (responsabilidade compartilhada)

**Problema atual:** Para 1 resultado, o AI Agent exclui direto sem confirmar. O prompt diz "1 resultado → excluir_evento direto". Isso e o equivalente a um piloto que nao faz o checklist antes de decolar.

**Principio CRM:** Nenhuma acao critica sem confirmacao cruzada. Na aviacao, mesmo o capitao mais experiente le o checklist antes de cada decolagem.

**Principio BBBK:** Al Burger exigia responsabilidade compartilhada — o cliente tambem tinha obrigacoes. No nosso caso, o usuario precisa VER o que vai ser excluido antes de confirmar.

### Correcao: Prompt de Exclusao — Fluxo com Confirmacao

**Atual (trecho do prompt_excluir):**
```
FLUXO OBRIGATORIO:
1. SEMPRE buscar_eventos antes de excluir
2. 1 resultado → excluir_evento direto → confirmar com emojis
3. Varios → listar numerado → pedir escolha
4. Lote → confirmar quantidade
5. Cancelamento → cancelar
```

**Corrigido:**
```
FLUXO OBRIGATORIO (ATUALIZADO — CONFIRMA SEMPRE):

1. SEMPRE chamar buscar_eventos antes de qualquer exclusao
2. Se 0 resultados → responder que nao encontrou (sem chamar excluir_evento)
3. Se 1 resultado → MOSTRAR o evento encontrado e PEDIR CONFIRMACAO:
   "🗑️ Encontrei esse evento:\n\n📅 Nome: {nome}\n⏰ {data} as {hora}\n\nConfirma a exclusao?"
   NAO chamar excluir_evento ainda. Aguardar resposta.
4. Se o usuario confirmar ("sim", "pode", "confirma", "isso", "exclui") →
   AGORA chamar excluir_evento → verificar resultado → responder
5. Se o usuario negar ("nao", "cancela", "errado") →
   "🗑️ Ok, exclusao cancelada."
6. Se varios resultados → listar numerado com 📅⏰ → pedir escolha
7. Se lote ("todos", "apague tudo") → buscar → listar todos →
   "🗑️ Confirma excluir esses N eventos?" → so apos confirmacao

EXCECAO DE CONFIRMACAO — quando o usuario ja deu contexto completo e inequivoco
na MESMA mensagem (nome exato + data + hora), E so 1 resultado bateu EXATAMENTE:
NESSE caso pode excluir direto sem pedir confirmacao.
Exemplo: "exclui a consulta dentista de amanha as 15h" + busca retorna
exatamente 1 evento "Consulta Dentista" em 05/04 as 15:00 → pode excluir direto.

Em caso de DUVIDA, SEMPRE confirmar. A confirmacao custa 1 mensagem.
A exclusao errada custa a confianca do usuario.
```

### Por que a excecao existe

A BBBK nao pedia confirmacao redundante quando o contexto era claro. Al Burger dizia "NUNCA CONFIRME. APENAS FACA" quando todas as informacoes ja estavam presentes. A excecao segue a mesma logica: se o usuario deu nome + data + hora e so existe 1 match exato, confirmar seria friccao desnecessaria.

Mas quando ha QUALQUER ambiguidade (nome parcial, multiplos matchs, sem data), confirmar e obrigatorio.

---

## CAMADA 3 — Verificacao Pos-Exclusao

### Framework: TEM (gestao de estados indesejados) + SMS Pilar 3 (garantia de seguranca)

**Problema atual:** O AI Agent responde "Evento excluido!" ANTES de saber se o Calendar WebHooks processou com sucesso. O prompt ate diz "chamar buscar_eventos novamente para confirmar", mas o LLM nao segue essa instrucao consistentemente.

**Analise TEM:** O estado indesejado e "usuario acredita que excluiu, mas nao excluiu". Isso acontece porque nao ha gestao do estado — o Agent opera em fire-and-forget.

### Correcao: Prompt de Exclusao — Verificacao Obrigatoria

**Adicionar ao prompt_excluir (apos a secao de FLUXO OBRIGATORIO):**
```
VERIFICACAO POS-EXCLUSAO (OBRIGATORIA — NUNCA PULAR):

Apos chamar excluir_evento, voce DEVE verificar o resultado:

1. Analise a resposta da tool excluir_evento
2. Se a resposta contem "sucesso" ou "excluido" → exclusao confirmada
3. Se a resposta contem "erro", "falha", "nao encontrado" → exclusao FALHOU

REGRA ABSOLUTA:
• Se excluir_evento retornou SUCESSO → responder com 🗑️ + detalhes do evento
• Se excluir_evento retornou ERRO → "🗑️ Nao consegui excluir esse evento. Tente novamente."
• Se excluir_evento nao retornou nada / timeout → "🗑️ Nao consegui confirmar a exclusao. Verifique se o evento ainda aparece na sua agenda."

NUNCA diga "Evento excluido!" se a resposta da tool nao confirmou sucesso.
NUNCA assuma que a exclusao funcionou so porque voce chamou a tool.
Voce NAO sabe se funcionou ate ver a resposta. Trate como um piloto que
verifica os instrumentos APOS cada acao — nunca assuma.
```

### Correcao complementar: Calendar WebHooks — Resposta rica

Para que a verificacao funcione, o Calendar WebHooks precisa retornar dados uteis. Ver **Camada 5**.

---

## CAMADA 4 — Soft Delete com Periodo de Grace

### Framework: BowTie (barreira de mitigacao) + BBBK (garantia = risco zero para o cliente)

**Problema atual:** Os nodes `delete_supabase` e `delete_supabase1` fazem `operation: "delete"` — hard delete. O registro desaparece permanentemente. Sem rollback, sem audit trail.

**Principio BBBK:** A garantia da BBBK transferia TODO o risco para a empresa. Se errasse, pagava. No nosso caso, se o sistema excluir errado, o usuario perde o evento para sempre. Isso e risco no cliente — o oposto da filosofia BBBK.

**Principio BowTie:** Este e uma barreira de MITIGACAO (lado direito). Mesmo que todas as barreiras de prevencao falhem e um evento seja excluido por engano, o soft delete permite recuperar.

### Correcao: Substituir Hard Delete por Soft Delete

**Prerequisito no Supabase — Adicionar colunas na tabela calendar:**
```sql
ALTER TABLE calendar
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Index para queries que filtram eventos ativos
CREATE INDEX IF NOT EXISTS idx_calendar_active
  ON calendar (user_id, is_deleted)
  WHERE is_deleted = FALSE;
```

**Node delete_supabase — Mudar de DELETE para UPDATE:**

Atual:
```
operation: "delete"
table: "calendar"
filters: session_event_id_google eq X AND id eq Y
```

Corrigido:
```
operation: "update"
table: "calendar"
filters: session_event_id_google eq X AND id eq Y
fields:
  is_deleted = true
  deleted_at = {{ $now.toISO() }}
```

**Node delete_supabase1 — Mesma mudanca:**

Atual:
```
operation: "delete"
table: "calendar"
filters: id eq X
```

Corrigido:
```
operation: "update"
table: "calendar"
filters: id eq X
fields:
  is_deleted = true
  deleted_at = {{ $now.toISO() }}
```

**Ajuste em TODOS os SELECTs da tabela calendar:**

Toda query que busca eventos precisa adicionar:
```sql
WHERE is_deleted = FALSE
-- ou equivalente no Supabase node:
filter: is_deleted eq false
```

Isso inclui:
- buscar_eventos (Calendar WebHooks endpoint /busca-total-evento)
- Get a row (dentro do fluxo de edicao)
- Qualquer outro SELECT na tabela calendar

**Limpeza periodica (opcional, recomendado):**
```sql
-- Job semanal: hard delete de registros com mais de 30 dias de exclusao
DELETE FROM calendar
WHERE is_deleted = TRUE
AND deleted_at < NOW() - INTERVAL '30 days';
```

### Funcionalidade "Desfazer" (bonus)

Com soft delete, o usuario pode desfazer:

**No prompt_excluir, adicionar:**
```
Apos confirmar exclusao bem-sucedida, incluir na mensagem:
"Se quiser desfazer, e so me dizer 'desfaz a exclusao'."
```

**Criar branch desfazer_exclusao no classificador** (ou tratar no proprio prompt_excluir):
```
Se o usuario disser "desfaz", "desfazer", "restaura", "volta o evento",
"nao era pra excluir", "errei":
→ Buscar ultimo evento com is_deleted=true para esse usuario
→ UPDATE calendar SET is_deleted=false, deleted_at=null WHERE id=X
→ "✅ Evento restaurado! 📅 {nome} ⏰ {data} as {hora}"
```

---

## CAMADA 5 — Resposta Rica do Calendar WebHooks

### Framework: CRM (comunicacao assertiva) + SHELL (interface L-S)

**Problema atual:** Os nodes `sucesso_google2` e `sucesso_padrao2` retornam mensagens genericas:
- "exclusao do evento na agenda google e padrao feito com sucesso."
- "evento excluido na agenda padrao com sucesso."

Sem nome do evento, sem data, sem detalhes. O AI Agent nao tem como confirmar QUAL evento foi excluido.

**Principio CRM:** Na aviacao, toda comunicacao critica usa readback/hearback — o receptor repete o que ouviu para confirmar. O Calendar WebHooks precisa "repetir" o que fez.

### Correcao: Nodes de sucesso com dados completos

**Node sucesso_google2 — Corrigido:**
```
Campos retornados:
  status    = "sucesso"
  tipo      = "exclusao_google_e_supabase"
  evento    = {
    id:     $('Edit Fields4').item.json.event_id,
    nome:   $('Get a row').item.json.event_name,
    inicio: $('Get a row').item.json.start_event,
    fim:    $('Get a row').item.json.end_event,
    desc:   $('Get a row').item.json.desc_event
  }
  mensagem  = "Evento excluido com sucesso do Google Calendar e do banco."
```

**Node sucesso_padrao2 — Corrigido:**
```
Campos retornados:
  status    = "sucesso"
  tipo      = "exclusao_supabase_apenas"
  evento    = {
    id:     $('Edit Fields4').item.json.event_id,
    nome:   $('Get a row').item.json.event_name,
    inicio: $('Get a row').item.json.start_event,
    fim:    $('Get a row').item.json.end_event,
    desc:   $('Get a row').item.json.desc_event
  }
  mensagem  = "Evento excluido do banco. Usuario sem conexao Google."
```

**Importante:** O node `Get a row` busca o registro ANTES de deletar, entao os dados do evento estao disponiveis. So precisam ser passados adiante.

Com respostas ricas, o AI Agent pode:
1. Verificar se o status e "sucesso" (Camada 3)
2. Confirmar o NOME do evento na mensagem ao usuario
3. Detectar se o evento errado foi excluido

---

## CAMADA 6 — Validacao de Sucesso do Google Calendar

### Framework: Swiss Cheese (fortalecer camada) + SMS Pilar 2 (gestao de risco)

**Problema atual:** O fluxo vai de `excluir_evento_google` direto para `limpar_tokens` → `delete_supabase`. Se o DELETE no Google falhar (401, 404, 500), o Supabase pode ser deletado mesmo assim, criando inconsistencia.

**Analise de risco (SMS Pilar 2):**
- Probabilidade: media (tokens expiram, Google pode estar lento)
- Severidade: alta (evento some do Supabase mas permanece no Google)
- Mitigacao necessaria: verificar status antes de prosseguir

### Correcao: Adicionar node IF apos excluir_evento_google

**Novo node: "Verificar Exclusao Google" (tipo IF):**

Posicao: entre `excluir_evento_google` e `limpar_tokens_e_reduzir_saida2`

```
Condicao:
  $json.statusCode == 204 OR $json.statusCode == 200 OR $json.statusCode == 410
  (204 = deletado, 200 = OK, 410 = Gone/ja deletado)

TRUE → continuar para limpar_tokens → delete_supabase → sucesso_google2
FALSE → NÃO deletar do Supabase → retornar erro:
  {
    status: "erro",
    tipo: "falha_google",
    statusCode: $json.statusCode,
    mensagem: "Nao foi possivel excluir do Google Calendar. Evento mantido no banco.",
    evento: { dados do evento }
  }
```

**Fluxo atualizado:**
```
excluir_evento_google
  |
  v
Verificar Exclusao Google (IF)
  |
  +--[status 204/200/410]--→ limpar_tokens → soft_delete_supabase → sucesso_google2
  |
  +--[outro status]--→ erro_google2 (resposta de falha, SEM tocar Supabase)
```

Isso garante que o Supabase e o Google ficam SEMPRE sincronizados. Nunca um sem o outro.

---

## CAMADA 7 — Desambiguacao do event_id

### Framework: SHELL Model (interface L-S) + CRM (comunicacao clara)

**Problema atual:** A tool `excluir_evento` tem $fromAI com descricao "coloque o id encontrada do evento aqui." — ambiguo sobre QUAL campo usar. O prompt diz `sessao_id`, o parametro se chama `event_id`, e o resultado de buscar_eventos pode ter multiplos campos de ID.

**Analise SHELL:** Desajuste L-S puro. A "interface" entre o prompt e a tool nao e clara.

### Correcao: Descricao $fromAI precisa e alinhada

**Atual:**
```
$fromAI('parameters0_Value', 'coloque o id encontrada do evento aqui.', 'string')
```

**Corrigido:**
```
$fromAI('event_uuid', 'O campo "uuid" retornado por buscar_eventos. Use EXATAMENTE o valor do campo uuid do evento que sera excluido. NAO use session_event_id_google nem nenhum outro campo.', 'string')
```

**Correcao complementar no prompt_excluir:**

Adicionar na secao de TOOLS:
```
TOOLS (internas, nunca expor):
buscar_eventos: nome_evento, descricao_evento, data_inicio_evento, data_fim_evento
  → retorna lista de eventos, cada um com campo "uuid" (identificador unico)
excluir_evento: event_uuid (o campo "uuid" do evento encontrado), user_id (automatico)

REGRA: Ao chamar excluir_evento, use SEMPRE o campo "uuid" do resultado de buscar_eventos.
Nunca use session_event_id_google, id, ou qualquer outro campo como identificador.
```

---

## CAMADA 8 — Botao com Verificacao

### Framework: TEM (gestao de erros) + Just Culture (o sistema deve impedir o erro)

**Problema atual:** O caminho de botao faz POST direto para `/excluir-evento-total` e SEMPRE envia "Evento excluido com sucesso!" via WhatsApp, independente do resultado.

**Principio Just Culture:** Se o sistema permite que um erro aconteca sem verificacao, o erro e do SISTEMA, nao do usuario. O botao que confirma sucesso sem verificar e uma falha de design.

### Correcao: Verificar resposta antes de confirmar

**Atual:**
```
Excluir Evento (Botao) → Confirmar Exclusao Evento (sempre envia "sucesso")
```

**Corrigido:**
```
Excluir Evento (Botao)
  |
  v
IF (verificar resposta)
  |
  +--[status == "sucesso"]--→ Confirmar Exclusao Evento
  |                            "🗑️ Evento excluido com sucesso!"
  |
  +--[status != "sucesso"]--→ Informar Erro Exclusao
                               "⚠️ Nao consegui excluir esse evento. Tente novamente ou me diga o nome do evento."
```

**Implementacao N8N:**

Adicionar node IF entre "Excluir Evento (Botao)" e "Confirmar Exclusao Evento":

```
Condicao: $json.status == "sucesso"
TRUE → Confirmar Exclusao Evento (mensagem existente)
FALSE → Novo node "Informar Erro Exclusao" (HTTP POST WhatsApp com mensagem de erro)
```

Isso so funciona se o Calendar WebHooks retornar dados ricos (Camada 5). Os dois se complementam.

---

## CAMADA 9 — Recorrentes como Caso Especial

### Framework: HFACS nivel 3 (supervisao) + SMS Pilar 2 (gestao de risco)

**Problema atual:** O endpoint `/excluir-evento-total` nao distingue evento recorrente de evento normal. Ambos recebem DELETE simples. Nao ha opcao de excluir apenas uma ocorrencia.

**Analise HFACS nivel 3 (supervisao):** Este e um risco conhecido que nao foi tratado. A "supervisao" (design do sistema) falhou em prever que recorrentes precisam de tratamento especial.

### Correcao: Fluxo bifurcado para recorrentes

**No prompt_excluir, adicionar regra:**
```
EVENTOS RECORRENTES:
Quando o resultado de buscar_eventos indicar que o evento e recorrente
(campo tipo_compromisso = "lembrete_recorrente" ou similar):

1. Perguntar: "🗑️ Esse evento e recorrente. Quer excluir:\n
   1️⃣ Apenas esta ocorrencia\n
   2️⃣ Todas as ocorrencias futuras\n
   3️⃣ Todas as ocorrencias (passadas e futuras)"
2. Aguardar resposta
3. Se "1" ou "apenas esta" → excluir_evento com o UUID dessa ocorrencia
4. Se "2" ou "futuras" → excluir_evento com flag tipo="futuras"
5. Se "3" ou "todas" → excluir_evento com flag tipo="todas"
```

**No Calendar WebHooks**, o endpoint precisa aceitar o parametro `tipo_exclusao`:
- `unica` → soft delete apenas do registro com esse UUID
- `futuras` → soft delete de todos com mesmo `recurrence_group_id` e `start_event >= now()`
- `todas` → soft delete de todos com mesmo `recurrence_group_id`

Isso e uma mudanca mais complexa que exige novo campo no banco (`recurrence_group_id`). Pode ser implementada em fase posterior. Por enquanto, o prompt pelo menos INFORMA ao usuario que esta excluindo todas as ocorrencias.

---

## CAMADA 10 — Auditoria e Aprendizado Continuo

### Framework: LOSA (observar operacoes normais) + Kaizen (melhoria incremental) + Just Culture (cultura de aprendizado)

**Problema atual:** Nao existe mecanismo para observar exclusoes que funcionaram "normalmente" e identificar riscos latentes. So descobrimos problemas quando o usuario reclama.

**Principio LOSA:** A aviacao nao espera o acidente. Observadores treinados entram no cockpit em voos NORMAIS e registram ameacas/erros que acontecem rotineiramente mas nao causaram acidente AINDA.

### Correcao: Log de exclusao para auditoria

**Novo: Tabela de audit log no Supabase:**
```sql
CREATE TABLE IF NOT EXISTS exclusion_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id UUID NOT NULL,
  event_name TEXT,
  event_start TIMESTAMPTZ,
  event_end TIMESTAMPTZ,
  exclusion_source TEXT NOT NULL,  -- 'ai_agent' | 'botao_evento' | 'botao_recorrente'
  classifier_branch TEXT,          -- branch que classificou (para detectar erros de classificacao)
  ai_agent_exec_id TEXT,           -- execution ID do N8N (para rastreabilidade)
  google_deleted BOOLEAN DEFAULT FALSE,
  supabase_deleted BOOLEAN DEFAULT FALSE,
  google_status_code INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  restored_at TIMESTAMPTZ DEFAULT NULL  -- preenchido se usuario desfez
);
```

**Node de audit no Calendar WebHooks:**

Adicionar node "Log Exclusao" (Supabase INSERT) ANTES do soft delete:
```
INSERT INTO exclusion_audit_log (
  user_id, event_id, event_name, event_start, event_end,
  exclusion_source, google_deleted, supabase_deleted, google_status_code
) VALUES (
  user_id, event_id, event_name, start_event, end_event,
  'ai_agent',  -- ou 'botao_evento'
  true/false,  -- resultado do DELETE Google
  true,        -- soft delete Supabase
  status_code  -- do Google Calendar API
)
```

**Auditoria periodica (Kaizen + LOSA):**

Semanalmente, consultar o audit log:
```sql
-- Exclusoes que falharam no Google mas foram deletadas do Supabase
SELECT * FROM exclusion_audit_log
WHERE google_deleted = FALSE AND supabase_deleted = TRUE;

-- Exclusoes restauradas (usuario desfez = sinal de erro do sistema)
SELECT * FROM exclusion_audit_log
WHERE restored_at IS NOT NULL;

-- Exclusoes por fonte (detectar se botao tem mais problemas que IA ou vice-versa)
SELECT exclusion_source, COUNT(*), COUNT(*) FILTER (WHERE google_deleted = FALSE)
FROM exclusion_audit_log
GROUP BY exclusion_source;
```

Cada exclusao restaurada e um **payout BBBK** — um sinal visivel e mensuravel de que o sistema falhou. Exatamente como a BBBK usava cada payout de garantia para identificar e corrigir falhas no processo.

---

## Resumo: Mapa BowTie Completo da Exclusao

```
CAUSAS (ameacas)                BARREIRAS DE PREVENCAO           PERIGO              BARREIRAS DE MITIGACAO        CONSEQUENCIAS
                                                                                     
Palavra de exclusao   ──────── Camada 1: Classificador ────┐                    ┌─── Camada 4: Soft delete ──── Dado perdido
no nome do evento              inteligente (verbo principal)│                    │    (reversivel 30 dias)        (EVITADO)
                                                            │                    │
Usuario pede exclusao ──────── Camada 2: Confirmacao ──────┤                    ├─── Camada 5: Resposta rica ── Usuario enganado
ambigua                        visual (mostrar evento)      │                    │    do Calendar WebHooks        (EVITADO)
                                                            │                    │
IA chama tool errada  ──────── Camada 7: Desambiguacao ────┤   EXCLUSAO         ├─── Camada 6: Validacao ────── Google/Supabase
(campo ID errado)              do event_id                  │   INDEVIDA         │    sucesso Google              inconsistentes
                                                            │      ◆             │                                (EVITADO)
Google fora do ar     ──────── Camada 6: Verificar status ─┤                    ├─── Camada 3: Verificacao ──── IA mente pro
                               antes de deletar Supabase    │                    │    pos-exclusao                usuario
                                                            │                    │                                (EVITADO)
Botao com ID invalido ──────── Camada 8: Botao verifica ───┤                    ├─── Camada 10: Audit log ────  Problema se
                               resultado                    │                    │    + LOSA semanal               repete
                                                            │                    │                                (EVITADO)
Evento recorrente     ──────── Camada 9: Tratamento ───────┘                    └─── Camada 4: "Desfazer" ────  Confianca
excluido inteiro               especial de recorrentes                               (restaurar evento)           quebrada
                                                                                                                  (EVITADO)
```

---

## Ordem de Implementacao (Priorizada por Impacto vs Esforco)

### Fase 1 — Impacto imediato, esforco baixo (prompts e expressoes)

| # | Camada | O que mudar | Onde | Esforco |
|---|--------|-------------|------|---------|
| 1 | Camada 1 | Regra de exclusao reescrita | prompt do Escolher Branch | Trocar texto no node Set |
| 2 | Camada 3 | Verificacao pos-exclusao obrigatoria | prompt_excluir | Adicionar paragrafos ao prompt |
| 3 | Camada 7 | Descricao $fromAI precisa | tool excluir_evento | Trocar string do $fromAI |
| 4 | Camada 2 | Confirmacao visual antes de excluir | prompt_excluir | Reescrever fluxo obrigatorio |

Estas 4 correcoes sao **apenas mudancas de texto em nodes existentes**. Nao exigem novos nodes, novas tabelas, ou mudancas de arquitetura. Podem ser aplicadas em minutos.

### Fase 2 — Impacto alto, esforco medio (workflow + banco)

| # | Camada | O que mudar | Onde | Esforco |
|---|--------|-------------|------|---------|
| 5 | Camada 4 | Soft delete (ALTER TABLE + mudar operation) | Supabase + Calendar WebHooks | ALTER TABLE + trocar 2 nodes |
| 6 | Camada 5 | Respostas ricas nos nodes de sucesso | Calendar WebHooks | Editar 2 nodes Set |
| 7 | Camada 6 | IF apos excluir_evento_google | Calendar WebHooks | Adicionar 1 node IF + rewire |
| 8 | Camada 8 | IF apos Excluir Evento (Botao) | Fix Conflito v2 | Adicionar 1 node IF + 1 node HTTP |

### Fase 3 — Impacto medio, esforco alto (novas funcionalidades)

| # | Camada | O que mudar | Onde | Esforco |
|---|--------|-------------|------|---------|
| 9 | Camada 10 | Tabela de audit log | Supabase + Calendar WebHooks | CREATE TABLE + novo node INSERT |
| 10 | Camada 9 | Fluxo bifurcado para recorrentes | Calendar WebHooks + prompt | Novo parametro + logica |
| 11 | Camada 4 | Funcionalidade "Desfazer" | Fix Conflito v2 + prompt | Novo branch + endpoint |

---

## O Ciclo Virtuoso (BBBK + Kaizen)

```
Promessa ao usuario: "Toda exclusao sera exata. Se errarmos, voce desfaz."
       |
       v
10 camadas de defesa obrigam o sistema a ser excelente
       |
       v
Erros de exclusao se tornam rarisimos
       |
       v
Quando erros acontecem, o audit log (Camada 10) detecta
       |
       v
Cada erro detectado gera correcao no sistema
       |
       v
Sistema fica ainda mais robusto
       |
       v
(volta ao topo — Kaizen)
```

Exatamente como a BBBK: a garantia forcou a empresa a ser tao boa que quase nunca precisava pagar. As 10 camadas forcam o sistema a ser tao bom que erros de exclusao se tornam estatisticamente irrelevantes.

**O objetivo nao e 0% de erro (impossivel). O objetivo e que cada erro seja:**
1. Detectado antes de chegar ao usuario (camadas 1-3, 6-8)
2. Reversivel quando chega ao usuario (camada 4)
3. Registrado para aprendizado (camada 10)
4. Corrigido no sistema para nao se repetir (Kaizen)

Isso e a aviacao aplicada a software: nao confiar em nenhuma camada sozinha, e tratar cada falha como informacao — nao como vergonha.
