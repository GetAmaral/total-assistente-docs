# Plano de Testes — Total Assistente (Baseado no Workflow)

**Data:** 2026-04-04
**Fonte:** Análise dos workflows N8N DEV (Main, Premium Main, Financeiro, Calendar WebHooks)
**Executor:** Auditor-360

---

## Arquitetura Testável

```
WhatsApp → Main (auth + routing) → Premium Main:
  webhook → debounce(Redis) → Code9(agregar) → Classificador(LLM) → Switch-Branches → [módulo] → AI Agent → WhatsApp
```

### Branches do Classificador (12)
| Branch | Módulo | Tools Usadas |
|--------|--------|-------------|
| `criar_gasto` | registrar_gasto | nenhuma (monta JSON) |
| `buscar` | buscar_gasto | `buscar_financeiro` |
| `editar` | editar_gasto | `buscar_financeiro` + `editar_financeiro` |
| `excluir` | excluir2 | `buscar_financeiro` + `excluir_financeiro` |
| `criar_evento_agenda` | prompt_criar1 | nenhuma (monta JSON) |
| `criar_evento_recorrente` | prompt_lembrete1 | nenhuma (monta JSON) |
| `buscar_evento_agenda` | prompt_busca1 | `buscar_eventos` |
| `editar_evento_agenda` | prompt_editar1 | `buscar_eventos` + `editar_eventos` |
| `excluir_evento_agenda` | prompt_excluir | `buscar_eventos` + `excluir_evento` |
| `criar_lembrete_agenda` | prompt_lembrete | nenhuma (monta JSON) |
| `gerar_relatorio` | prompt_rel | `gerar_relatorio` |
| `padrao` | padrao | nenhuma (conversacional) |

### Sub-workflows (webhooks internos)
| Webhook | Workflow | Função |
|---------|----------|--------|
| `/webhook/filtros-supabase` | Financeiro | Busca gastos/receitas |
| `/webhook/editar-supabase` | Financeiro | Edita registro financeiro |
| `/webhook/excluir-supabase` | Financeiro | Exclui registro financeiro |
| `/webhook/busca-total-evento` | Calendar WebHooks | Busca eventos Google Calendar |
| `/webhook/editar-eventos` | Calendar WebHooks | Edita evento Google Calendar |
| `/webhook/excluir-evento-total` | Calendar WebHooks | Exclui evento Google Calendar |
| `/webhook/report` | Report Unificado | Gera relatório financeiro |

---

## Critérios de Validação (por teste)

Cada teste será validado em **4 camadas**:

| Camada | O que verificar |
|--------|----------------|
| **C1 — Classificação** | Branch retornada pelo `Escolher Branch` == branch esperada |
| **C2 — Tools** | AI Agent chamou as tools certas com parâmetros corretos |
| **C3 — Resposta** | AI Agent devolveu JSON válido com `acao` e `mensagem` corretos |
| **C4 — Persistência** | Dado foi criado/editado/excluído corretamente no Supabase ou Google Calendar |

---

## QUICK — Smoke Test (12 testes, ~15 min)

> Um teste por branch. Valida que cada rota funciona end-to-end.

### Financeiro (4)

| ID | Branch Esperada | Mensagem | Validação |
|----|----------------|-----------|-----------|
| Q1 | `criar_gasto` | "gastei 30 de uber hoje" | C1 + C3: JSON com nome_gasto, valor_gasto, categoria |
| Q2 | `buscar` | "quanto gastei hoje?" | C1 + C2: chama `buscar_financeiro` + C3: mensagem com total |
| Q3 | `editar` | "muda o uber pra 35 reais" | C1 + C2: chama `buscar_financeiro` + `editar_financeiro` |
| Q4 | `excluir` | "apaga o gasto do uber" | C1 + C2: chama `buscar_financeiro` + `excluir_financeiro` |

### Agenda (5)

| ID | Branch Esperada | Mensagem | Validação |
|----|----------------|-----------|-----------|
| Q5 | `criar_evento_agenda` | "marca reunião amanhã às 15h" | C1 + C3: JSON com titulo, data, hora |
| Q6 | `buscar_evento_agenda` | "o que tenho amanhã?" | C1 + C2: chama `buscar_eventos` |
| Q7 | `editar_evento_agenda` | "muda a reunião de amanhã pras 16h" | C1 + C2: chama `buscar_eventos` + `editar_eventos` |
| Q8 | `excluir_evento_agenda` | "cancela a reunião de amanhã" | C1 + C2: chama `buscar_eventos` + `excluir_evento` |
| Q9 | `criar_evento_recorrente` | "toda segunda às 7h tenho treino" | C1 + C3: JSON com recorrência |

### Outros (3)

| ID | Branch Esperada | Mensagem | Validação |
|----|----------------|-----------|-----------|
| Q10 | `criar_lembrete_agenda` | "me lembra de pagar o boleto sexta às 9h" | C1 + C3: JSON tipo lembrete |
| Q11 | `gerar_relatorio` | "relatório semanal" | C1 + C2: chama `gerar_relatorio` |
| Q12 | `padrao` | "bom dia, tudo bem?" | C1 + C3: resposta conversacional |

---

## BROAD — Cobertura Funcional (36 testes, ~45 min)

> 3 testes por branch. Cobre variações de linguagem, edge cases leves e regressão.

### Financeiro — Criar Gasto (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B1 | "gastei 27.90 de uber hoje" | Valor decimal + categoria automática |
| B2 | "recebi 500 de freelance" | Entrada (receita) — verbo passado |
| B3 | "almocei por 45 reais" | Verbo passado sem "gastei" |

### Financeiro — Buscar (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B4 | "quanto gastei esse mês com alimentação?" | Filtro por categoria + período |
| B5 | "meus gastos da semana" | Período relativo |
| B6 | "quero ver minhas receitas de março" | Filtro por tipo (entrada) + mês |

### Financeiro — Editar (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B7 | "muda o gasto do uber pra 30 reais" | Edição de valor |
| B8 | "renomeia o gasto 'almoço' pra 'Almoço executivo'" | Edição de nome |
| B9 | "muda a categoria do uber pra lazer" | Edição de categoria |

### Financeiro — Excluir (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B10 | "apaga o gasto do uber" | Exclusão por nome |
| B11 | "remove o último gasto" | Exclusão por posição |
| B12 | "exclui o freelance de 500" | Exclusão de entrada |

### Agenda — Criar Evento (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B13 | "marca reunião amanhã às 15h" | Evento simples |
| B14 | "marca almoço com Maria sexta 12h no restaurante" | Evento com local + pessoa |
| B15 | "tenho dentista quinta das 14h às 15h30" | Evento com duração explícita |

### Agenda — Buscar Evento (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B16 | "o que tenho amanhã?" | Busca por dia |
| B17 | "meus compromissos dessa semana" | Busca semanal |
| B18 | "agenda de sexta" | Busca por dia da semana |

### Agenda — Editar Evento (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B19 | "muda a reunião de amanhã das 15h pras 16h" | Mudança de horário |
| B20 | "passa o almoço de sexta pra segunda às 13h" | Mudança de dia + horário |
| B21 | "renomeia o almoço de sexta pra 'Almoço com Maria'" | Renomear evento |

### Agenda — Excluir Evento (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B22 | "cancela a reunião de amanhã" | Cancelamento direto |
| B23 | "não vou mais no dentista sexta" | Cancelamento por negação natural |
| B24 | "tira o almoço de segunda" | Exclusão com verbo informal |

### Agenda — Recorrente (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B25 | "toda segunda às 7h tenho treino" | Semanal |
| B26 | "todo dia útil às 9h standup" | Dias úteis |
| B27 | "dia 5 de cada mês pagar aluguel" | Mensal |

### Lembrete (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B28 | "me lembra de pagar o boleto sexta às 9h" | Lembrete pontual |
| B29 | "me avisa amanhã às 8h sobre a reunião" | Lembrete como aviso |
| B30 | "lembrete: comprar presente quinta" | Formato "lembrete:" |

### Relatório (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B31 | "relatório semanal" | Semanal |
| B32 | "resumo do mês" | Mensal |
| B33 | "relatório de março" | Mês específico |

### Padrão (3)

| ID | Mensagem | Foco |
|----|----------|------|
| B34 | "bom dia, tudo bem?" | Saudação |
| B35 | "o que você sabe fazer?" | Pergunta sobre capacidades |
| B36 | "faz um pix de 100 pro João" | Fora do escopo — deve recusar |

---

## COMPLETE — Testes Profundos (72 testes, ~2h)

> BROAD + edge cases, bordas, ambiguidades, regressão cruzada, debounce e validação no banco.

### Classificador — Ambiguidades (8)

| ID | Mensagem | Branch Esperada | Foco |
|----|----------|----------------|------|
| C1 | "buscar crianças 11h30" | `criar_evento_agenda` | "buscar" como ação física, NÃO busca de dados |
| C2 | "sim" | (último branch do histórico) | Confirmação curta (R1) |
| C3 | "não apareceu o gasto" | (retry do último) | Sinal de falha (R2) |
| C4 | "recebi 169.587 total" | `criar_gasto` | Receita com número grande (R3) |
| C5 | "marca aula de inglês terça e quinta 19h" | `criar_evento_recorrente` | Múltiplos dias = recorrente |
| C6 | "não vou mais na academia" | `excluir_evento_agenda` | Negação = cancelamento (R7) |
| C7 | "deixa pra lá o treino de amanhã" | `excluir_evento_agenda` | "Deixa pra lá" = cancelamento (R7) |
| C8 | "procurar meus gastos de ontem" | `buscar` | "procurar" + dados = busca (R5) |

### Financeiro — Edge Cases (8)

| ID | Mensagem | Foco |
|----|----------|------|
| C9 | "gastei 1500.50 no supermercado ontem" | Valor alto + data passada |
| C10 | "paguei 3 reais no estacionamento" | Valor muito baixo |
| C11 | "comprei 3 cafés de 8 reais cada" | Multiplicação implícita |
| C12 | "recebi 169.587 total do projeto" | Receita com número grande sem centavos |
| C13 | "gastei 50 reais, 30 de uber e 20 de lanche" | Multi-gasto numa mensagem |
| C14 | "muda o gasto de 50 reais" | Edição sem campo novo (dado insuficiente) |
| C15 | "edita aquele gasto" | Edição sem identificação |
| C16 | "apaga tudo que gastei hoje" | Exclusão em massa |

### Agenda — Edge Cases (8)

| ID | Mensagem | Foco |
|----|----------|------|
| C17 | "marca reunião amanhã" (sem horário) | Evento sem horário — como reage? |
| C18 | "muda a reunião das 10h pras 11h" (sem dia) | Edição sem especificar dia |
| C19 | "muda a reunião de amanhã das 15h pra das 17h às 18h30" | Intervalo explícito na edição |
| C20 | "adiciona a descrição 'levar notebook' na reunião de amanhã às 10h" | Edição de descrição |
| C21 | "muda a reunião de amanhã das 15h pras 23h50" | Horário noturno (borda) |
| C22 | "muda o horário do evento" | Dado insuficiente |
| C23 | "muda a aula de natação pra 18h" | Evento inexistente |
| C24 | "marca 3 reuniões: 9h, 11h e 14h amanhã" | Múltiplos eventos numa mensagem |

### Agenda — Conflito de Horário (3)

| ID | Mensagem | Foco |
|----|----------|------|
| C25 | Criar evento no mesmo horário de outro | Workflow de conflito (Buscar Conflitos) |
| C26 | Editar evento para horário já ocupado | Conflito pós-edição |
| C27 | Criar recorrente que conflita com existente | Conflito em recorrente |

### Múltiplos Resultados (3)

| ID | Mensagem | Foco |
|----|----------|------|
| C28 | "muda a reunião de amanhã pras 14h" (2 reuniões amanhã) | Deve perguntar qual |
| C29 | "apaga o gasto de hoje" (3 gastos hoje) | Deve perguntar qual |
| C30 | "muda o gasto de hoje pra 100 reais" (múltiplos) | Deve desambiguar |

### Debounce / Redis (4)

| ID | Mensagem | Foco |
|----|----------|------|
| C31 | Enviar 1 mensagem isolada | Code9: mensagem_principal == mensagem enviada |
| C32 | Enviar 2 mensagens rápidas (<3s) | Debounce agrega? Qual vira principal? |
| C33 | Enviar mensagem após longo silêncio (>60s) | Redis limpo? Sem contaminação? |
| C34 | Verificar firstGet após teste | Lista Redis não acumula lixo de sessões anteriores |

### Fora do Escopo (4)

| ID | Mensagem | Foco |
|----|----------|------|
| C35 | "faz um pix de 100 pro João" | Deve recusar (transação) |
| C36 | "cria um planejamento financeiro pra mim" | Deve recusar (planejamento) |
| C37 | "me conta uma piada" | Deve recusar (entretenimento) |
| C38 | "define um limite de 500 pra delivery" | Deve recusar (limite não suportado pelo AI Agent) |

### Regressão Cruzada (6)

| ID | Sequência | Foco |
|----|----------|------|
| C39 | Criar gasto → Buscar → Verificar que aparece | CRUD completo financeiro |
| C40 | Criar gasto → Editar → Buscar → Valor novo | Edição persiste |
| C41 | Criar gasto → Excluir → Buscar → Não aparece | Exclusão efetiva |
| C42 | Criar evento → Buscar → Verificar que aparece | CRUD completo agenda |
| C43 | Criar evento → Editar horário → Buscar → Horário novo | Edição persiste |
| C44 | Criar evento → Excluir → Buscar → Não aparece | Exclusão efetiva |

### Validação Supabase (4)

| ID | Após Teste | Tabela | Validar |
|----|-----------|--------|---------|
| C45 | Criar gasto | `spent` | name_spent, value_spent, date_spent, category_spent, type_spent, transaction_type |
| C46 | Editar gasto (valor) | `spent` | value_spent atualizado, demais campos preservados |
| C47 | Editar gasto (categoria) | `spent` | category_spent atualizado, demais campos preservados |
| C48 | Excluir gasto | `spent` | Registro removido |

### Auth / Routing no Main (4)

| ID | Cenário | Foco |
|----|---------|------|
| C49 | Mensagem de user premium | Roteia para Premium Main |
| C50 | Mensagem com timestamp antigo (>5min) | Check Message Age bloqueia |
| C51 | Mensagem de número não cadastrado | Fluxo de onboarding |
| C52 | Áudio (type=audio) | Switch detecta tipo + transcrição |

---

## Resumo

| Tier | Testes | Tempo Estimado | Quando Usar |
|------|--------|---------------|-------------|
| **QUICK** | 12 | ~15 min | Após cada deploy, smoke check |
| **BROAD** | 36 | ~45 min | Após mudança em branch/módulo |
| **COMPLETE** | 72 | ~2h | Release, auditoria completa, pós-refactor |

### Dependências para execução
- [ ] Redis/debounce limpo (sem mensagens de sessões anteriores)
- [ ] User de teste (Luiz Felipe / 554391936205) com plano premium ativo
- [ ] Google Calendar conectado para testes de agenda
- [ ] Dados base criados antes dos testes de edição/exclusão

### Método de execução
1. Enviar mensagem via webhook DEV (`POST /webhook/dev-whatsapp`)
2. Aguardar **todas** as execuções completarem (Main + Premium + sub-workflows)
3. Extrair via API: `GET /api/v1/executions/{id}?includeData=true`
4. Validar 4 camadas: C1 (branch) → C2 (tools) → C3 (resposta) → C4 (banco)
5. Intervalo mínimo de **30s** entre testes (debounce)
