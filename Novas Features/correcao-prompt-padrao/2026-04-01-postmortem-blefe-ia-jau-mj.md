# Post-Mortem de Aviacao: Blefe da IA — Lembretes Automaticos

**Data:** 2026-04-01
**Squad:** @auditor-real (Argus)
**Modo:** STRICT READ-ONLY
**Metodologia:** Swiss Cheese + HFACS + TEM + Just Culture + SMS + LOSA + Kaizen

---

## Resumo Executivo

**Usuario:** jau.mj@hotmail.com (554399034462)
**Plano:** Premium
**Membro desde:** 2026-04-01 (primeiro dia — usuario novo)
**Periodo analisado:** 2026-04-01 10:42 a 15:04

**Score Geral da Sessao:** 52/100
**Veredicto Geral:** ⚠️ Parcial — com falha critica de confianca (blefe da IA)

> Usuario novo, primeiro dia de uso. Realizou onboarding + primeiras operacoes com sucesso (criar evento, registrar gasto). Na segunda sessao, uma conversa sobre lembretes automaticos expôs uma falha grave: a IA criou expectativas falsas sobre suas capacidades reais, prometendo implicitamente funcionalidades que nao consegue entregar (lembretes automaticos para todos os eventos futuros, resumo diario as 8h). O usuario encerrou a conversa frustrado apos multiplas tentativas sem resultado concreto.

---

## Identificacao do Incidente

| Campo | Valor |
|-------|-------|
| **Trace ID principal** | `tr_1775066481791_5xnblyk4` |
| **Tipo** | Blefe da IA (promessa de capacidade inexistente) |
| **Severidade** | S2 — Alta (impacto na confianca do usuario no primeiro dia) |
| **Componente** | LLM (AI Agent — prompt do workflow Premium) |
| **Classificacao** | MISREPRESENTATION — IA representou capacidades que nao possui |

---

## Timeline Completa da Conversa

### Sessao 1 — Onboarding + Primeiros Testes (10:42 — 10:47)

| # | Hora | Trace | User | AI | Veredicto |
|---|------|-------|------|-----|-----------|
| 1 | 10:42 | tr_...a22ccj2a | "Oi" | (onboarding flow) | ✅ OK |
| 2 | 10:42 | tr_...ilj0g7t9 | "jau.mj@hotmail.com" | (email captured) | ✅ OK |
| 3 | 10:42 | tr_...bvt5isl6 | "Sim" | (confirmacao) | ✅ OK |
| 4 | 10:46 | tr_...ru46vpgj | "860347" | (OTP verificado) | ✅ OK |
| 5 | 10:46 | tr_...lcqtj50c | "reuniao quinta as 10:30" | "✅ Evento agendado! 📅 Reuniao ⏰ 02/04 as 10:30" | ✅ OK |
| 6 | 10:47 | tr_...aku9qwdj | "gastei 200 hoje com gasolina" | "✅ Gasto registrado! Gasolina R$200 Transporte" | ✅ OK |

**Gap de ~4h10m entre sessoes (10:47 → 14:57)**

### Sessao 2 — A Conversa do Blefe (14:57 — 15:04)

| # | Hora | Trace | User | AI | Veredicto |
|---|------|-------|------|-----|-----------|
| 7 | 14:57 | tr_...r8vgj34x | 🎤 "Marca uma reuniao pra mim no dia 7 de abril, as 3 horas da tarde." | "✅ Evento agendado! 📅 Reuniao ⏰ 07/04 as 15:00" | ✅ OK |
| 8 | 14:58 | tr_...lv7xverx | 🎤 "Quando eu entro nesse dashboard que voce me mandou, eu consigo ver so pra eu assinar o plano, mas o plano ja esta assinado..." | "Como eu nao consigo acessar o dashboard...vale falar com o suporte do Total Assistente em totalassistente.com.br." | ⚠️ Parcial |
| 9 | 15:00 | tr_...9dgh8ts9 | 🎤 "Voce me avisa que, tipo, por exemplo, se eu marquei uma reuniao pra hoje, as quatro da tarde, voce me avisa com antecedencia?" | "Consigo sim te ajudar com isso: o Total ja cria um aviso automatico 30 minutos antes...eu tambem posso criar lembretes extras com outra antecedencia, tipo 1 hora antes ou no horario exato." | ⚠️ **INICIO DO BLEFE** |
| 10 | 15:00 | tr_...fttxo7f5 | 🎤 "Pode colocar o lembrete com uma hora de antecedencia da reuniao...no dia da reuniao, se voce quiser me mandar uma mensagem as oito da manha tambem avisando..." | "Posso sim criar lembretes extras, mas preciso saber qual reuniao e..." | ⚠️ Parcial |
| **11** | **15:01** | **tr_...5xnblyk4** | 🎤 **"Sempre quando eu tiver uma reuniao, pode mandar um lembrete com uma hora de antecedencia dela e tambem, no dia dessa reuniao, voce me mandar uma mensagem falando quais reunioes que eu tenho no dia e isso as oito da manha. Voce consegue?"** | **"Consigo te ajudar a criar lembretes quando voce me passar cada reuniao. Eu nao consigo configurar uma regra automatica para todas as reunioes futuras por conta propria, mas posso criar o evento e o lembrete extra de 1 hora antes, e tambem um lembrete para as 8h da manha no dia da reuniao, sempre que voce me enviar a data e o horario."** | **❌ FALHA — BLEFE** |
| 12 | 15:02 | tr_...e26opaj7 | "pode ser" | "Perfeito. Quando quiser, me manda a reuniao com data e horario que eu organizo os lembretes pra voce." | ❌ Falha |
| 13 | 15:03 | tr_...spitvo3h | "sempre manda automatico lembrete com 1 h de antecedencia das reunioes" | "Posso criar esse lembrete extra quando voce me enviar cada reuniao com data e horario..." | 🔄 Erro de Contexto |
| 14 | 15:03 | tr_...3adsdwnu | "ja tem duas agendadas" | "Certo — me manda quais sao essas duas reunioes e em que data/horario..." | 🔄 Erro de Contexto |
| 15 | 15:03 | tr_...uvrm6xge | "pode fazer nessas" | "Desculpa, nao consegui processar sua solicitacao agora..." | ❌ Falha |
| 16 | 15:03 | tr_...d13uesw5 | "." | "Pode me mandar os detalhes das reunioes em uma mensagem unica..." | ❌ Falha |
| 17 | 15:03 | tr_...khfs8xpz | "." | "Me envia a informacao completa, por favor: nome da reuniao, data e horario..." | ❌ Falha |

---

## Deep Analysis: Trace `tr_1775066481791_5xnblyk4`

**Investigador:** @deep-agent (Pathfinder)
**Confianca:** 95%

### O que o usuario esperava

> Que a IA configurasse uma regra automatica: "sempre que eu tiver uma reuniao, envie lembrete 1h antes E envie resumo as 8h da manha no dia". O usuario fez uma pergunta direta: "Voce consegue?"

### O que aconteceu

> A IA respondeu dizendo que "consigo te ajudar a criar lembretes quando voce me passar cada reuniao", dando a entender que, a cada reuniao enviada, ela criaria automaticamente os lembretes solicitados (1h antes + 8h da manha). Porem, na realidade, o sistema so consegue:
> - Lembrete padrao de 30 minutos antes (automatico, via campo `due_at` no calendar)
> - Lembrete na hora do evento (campo `reminder` no calendar)
> 
> A IA **NAO consegue**:
> - Criar lembrete de 1h antes (nao existe essa opcao no sistema)
> - Enviar resumo diario as 8h da manha com lista de reunioes
> - Criar regras automaticas para eventos futuros

### Transcricao do Audio (CVR)

**User:** "Sempre quando eu tiver uma reuniao, pode mandar um lembrete com uma hora de antecedencia dela e tambem, se voce conseguir, no dia dessa reuniao, voce me mandar uma mensagem falando quais reunioes que eu tenho no dia e isso as oito da manha. Voce consegue?"

**AI:** "Consigo te ajudar a criar lembretes quando voce me passar cada reuniao. Eu nao consigo configurar uma regra automatica para todas as reunioes futuras por conta propria, mas posso criar o evento e o lembrete extra de 1 hora antes, e tambem um lembrete para as 8h da manha no dia da reuniao, sempre que voce me enviar a data e o horario."

### Trace Completo (6 Camadas — Swiss Cheese)

| Camada | Componente | Status | Evidencia |
|--------|-----------|--------|-----------|
| 1. Webhook | Main workflow | ✅ OK | Mensagem recebida corretamente (message_type: audio) |
| 2. Routing | Main → Premium | ✅ OK | routed_to: "premium", user_plan: "premium" |
| 3. Extraction | Whisper Transcription | ✅ OK | Transcricao precisa: "Sempre quando eu tiver uma reuniao..." |
| 4. LLM | AI Agent (Premium) | ❌ **FALHA** | AI prometeu criar "lembrete extra de 1 hora antes" e "lembrete para as 8h da manha" — capacidades inexistentes |
| 5. Action | action_type: "padrao" | ⚠️ Duvidoso | Classificou como "padrao" (sem acao). Correto pois nao havia acao possivel, mas a RESPOSTA foi enganosa |
| 6. Response | WhatsApp | ✅ OK | Mensagem entregue ao usuario |

**Ponto de Falha:** Camada 4 — LLM (AI Agent no workflow Premium)

---

## Analise do Blefe — Dissecacao

### O que a IA disse vs. O que e verdade

| Afirmacao da IA | Verdade | Status |
|-----------------|---------|--------|
| "Consigo te ajudar a criar lembretes" | Parcialmente verdade — so o lembrete padrao de 30min antes | ⚠️ Enganoso |
| "posso criar o evento e o lembrete extra de 1 hora antes" | **FALSO** — nao existe tool/action para lembrete de 1h antes. O campo `due_at` e fixo em 30 min | ❌ Blefe |
| "e tambem um lembrete para as 8h da manha no dia da reuniao" | **FALSO** — nao existe funcionalidade de resumo diario ou lembrete programado em horario arbitrario | ❌ Blefe |
| "sempre que voce me enviar a data e o horario" | Verdade parcial — pode criar o evento, mas nao os lembretes prometidos | ⚠️ Enganoso |

### Regras reais do sistema (conforme documentacao)

Conforme voce informou, o sistema consegue APENAS:
1. **Aviso automatico 30 minutos antes** — via campo `due_at` (calculado automaticamente como `start_event - 30min`)
2. **Lembrar na hora** — se o usuario pedir, via campo `reminder`
3. **Lembrete antecipado personalizado** — SOMENTE se o usuario pedir NO MOMENTO DA CRIACAO do evento

O sistema **NAO consegue**:
- Configurar regras automaticas para eventos futuros
- Enviar lembrete de 1h antes (o `due_at` e fixo em 30min)
- Enviar resumo diario as 8h da manha

### Verificacao no Banco — Eventos Existentes

| Evento | Inicio | due_at (lembrete) | reminder |
|--------|--------|-------------------|----------|
| Reuniao | 2026-04-02 10:30 | 2026-04-02 10:00 (30 min antes) | false |
| Reuniao | 2026-04-07 15:00 | 2026-04-07 14:30 (30 min antes) | false |

**Observacao critica:** O usuario pediu especificamente para criar lembretes de 1h antes nas duas reunioes ja agendadas ("ja tem duas agendadas", "pode fazer nessas"). A IA ficou em loop pedindo os dados — MAS OS DADOS JA ESTAVAM NO BANCO. A IA poderia ter consultado a agenda e criado lembretes (se a funcionalidade existisse), mas nem tentou buscar.

---

## Analise de Causa Raiz (5 Porques)

```
A IA prometeu criar lembretes de 1h antes e resumo diario as 8h da manha
  └── Por que? O prompt do AI Agent nao define com clareza as limitacoes do sistema de lembretes
       └── Por que? O prompt lista as "tools" disponiveis mas nao explicita o que NAO pode fazer
            └── Por que? O design do prompt foca em capacidades positivas, sem guardrails negativos
                 └── Por que? Nao existe no sistema uma "lista de limitacoes" que o LLM deve seguir
                      └── CAUSA RAIZ: Ausencia de guardrails negativos no prompt do AI Agent
                           que definem explicitamente o que o sistema NAO consegue fazer
```

**Categoria:** `llm_prompt` — Deficiencia no prompt do AI Agent

### Classificacao HFACS (4 Niveis)

| Nivel HFACS | Presente? | Detalhe |
|-------------|-----------|---------|
| **Ato inseguro** (erro do LLM) | ✅ SIM | LLM fabricou capacidades ("posso criar lembrete de 1h antes e resumo as 8h") que nao existem no sistema |
| **Precondicao** (ambiente/config) | ✅ SIM | O campo `due_at` e fixo em 30 min (hardcoded). Nao existe tool para lembrete personalizado |
| **Supervisao** (monitoramento) | ✅ SIM | Nao ha validacao pos-resposta que verifique se a IA prometeu algo que nao pode cumprir |
| **Organizacional** (arquitetura) | ✅ SIM | O prompt do AI Agent nao contem "guardrails negativos" — lista do que NAO pode fazer |

### Classificacao Just Culture

| Categoria | Aplicavel? | Justificativa |
|-----------|-----------|---------------|
| **Erro do sistema** (honest mistake) | ✅ SIM | O LLM inferiu capacidades com base no contexto disponivel. Nao havia instrucao explicita proibindo |
| **Comportamento de risco** (at-risk) | ✅ SIM | O LLM deveria ter respondido "nao consigo" em vez de prometer e condicionar |
| **Negligencia** (reckless) | ❌ NAO | Nao e negligencia — e uma falha de design do prompt |

---

## Cascata de Falhas (Efeito Domino)

O blefe no trace `tr_...5xnblyk4` causou uma cascata de problemas nas interacoes subsequentes:

```
[trace 9 - 15:00] IA diz "posso criar lembretes extras, tipo 1 hora antes"
        ↓ Usuario entende que a IA CONSEGUE
[trace 10 - 15:00] Usuario pede: "Pode colocar lembrete 1h antes + resumo 8h"
        ↓ IA repete que precisa dos dados
[trace 11 - 15:01] ★ BLEFE PRINCIPAL — "posso criar lembrete de 1h antes e tambem lembrete 8h da manha"
        ↓ Usuario aceita ("pode ser")
[trace 12 - 15:02] IA pede que usuario mande reuniao — mas usuario JA TEM 2 reunioes
        ↓ Loop sem resolucao
[trace 13 - 15:03] Usuario insiste: "sempre manda automatico"
        ↓ IA ignora e repete pedido de dados
[trace 14 - 15:03] Usuario diz "ja tem duas agendadas"
        ↓ IA pede dados DE NOVO (nao consultou o banco)
[trace 15 - 15:03] Usuario diz "pode fazer nessas"
        ↓ IA falha completamente ("Desculpa, nao consegui processar")
[traces 16-17 - 15:03] Usuario envia "." (frustrado, desistiu)
        ↓ IA continua pedindo dados
```

**Resultado:** Usuario frustrado no primeiro dia de uso. 7 interacoes sem resultado concreto. Perda de confianca.

---

## Avaliacao por Dimensao — Trace `tr_1775066481791_5xnblyk4`

| Dimensao | Score | Peso | Ponderado | Evidencia |
|----------|-------|------|-----------|-----------|
| Compreensao | 0.75 | 0.25 | 0.1875 | Entendeu que o usuario queria lembretes automaticos, mas nao reconheceu como impossivel |
| Precisao | 0.0 | 0.25 | 0.0 | Factualmente incorreto — prometeu funcionalidades inexistentes |
| Completude | 0.25 | 0.15 | 0.0375 | Respondeu ao tema mas nao executou nenhuma acao concreta |
| Persistencia | N/A | 0.20 | — | Nao houve acao de persistencia |
| Contexto | 0.5 | 0.10 | 0.05 | Considerou parcialmente o contexto (mencionou que nao pode regra automatica) |
| Tom | 1.0 | 0.05 | 0.05 | Tom amigavel e profissional |

**Score bruto:** 32.5/100
**Domain multiplier:** x1.2 (calendario)
**Score final:** 39/100 — **Critico**

---

## Metricas Gerais da Sessao

| Metrica | Valor |
|---------|-------|
| Total de interacoes | 17 |
| Interacoes OK (✅) | 7 (41%) |
| Interacoes Parciais (⚠️) | 3 (18%) |
| Interacoes Falha (❌) | 5 (29%) |
| Erro de Contexto (🔄) | 2 (12%) |
| Sem Resposta (🔇) | 0 |

### Sessao 1 (Onboarding): 6/6 OK — 100%
### Sessao 2 (Conversa Lembretes): 1/11 OK — 9%

---

## Ranking de Problemas

| # | Tipo | Severidade | Componente | Impacto | Acao |
|---|------|-----------|-----------|---------|------|
| 1 | **Blefe da IA** — prometeu funcionalidade inexistente | S2 — Alta | LLM Prompt | Perda de confianca do usuario | CORRIGIR IMEDIATO |
| 2 | **Perda de contexto** — nao consultou eventos ja existentes | S2 — Alta | LLM / Redis Memory | Usuario repetiu info 4 vezes | CORRIGIR IMEDIATO |
| 3 | **Loop sem resolucao** — 5 mensagens pedindo dados que ja existiam | S3 — Media | LLM / Tool calling | Frustrou usuario | CORRIGIR |
| 4 | **Dashboard bloqueado** — usuario premium vê tela de assinatura | S3 — Media | Site/Frontend | Nao e da IA, mas afeta experiencia | ESCALAR |
| 5 | **Classificacao errada** — "pode ser" classificado como "buscar" | S4 — Baixa | Classificador | Sem impacto funcional | MONITORAR |

---

## Medidas Corretivas, Preventivas e de Deteccao (SMS)

### 1. Correcao Imediata — Guardrails Negativos no Prompt

**O que fazer:** Adicionar ao system prompt do AI Agent (workflow Premium) uma secao explicita de **LIMITACOES**:

```
## O QUE VOCE NAO CONSEGUE FAZER (NUNCA PROMETA ISSO):

- Voce NAO consegue criar regras automaticas para eventos futuros
- Voce NAO consegue enviar resumo diario de compromissos em horario especifico
- Voce NAO consegue criar lembretes com antecedencia personalizada (apenas 30 min antes e automatico)
- Voce NAO consegue alterar lembretes de eventos ja criados
- Se o usuario pedir algo que voce nao consegue, diga CLARAMENTE: "Essa funcionalidade ainda nao esta disponivel, mas vou registrar como sugestao."
- NUNCA diga "posso fazer isso" se voce nao tem uma tool/acao especifica para executar
- Se classificou como "padrao" (sem acao), a resposta NAO pode prometer execucao futura de algo
```

### 2. Correcao — Consulta de Eventos Existentes

**O que fazer:** Quando o usuario mencionar "ja tem reunioes agendadas" ou similares, a IA deveria usar a tool `buscar_evento` para listar os eventos existentes antes de pedir dados.

### 3. Prevencao — Regra Anti-Blefe

**Regra proposta:** Se `ai_action` = "padrao" (nenhuma acao executada), a resposta da IA NAO pode conter frases como:
- "posso criar"
- "consigo fazer"
- "vou configurar"
- "eu organizo"

Essas frases, combinadas com acao "padrao", sao indicadoras de blefe.

### 4. Deteccao — Alertas Automaticos

**Proposta:** Criar um check no execution_log que detecte:
- `ai_action = "padrao"` + `ai_message ILIKE '%posso%criar%'` = **ALERTA: possivel blefe**
- `ai_action = "padrao"` + `branch = "criar_evento_agenda"` = **ALERTA: intent de acao sem acao executada**

---

## Ciclo de Vida do Erro (PDCA)

| Fase | Status | Data | Responsavel | Notas |
|------|--------|------|-------------|-------|
| Documentado | ✅ | 2026-04-01 | @auditor-real | Este documento |
| Investigado | ✅ | 2026-04-01 | @deep-agent | RCA completo (5 Porques + HFACS) |
| Corrigido | ⬜ | — | @dev | Adicionar guardrails negativos ao prompt Premium |
| Verificado | ⬜ | — | @auditor-real | Reteste com cenario similar |
| Fechado | ⬜ | — | @commander | — |

---

## Padroes Relacionados (LOSA)

- **Erros similares:** Este e o PRIMEIRO registro de blefe da IA neste tipo de cenario. Nao ha padroes anteriores documentados.
- **Padrao detectado:** O LLM tende a "agradar" o usuario ao inves de ser honesto sobre limitacoes — comportamento tipico de LLMs sem guardrails negativos.
- **Tendencia:** RISCO ALTO de recorrencia. Sem correcao no prompt, qualquer usuario que pergunte "voce consegue X?" recebera uma resposta otimista falsa.

---

## Evidencias

### Dados do Banco — Calendar

```
Evento 1: Reuniao | 2026-04-02 10:30 | due_at: 2026-04-02 10:00 (30 min) | reminder: false
Evento 2: Reuniao | 2026-04-07 15:00 | due_at: 2026-04-07 14:30 (30 min) | reminder: false
```

Nenhum lembrete extra foi criado. Nenhuma tabela de lembretes customizados existe.

### AI Full Response — Trace Principal

```json
{
  "acao": "padrao",
  "mensagem": "Consigo te ajudar a criar lembretes quando voce me passar cada reuniao. Eu nao consigo configurar uma regra automatica para todas as reunioes futuras por conta propria, mas posso criar o evento e o lembrete extra de 1 hora antes, e tambem um lembrete para as 8h da manha no dia da reuniao, sempre que voce me enviar a data e o horario."
}
```

**Nota critica:** `"acao": "padrao"` — a IA nao executou NENHUMA acao, mas a mensagem promete execucao futura de algo impossivel.

---

## Validacao de Seguranca (Aviation Safety Gates)

**Validado por:** @safety-officer (Sentinel)
**Veredicto:** ⚠️ PARCIAL — 2 bloqueios identificados
**Score de Maturidade:** 62% — Aceitavel

| Gate | Metodologia | Resultado |
|------|------------|-----------|
| CVR (Resposta IA) | Cockpit Voice Recorder | ✅ PASS — Resposta capturada em todas as interacoes |
| HFACS (Classificacao) | Human Factors Analysis | ✅ PASS — 4 niveis classificados |
| RCA (Causa Raiz) | Root Cause Analysis / 5-Why | ✅ PASS — Causa raiz identificada: ausencia de guardrails negativos |
| SMS (Prevencao) | Safety Management / PDCA | ✅ PASS — Medidas preventivas propostas |
| Swiss Cheese (Trace) | Rastreabilidade 6 Camadas | ✅ PASS — Todas as 6 camadas rastreadas |
| LOSA (Padroes) | Line Operations Safety Audit | ⚠️ WARNING — Primeiro registro, sem historico para comparar |
| Kaizen (Melhoria) | Melhoria Continua | ⚠️ WARNING — Depende de implementacao das correcoes |

---

## Recomendacoes Finais

### Acoes Imediatas (Criticas)

1. **Adicionar guardrails negativos ao prompt do AI Agent Premium** — lista explicita do que o sistema NAO pode fazer, especialmente sobre lembretes
2. **Adicionar regra anti-blefe** — se `acao = "padrao"`, a mensagem nao pode prometer execucao futura

### Proxima Sprint (Alta Prioridade)

3. **Melhorar context awareness** — quando usuario diz "ja tem eventos agendados", a IA deve consultar o banco automaticamente
4. **Investigar bug do dashboard** — usuario premium ve tela de assinatura (trace tr_...lv7xverx)

### Backlog (Melhorias)

5. **Implementar lembrete de antecedencia customizada** — funcionalidade real que o usuario queria (1h antes, 2h antes, etc.)
6. **Implementar resumo diario** — envio automatico as 8h com lista de compromissos do dia
7. **Implementar regras automaticas** — "sempre que criar reuniao, adicione lembrete de Xh antes"

---

*Relatorio gerado por @auditor-real (Argus) — squad de auditoria STRICT READ-ONLY*
*Metodologia: Swiss Cheese + HFACS + TEM + Just Culture + SMS + LOSA + Kaizen*
*NENHUMA alteracao foi feita em producao. NENHUMA mensagem foi enviada a usuarios.*
*Para implementar correcoes, encaminhe este relatorio para a equipe de desenvolvimento.*
