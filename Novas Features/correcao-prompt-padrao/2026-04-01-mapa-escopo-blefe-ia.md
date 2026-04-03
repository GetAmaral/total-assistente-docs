# Mapa de Escopo de Blefe da IA — Total Assistente

**Data:** 2026-04-01
**Squad:** @auditor-real (Argus)
**Modo:** STRICT READ-ONLY
**Proposito:** Mapear TODAS as areas onde a IA pode prometer algo que nao consegue cumprir

---

## Metodologia

Cruzamento de 4 camadas para cada funcionalidade:

| Camada | Fonte | Pergunta |
|--------|-------|----------|
| **Prompt** | System message do AI Agent | O que o prompt diz que a IA faz/nao faz? |
| **Tools** | HTTP Request Tools disponiveis | Existe uma tool real para executar? |
| **Webhook** | Endpoints N8N | O webhook processa corretamente? |
| **Banco** | Schema Supabase + triggers | O dado e persistido? Existe limitacao no schema? |

**Regra:** Se QUALQUER camada nao suporta, a funcionalidade e um blefe potencial.

---

## PARTE 1: BLEFES CONFIRMADOS (Risco Critico)

Cenarios onde a IA JA PODE ou VAI prometer algo impossivel.

---

### BLEFE 1: Lembrete com antecedencia personalizada

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ⚠️ Ambiguo | Diz "posso criar lembretes extras com outra antecedencia, tipo 1 hora antes" |
| Tools | ❌ Nao existe | A tool `criar_lembrete` cria um EVENTO com `reminder=true`, nao um lembrete com offset custom |
| Webhook | ❌ Nao suporta | `criar-lembrete-total` cria entrada no calendar com `reminder=true` |
| Banco | ❌ Impossivel | Trigger `calendar_set_due_at()` SOBRESCREVE `due_at` em todo INSERT/UPDATE. So permite: 30 min antes (`reminder=false`) ou na hora (`reminder=true`). Nao aceita offset personalizado |

**Exemplo de mensagem do usuario que causa blefe:**
- "Me avisa 1 hora antes da reuniao"
- "Coloca um lembrete 2 horas antes"
- "Quero ser avisado 15 minutos antes"
- "Me lembra 3 dias antes da consulta"

**O que a IA provavelmente vai dizer:** "Pronto, criei o lembrete 1 hora antes!" — mas o trigger vai sobrescrever para 30 min antes.

**Impacto:** S2 — Alto. Usuario confia no horario do lembrete e perde o compromisso real.

**Observacao critica:** A IA pode ate CHAMAR a tool `criar_lembrete` com `inicio_lembrete` = 1h antes, mas o trigger do Supabase vai sobrescrever `due_at` para 30 min antes. O blefe seria invisivel — a IA confirma, o banco ignora.

---

### BLEFE 2: Resumo diario automatico / "Me manda todo dia as 8h"

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ❌ Nao mencionado | Nao consta no prompt como capacidade NEM como limitacao |
| Tools | ❌ Nao existe | Nenhuma tool para agendar envio recorrente de mensagens |
| Webhook | ❌ Nao existe | Nao ha endpoint para "resumo diario" |
| Banco | ❌ Nao existe | Nao ha tabela/campo para preferencias de envio diario de agenda |

**Exemplo de mensagem do usuario que causa blefe:**
- "Todo dia de manha me manda minha agenda do dia"
- "Quero receber um resumo as 8h com meus compromissos"
- "Voce pode me mandar todo dia o que eu tenho agendado?"
- "Me avisa toda segunda o que tem na semana"

**O que a IA provavelmente vai dizer:** Algo como "Posso fazer isso! Me manda o horario que voce prefere..." ou "Vou configurar pra voce!" — quando nao existe absolutamente nada para isso.

**Impacto:** S2 — Alto. Cria expectativa diaria que nunca sera cumprida.

---

### BLEFE 3: Regras automaticas para eventos futuros

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ❌ Nao mencionado | Nao consta como capacidade nem como limitacao |
| Tools | ❌ Nao existe | Nenhuma tool para "regras" ou "automacoes" |
| Webhook | ❌ Nao existe | Nao ha endpoint para regras condicionais |
| Banco | ❌ Nao existe | Nao ha tabela de regras/automacoes do usuario |

**Exemplo de mensagem do usuario que causa blefe:**
- "Sempre que eu criar uma reuniao, coloca lembrete de 1h antes"
- "Toda vez que eu registrar um gasto acima de 500, me avisa"
- "Quando eu criar um evento, adiciona automaticamente no Google"
- "Sempre que eu tiver consulta medica, me lembra no dia anterior"

**O que a IA provavelmente vai dizer:** "Posso te ajudar com isso quando voce me passar cada reuniao" — frase enganosa que da a entender que a IA vai lembrar e aplicar a regra automaticamente.

**Impacto:** S2 — Alto. Caso identico ao incidente `tr_1775066481791_5xnblyk4`.

---

### BLEFE 4: Multiplos lembretes por evento

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ⚠️ Ambiguo | Nao menciona limitacao |
| Tools | ❌ Limitado | `criar_lembrete` cria UM lembrete por chamada, mas seria um evento separado, nao vinculado ao original |
| Webhook | ⚠️ Parcial | Cria entrada no calendar, mas sem vinculo com o evento original |
| Banco | ❌ Nao suporta | Nao existe campo para "lista de lembretes" em um evento. Cada evento tem UM `due_at` |

**Exemplo de mensagem do usuario que causa blefe:**
- "Me avisa 1 dia antes, 1 hora antes e na hora"
- "Quero 3 lembretes: 24h, 2h e 30min antes"
- "Coloca lembrete na vespera e no dia"

**O que a IA provavelmente vai dizer:** "Vou criar os 3 lembretes!" — na pratica, criaria eventos avulsos sem vinculo, e o `due_at` de cada um seria sobrescrito pelo trigger.

**Impacto:** S3 — Medio. Confusao na agenda com eventos-fantasma.

---

### BLEFE 5: Planejamento financeiro, orcamento, metas

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ✅ EXPLICITO | "NAO cria planejamentos financeiros, orcamentos ou metas" |
| Tools | ❌ Nao existe | Nenhuma tool para planejamento |
| Webhook | ❌ Nao existe | |
| Banco | ⚠️ Parcial | Existe `profiles.balance_goal` e `profiles.estimated_monthly_income` mas nao sao usados pela IA |

**Exemplo de mensagem do usuario que causa blefe:**
- "Me faz um orcamento pro mes"
- "Quanto posso gastar por dia se meu salario e 5 mil?"
- "Cria um plano pra eu economizar 1000 por mes"
- "Me ajuda a montar um planejamento financeiro"

**Risco de blefe:** BAIXO — o prompt e explicito. Mas a IA pode tentar "ajudar" dando dicas que extrapolam o escopo.

**Impacto:** S4 — Baixo. O prompt protege, mas sem validacao pos-resposta.

---

### BLEFE 6: Investimentos e mercado financeiro

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ✅ EXPLICITO | "NAO analisa investimentos ou carteira" |
| Tools | ❌ Nao existe | Nenhuma tool de investimento disponivel para a IA |
| Webhook | ❌ Nao existe | |
| Banco | ⚠️ Parcial | Existe tabela `investments` e edge function `fetch-market-data` — mas a IA NAO tem acesso |

**Exemplo de mensagem do usuario que causa blefe:**
- "Quanto ta o Bitcoin hoje?"
- "Registra que investi 5 mil em CDB"
- "Quanto rendeu meu Tesouro Direto?"

**Risco de blefe:** BAIXO a MEDIO — a funcionalidade EXISTS no banco mas a IA nao tem tools para acessa-la. Se o usuario insistir, a IA pode inventar dados.

**Impacto:** S3 — Medio. Informacao financeira falsa e perigosa.

---

### BLEFE 7: Limite de gastos por categoria (Standard — descontinuado)

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt (Standard) | ⚠️ Presente no classificador | Branch `criar_limite` existe mas leva para prompt que diz "funcao descontinuada" |
| Tools (Standard) | ✅ Existem | `add_limite`, `edit_limite`, `excluir_limite`, `buscar_limite` — tools conectadas |
| Webhook | ⚠️ Parcial | Endpoints existem (alguns em Railway) |
| Banco | ✅ Existe | Tabela `category_limits` funcional |

**Risco de blefe:** MEDIO — A funcionalidade foi "descontinuada" no prompt mas as tools CONTINUAM conectadas. Se a IA ignorar o prompt e chamar a tool, pode funcionar parcialmente.

**No Premium:** Nao existe branch `criar_limite`. Se o usuario pedir, cai em `padrao` e a IA pode tentar fazer algo sem tool.

**Exemplo de mensagem do usuario que causa blefe:**
- "Coloca um limite de 500 reais pra alimentacao"
- "Me avisa se eu gastar mais de 200 em transporte"
- "Define um teto de gastos por categoria"

**Impacto:** S3 — Medio. Funcionalidade zombie — meio viva, meio morta.

---

### BLEFE 8: Exportar planilha/PDF

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ✅ EXPLICITO | "NAO exporta planilhas, PDFs ou arquivos" |
| Tools | ❌ Nao existe tool direta | Mas o workflow de relatorios GERA PDF internamente |
| Webhook | ⚠️ Existe | `reportsemanal` e `reportmensal` geram PDF via PDFco |
| Banco | ⚠️ Parcial | `recurrency_report` armazena preferencia de envio |

**Risco de blefe:** MEDIO — O sistema GERA PDFs de relatorio, mas a IA nao tem tool para pedir isso diretamente. No Premium, a tool `gerar_relatorio` retorna dados mas nao gera PDF. A geracao de PDF e automatica (semanal/mensal via cron) ou via endpoint separado.

**Exemplo de mensagem do usuario que causa blefe:**
- "Me manda uma planilha dos meus gastos"
- "Exporta um PDF dos meus gastos de marco"
- "Quero baixar meu extrato"

**Impacto:** S4 — Baixo. O prompt protege, mas e confuso porque o sistema ENVIA PDFs automaticamente.

---

## PARTE 2: BLEFES POTENCIAIS (Risco Medio)

Cenarios onde a IA PODE blefar dependendo de como o usuario formular o pedido.

---

### BLEFE 9: Editar lembrete de evento ja criado

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ❌ Nao menciona limitacao | |
| Tools | ⚠️ Parcial | `editar_evento` existe, mas o campo `reminder` e tratado como boolean, nao como offset |
| Banco | ❌ Limitado | Editar `reminder` so alterna entre 30-min-antes e na-hora. Trigger sobrescreve `due_at` |

**Exemplo:**
- "Muda o lembrete da reuniao de amanha pra 2 horas antes"
- "Tira o lembrete desse evento"
- "Adiciona lembrete no evento de sexta"

**Impacto:** S3 — Medio. IA pode confirmar edicao, mas `due_at` sera sobrescrito.

---

### BLEFE 10: Eventos com participantes / convites

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ❌ Nao menciona | |
| Tools | ❌ Nao existe | Nenhum parametro de "participante" ou "convidar" |
| Banco | ❌ Nao existe | Nao ha campo `attendees` no calendar |

**Exemplo:**
- "Cria uma reuniao com o Joao e a Maria"
- "Convida o time pra reuniao de segunda"
- "Manda o convite pro email do meu socio"

**Impacto:** S3 — Medio. A IA pode criar o evento normalmente e ignorar os participantes silenciosamente, ou pior — dizer que convidou.

---

### BLEFE 11: Transacoes financeiras reais

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ✅ EXPLICITO | "NAO executa transacoes financeiras (pagar boleto, fazer pix, transferir)" |
| Classificador | ✅ Protegido | Verbos imperativos financeiros → `padrao` (recusa) |
| Tools | ❌ Nao existe | |

**Exemplo:**
- "Paga o boleto da luz"
- "Faz um pix de 50 reais pro Joao"
- "Transfere 200 pra minha poupanca"

**Risco de blefe:** BAIXO — Dupla protecao (prompt + classificador). Mas "paguei o boleto da luz" (passado) REGISTRA como gasto — o usuario pode confundir "registrar" com "pagar".

**Impacto:** S4 — Baixo (protegido), mas confusao semantica possivel.

---

### BLEFE 12: Consultar agenda de OUTRA pessoa / calendario compartilhado

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ❌ Nao menciona | |
| Tools | ❌ Nao suporta | `buscar_eventos` filtra por `user_id` do remetente apenas |
| Banco | ❌ Nao suporta | Nao ha campo de compartilhamento |

**Exemplo:**
- "O que o Joao tem agendado pra amanha?"
- "Me mostra a agenda do meu marido"
- "Vê se a Maria tem horario livre quinta"

**Impacto:** S3 — Medio. A IA pode dizer "nao tenho acesso", ou pior — interpretar como busca na agenda do PROPRIO usuario com filtro de nome "Joao".

---

### BLEFE 13: Notificacao/alerta quando gasto ultrapassa limite

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ❌ Nao menciona | |
| Tools | ❌ Nao existe | Nao ha tool de monitoramento ativo |
| Banco | ⚠️ Parcial | `category_limits` existe, mas nao ha trigger de alerta |

**Exemplo:**
- "Me avisa quando eu gastar mais de 1000 em alimentacao"
- "Quero um alerta se passar do limite"
- "Notifica quando eu estourar o orcamento"

**Impacto:** S3 — Medio. Sistema passivo — so mostra limite se consultado, nao alerta proativamente.

---

### BLEFE 14: Gastos recorrentes / parcelados

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ❌ Nao menciona como limitacao | |
| Tools | ⚠️ Parcial | `registrar_financeiros` registra UMA entrada por vez |
| Banco | ❌ Nao suporta | Nao ha campos `is_recurring`, `installments`, `recurrence` na tabela `spent` |

**Exemplo:**
- "Parcela de 12x de 200 reais no cartao"
- "Conta de luz de 150 que vem todo mes"
- "Netflix 39,90 mensal"
- "Registra aluguel de 1500 pra todo mes"

**O que pode acontecer:** A IA registra UMA entrada e diz "Registrado!" — o usuario espera que apareca todo mes mas nao vai.

**Impacto:** S2 — Alto. Dados financeiros incompletos/incorretos. O usuario pode achar que ta no controle e nao esta.

---

### BLEFE 15: "Quanto gastei?" sem especificar periodo

| Camada | Status | Detalhe |
|--------|--------|---------|
| Prompt | ⚠️ Parcial | Nao define comportamento padrao para consultas sem periodo |
| Tools | ✅ Existe | `buscar_financeiro` aceita range de datas |
| Banco | ✅ Existe | |

**Exemplo:**
- "Quanto gastei esse mes?"
- "Qual meu saldo?"
- "Quanto eu tenho?"

**Risco:** A IA pode calcular "saldo" somando entradas - saidas, mas isso NAO e um saldo bancario real. E uma soma de registros no app. Se o usuario nao registrou tudo, o "saldo" e ficticio.

**Impacto:** S3 — Medio. Informacao financeira potencialmente enganosa.

---

## PARTE 3: AREAS PROTEGIDAS (Prompt funciona)

Cenarios onde o prompt EXPLICITA a limitacao e o risco de blefe e baixo.

| Area | Protecao no Prompt | Risco Residual |
|------|-------------------|----------------|
| Coaching/consultoria financeira | ✅ "NAO faz coaching, consultoria ou aconselhamento" | Baixo — pode dar "dicas" nao solicitadas |
| Piadas/entretenimento | ✅ "NAO conta piadas, historias, curiosidades" | Baixo |
| Pesquisa na internet | ✅ "NAO acessa internet, pesquisa precos" | Baixo — pode inventar precos |
| Email/ligacoes | ✅ "NAO envia e-mails, faz ligacoes" | Baixo |
| Outros calendarios | ✅ "NAO agenda em outros calendarios alem do Google" | Baixo |
| Dashboard/graficos | ✅ "NAO cria metricas, dashboards ou graficos" | Baixo |

---

## PARTE 4: LACUNA ESTRUTURAL — O "PADRAO" COMO BURACO NEGRO

O branch `padrao` e o EPICENTRO dos blefes. Quando a IA classifica algo como `padrao`:

1. **Nenhuma tool e chamada** — `ai_action = "padrao"`, `ai_tools_called = null`
2. **A IA responde em texto livre** — sem validacao, sem restricao de conteudo
3. **Nao ha verificacao pos-resposta** — ninguem checa se o que a IA disse e verdade

**Padrao**: Toda interacao onde `branch ≠ padrao` tem uma tool que EXECUTA algo. Quando `branch = padrao`, a IA esta "solta" — pode prometer qualquer coisa.

### Agravante: Classificacao errada empurra para "padrao"

No caso do incidente, as mensagens do usuario foram classificadas alternadamente como `criar_evento_agenda` e `padrao`:

| Trace | Mensagem | Branch Real | Branch Correto? |
|-------|----------|-------------|-----------------|
| tr_...9dgh8ts9 | "Voce me avisa com antecedencia?" | `criar_evento_agenda` | ❌ Nao — e uma PERGUNTA sobre funcionalidade |
| tr_...fttxo7f5 | "Pode colocar lembrete 1h antes..." | `criar_evento_agenda` | ⚠️ Parcial — e pedido de config, nao criacao |
| tr_...5xnblyk4 | "Sempre quando eu tiver reuniao..." | `criar_evento_agenda` | ❌ Nao — e pedido de REGRA automatica |
| tr_...e26opaj7 | "pode ser" | `buscar` | ❌ Nao — e continuacao de conversa |
| tr_...spitvo3h | "sempre manda automatico..." | `criar_evento_agenda` | ❌ Nao — e pedido de automacao |
| tr_...3adsdwnu | "ja tem duas agendadas" | `criar_evento_agenda` | ❌ Nao — e informacao contextual |
| tr_...uvrm6xge | "pode fazer nessas" | `padrao` | ❌ Nao — e continuacao, deveria usar contexto |

**O classificador nao tem branch para "pergunta sobre funcionalidade" ou "configuracao de preferencia".** Tudo que nao e acao direta cai em `padrao` ou e classificado erroneamente.

---

## PARTE 5: MATRIZ DE RISCO (SMS — Aviation Safety)

| # | Blefe | Probabilidade | Severidade | Risco | Acao |
|---|-------|--------------|-----------|-------|------|
| 1 | Lembrete com antecedencia personalizada | ALTA | S2 | **CRITICO** | Guardrail + fix trigger |
| 2 | Resumo diario automatico | MEDIA | S2 | **ALTO** | Guardrail negativo |
| 3 | Regras automaticas | MEDIA | S2 | **ALTO** | Guardrail negativo |
| 4 | Multiplos lembretes por evento | MEDIA | S3 | **MEDIO** | Guardrail negativo |
| 5 | Gastos recorrentes/parcelados | ALTA | S2 | **CRITICO** | Guardrail + implementar feature |
| 6 | Investimentos (dados inventados) | BAIXA | S3 | **MEDIO** | Prompt ja protege |
| 7 | Limite gastos (zombie feature) | MEDIA | S3 | **MEDIO** | Remover tools ou reativar |
| 8 | Participantes em eventos | MEDIA | S3 | **MEDIO** | Guardrail negativo |
| 9 | Agenda de outra pessoa | BAIXA | S3 | **BAIXO** | Guardrail negativo |
| 10 | "Saldo" ficticio | ALTA | S3 | **ALTO** | Disclaimer no prompt |
| 11 | Editar offset de lembrete | MEDIA | S3 | **MEDIO** | Guardrail + documentar |
| 12 | Alerta proativo de limite | MEDIA | S3 | **MEDIO** | Guardrail negativo |
| 13 | Exportar planilha/PDF sob demanda | BAIXA | S4 | **BAIXO** | Prompt ja protege |
| 14 | Transacoes reais (pix, boleto) | BAIXA | S1 | **MEDIO** | Prompt + classificador protegem |
| 15 | Planejamento financeiro | BAIXA | S4 | **BAIXO** | Prompt ja protege |

---

## PARTE 6: CORRECAO PROPOSTA — BLOCO DE GUARDRAILS NEGATIVOS

Bloco a ser adicionado ao system prompt do AI Agent (Premium E Standard):

```
=============================================
O QUE VOCE NAO CONSEGUE FAZER — NUNCA PROMETA
=============================================

LEMBRETES E NOTIFICACOES:
• Voce NAO consegue criar lembretes com antecedencia personalizada. O sistema so permite:
  aviso 30 minutos antes (automatico) ou na hora do evento. Se o usuario pedir "1 hora antes",
  "2 horas antes" ou qualquer outro intervalo, diga: "No momento, o lembrete automatico e
  fixo em 30 minutos antes. Posso criar o evento e voce recebera o aviso 30 min antes."
• Voce NAO consegue criar multiplos lembretes para um mesmo evento.
• Voce NAO consegue enviar resumo diario da agenda (ex: "me manda todo dia as 8h").
• Voce NAO consegue configurar regras automaticas (ex: "sempre que eu criar reuniao, faca X").
• Voce NAO consegue enviar alertas proativos quando um limite de gasto for atingido.

FINANCEIRO:
• Voce NAO consegue registrar gastos recorrentes ou parcelados automaticamente.
  Se o usuario disser "parcela de 12x" ou "conta mensal", registre UMA entrada e avise:
  "Registrei o valor deste mes. Quando o proximo vencer, me avise que eu registro de novo."
• Voce NAO consegue calcular saldo bancario real. Se o usuario perguntar "quanto eu tenho",
  diga: "Posso somar suas entradas e saidas registradas aqui, mas isso nao reflete seu saldo
  bancario real — so o que voce me informou."
• Voce NAO consegue registrar ou consultar investimentos.
• Voce NAO tem acesso a dados de mercado (cotacoes, rendimentos).

AGENDA:
• Voce NAO consegue adicionar participantes ou enviar convites para eventos.
• Voce NAO consegue consultar a agenda de outra pessoa.
• Voce NAO consegue editar o horario do lembrete de um evento ja criado
  (o lembrete e fixo em 30 min antes).

REGRA DE OURO:
Se voce classificou a acao como "padrao" (nenhuma tool chamada),
sua resposta NAO PODE conter frases como:
- "posso criar", "consigo fazer", "vou configurar", "eu organizo"
- "quando voce me mandar eu faco" (se nao existe tool para isso)
Essas frases criam expectativa de execucao que voce nao pode cumprir.
Se nao tem tool, nao prometa.
```

---

## PARTE 7: CORRECAO NO CLASSIFICADOR

### Branch faltante: `pergunta_funcionalidade`

Adicionar branch ao classificador para capturar perguntas SOBRE o que o sistema faz:

```
"pergunta_funcionalidade" → quando o usuario pergunta SE o sistema consegue fazer algo,
COMO funciona algo, ou QUAL o comportamento de uma feature.
Exemplos: "voce consegue me avisar?", "como funciona o lembrete?",
"da pra configurar?", "voce faz X automaticamente?"
```

Este branch deveria ter um prompt especifico que responde honestamente sobre as capacidades reais, SEM prometer funcionalidades inexistentes.

---

## PARTE 8: CORRECAO NO BANCO (Opcional — Feature Request)

Para RESOLVER de verdade (nao apenas prevenir blefe):

| Feature | Complexidade | Tabela/Campo | Prioridade |
|---------|-------------|-------------|------------|
| Lembrete com offset customizado | Media | Alterar trigger `calendar_set_due_at()` para aceitar `custom_due_offset_minutes` | P1 |
| Gastos recorrentes | Alta | Nova tabela `recurring_transactions` + cron job | P2 |
| Resumo diario da agenda | Media | Novo cron N8N + campo preferencia no profiles | P2 |
| Multiplos lembretes por evento | Alta | Nova tabela `event_reminders` (1:N) | P3 |
| Alertas de limite | Media | Trigger pos-INSERT em `spent` que checa `category_limits` | P3 |

---

## Conclusao

O sistema tem **15 cenarios mapeados** de blefe potencial, dos quais **5 sao criticos** (probabilidade alta + severidade alta):

1. **Lembrete personalizado** — o mais perigoso, pois a IA CHAMA a tool e CONFIRMA, mas o trigger do banco ignora
2. **Gastos recorrentes/parcelados** — muito comum no dia a dia, nenhuma protecao
3. **Resumo diario** — expectativa natural de usuario, nao existe
4. **Regras automaticas** — caso identico ao incidente de hoje
5. **"Saldo" ficticio** — enganoso se usuario nao registrou tudo

A **causa raiz estrutural** e dupla:
1. O prompt lista O QUE FAZ mas nao lista O QUE NAO FAZ (exceto para itens obvios)
2. O branch `padrao` permite resposta livre sem validacao — e o buraco negro dos blefes

**A correcao mais urgente e adicionar o bloco de guardrails negativos ao prompt.** Isso nao requer alteracao de codigo, workflow ou banco — apenas editar o system message do AI Agent nos workflows Premium e Standard.

---

*Mapa gerado por @auditor-real (Argus) — STRICT READ-ONLY*
*NENHUMA alteracao foi feita em producao. NENHUMA mensagem foi enviada a usuarios.*
