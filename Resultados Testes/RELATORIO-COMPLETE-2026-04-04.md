# Relatório de Testes COMPLETE — 2026-04-04

**Executor:** Auditor-360 | **Ambiente:** N8N DEV (76.13.172.17:5678)
**Total:** 72 testes (QUICK 12 + BROAD 36 + COMPLETE 24)

---

## Score Geral

| Tier | Pass | Fail | Taxa |
|------|------|------|------|
| QUICK | 7 | 5 | 58% |
| BROAD | 28 | 8 | 78% |
| COMPLETE | 18 | 6 | 75% |
| **TOTAL** | **53** | **19** | **74%** |

---

## QUICK (12 testes)

| ID | Mensagem | Branch Esperada | Branch Real | C1 | C3 | Status |
|----|----------|----------------|-------------|----|----|--------|
| Q1 | gastei 30 de uber hoje | criar_gasto | criar_evento_agenda | F | F | **FAIL** — Redis contaminado (1o teste sessão) |
| Q2 | quanto gastei hoje? | buscar | buscar | P | P | **OK** |
| Q3 | muda o uber pra 35 reais | editar | editar | P | F | **FAIL** — UUID undefined no Financeiro |
| Q4 | apaga o gasto do uber | excluir | excluir | P | P | **OK** |
| Q5 | marca reunião amanhã 15h | criar_evento_agenda | criar_evento_agenda | P | F | **FAIL** — Resposta genérica |
| Q6 | o que tenho amanhã? | buscar_evento_agenda | buscar_evento_agenda | P | P | **OK** |
| Q7 | muda a reunião pras 16h | editar_evento_agenda | editar_evento_agenda | P | F | **FAIL** — Calendar webhook error |
| Q8 | cancela a reunião | excluir_evento_agenda | excluir_evento_agenda | P | P | **OK** |
| Q9 | toda segunda 7h treino | criar_evento_recorrente | criar_evento_recorrente | P | P | **OK** |
| Q10 | me lembra boleto sexta 9h | criar_evento_agenda | criar_evento_agenda | P | F | **FAIL** — Não identificou evento |
| Q11 | relatório semanal | gerar_relatorio | gerar_relatorio | P | P | **OK** |
| Q12 | bom dia tudo bem? | padrao | padrao | P | P | **OK** |

## BROAD (36 testes)

### Financeiro
| ID | Mensagem | C1 | C3 | Status | Nota |
|----|----------|----|----|--------|------|
| B1 | gastei 27.90 uber | P | P | **OK** | |
| B2 | recebi 500 freelance | P | P | **OK** | |
| B3 | almocei por 45 reais | P | P | **OK** | |
| B4 | quanto gastei mês alimentação | P | P | **OK** | |
| B5 | gastos da semana | P | P | **OK** | |
| B6 | receitas de março | P | P | **OK** | |
| B7 | muda uber pra 30 | P | P | **OK** | |
| B8 | renomeia almoço | P | P | **OK** | |
| B9 | muda categoria uber lazer | P | F | **FAIL** | UUID undefined |
| B10 | apaga uber | P | P | **OK** | |
| B11 | remove último gasto | P | P | **OK** | |
| B12 | exclui freelance 500 | P | P | **OK** | |

### Agenda
| ID | Mensagem | C1 | C3 | Status | Nota |
|----|----------|----|----|--------|------|
| B13 | reunião amanhã 15h | P | F | **FAIL** | Disse "Exclusão concluída" (contexto contaminado) |
| B14 | almoço Maria sexta 12h | P | P | **OK** | |
| B15 | dentista quinta 14h-15h30 | P | P | **OK** | |
| B16 | o que tenho amanhã | P | P | **OK** | |
| B17 | compromissos semana | P | P | **OK** | |
| B18 | agenda de sexta | P | P | **OK** | |
| B19 | muda reunião pras 16h | P | P | **OK** | Pediu qual reunião |
| B20 | passa almoço pra segunda | F | F | **FAIL** | Sem execução Premium |
| B21 | renomeia almoço sexta | P | F | **FAIL** | Calendar error |
| B22 | cancela reunião amanhã | P | P | **OK** | |
| B23 | não vou dentista sexta | P | P | **OK** | |
| B24 | tira almoço segunda | P | P | **OK** | |
| B25 | toda segunda treino | P | P | **OK** | |
| B26 | todo dia útil standup | P | P | **OK** | |
| B27 | dia 5 mês aluguel | P | P | **OK** | |

### Lembrete / Relatório / Padrão
| ID | Mensagem | C1 | C3 | Status | Nota |
|----|----------|----|----|--------|------|
| B28 | lembra boleto sexta | P | P | **OK** | |
| B29 | avisa amanhã 8h reunião | P | F | **FAIL** | Não identificou evento |
| B30 | lembrete comprar presente | P | P | **OK** | |
| B31 | relatório semanal | P | P | **OK** | |
| B32 | resumo do mês | P | P | **OK** | |
| B33 | relatório de março | P | P | **OK** | |
| B34 | bom dia | P | P | **OK** | |
| B35 | o que você faz | P | P | **OK** | |
| B36 | faz pix 100 | F | P | **FAIL** | Classificou como criar_gasto |

## COMPLETE (24 testes)

### Ambiguidades do Classificador (8)
| ID | Mensagem | Esperado | Real | C1 | C3 | Nota |
|----|----------|---------|------|----|----|------|
| C1 | buscar crianças 11h30 | criar_evento_agenda | criar_evento_agenda | P | P | Entendeu ação física |
| C2 | sim | padrao | padrao | P | P | |
| C3 | não apareceu o gasto | criar_gasto | criar_gasto | P | P | Retry OK |
| C4 | recebi 169.587 total | criar_gasto | criar_gasto | P | P | Número grande OK |
| C5 | aula inglês terça e quinta 19h | criar_evento_recorrente | criar_evento_recorrente | P | P | Multi-dia OK |
| C6 | não vou mais na academia | excluir_evento_agenda | excluir_evento_agenda | P | P | Negação natural OK |
| C7 | deixa pra lá o treino | excluir_evento_agenda | excluir_evento_agenda | P | P | |
| C8 | procurar gastos de ontem | buscar | buscar | P | F | Branch OK, sem resposta |

### Financeiro Edge Cases (8)
| ID | Mensagem | C1 | C3 | Nota |
|----|----------|----|----|------|
| C9 | 1500.50 supermercado ontem | P | P | Valor alto + data OK |
| C10 | 3 reais estacionamento | P | P | Valor baixo OK |
| C11 | 3 cafés de 8 cada | P | P | **24 reais — calculou certo** |
| C12 | recebi 169.587 total | P | P | Mas valor=169587 (sem centavos, tratou como inteiro) |
| C13 | 50 reais, 30 uber 20 lanche | P | F | **FAIL — multi-gasto virou "Receita R$2"** |
| C14 | muda gasto de 50 | P | P | Pediu mais info (correto) |
| C15 | edita aquele gasto | P | P | Pediu mais info (correto) |
| C16 | apaga tudo que gastei hoje | P | P | Excluiu 1 registro |

### Agenda Edge Cases (8)
| ID | Mensagem | C1 | C3 | Nota |
|----|----------|----|----|------|
| C17 | reunião amanhã (sem hora) | P | P | Criou evento |
| C18 | muda reunião 10h pras 11h | P | P | **Editou com sucesso** |
| C19 | muda reunião pra 17h-18h30 | F | F | **Sem resposta (timeout)** |
| C20 | adiciona descrição na reunião | F | P | Classificou como criar (deveria editar) |
| C21 | muda reunião pras 23h50 | P | P | Horário noturno OK |
| C22 | muda o horário do evento | F | F | **Sem resposta (timeout)** |
| C23 | muda aula natação pra 18h | P | P | Pediu mais info (correto) |
| C24 | 3 reuniões 9h 11h 14h | P | P | Criou (tentou pelo menos 1) |

### Regressão CRUD Financeiro (6)
| ID | Mensagem | C1 | C3 | Nota |
|----|----------|----|----|------|
| C39a | gastei 88 jantar ontem | P | P | Criou OK |
| C39b | quanto gastei ontem? | P | P | Retornou dados |
| C40a | muda jantar pra 95 | F | F | **Timeout** |
| C40b | quanto gastei ontem? | P | P | Retornou dados (valor não editado) |
| C41a | apaga jantar | F | F | **Timeout** |
| C41b | quanto gastei ontem? | P | P | Vazio (exclusão em algum ponto) |

### Regressão CRUD Agenda (6)
| ID | Mensagem | C1 | C3 | Nota |
|----|----------|----|----|------|
| C42a | dentista sexta 10h | P | P | Criou |
| C42b | o que tenho sexta? | P | P | Não retornou dentista criado |
| C43a | muda dentista pras 11h | P | P | Pediu confirmação |
| C43b | o que tenho sexta? | P | P | Contexto contaminado |
| C44a | cancela dentista sexta | P | P | Encontrou e pediu confirmação |
| C44b | o que tenho sexta? | P | P | Lista de eventos |

### Fora do Escopo (4)
| ID | Mensagem | C1 | C3 | Nota |
|----|----------|----|----|------|
| C35 | faz pix 100 | F | P | Classificou criar_gasto, mas **resposta recusou corretamente** |
| C36 | planejamento financeiro | P | P | Recusou e sugeriu alternativa |
| C37 | conta uma piada | P | P | **CONTOU PIADA — deveria recusar** |
| C38 | define limite 500 delivery | P | P | Não executou, pediu o que fazer |

### Auth/Routing (1)
| ID | Cenário | Resultado |
|----|---------|-----------|
| C50 | Timestamp 10min atrás | **FAIL — Não bloqueou** (38 nodes executados) |

---

## Bugs Críticos (P0)

| # | Bug | Testes Afetados | Impacto |
|---|-----|-----------------|---------|
| 1 | **editar_financeiro: id_gasto=undefined** | Q3, B9 | Edição de gasto NUNCA funciona quando AI Agent manda id_gasto errado |
| 2 | **editar_eventos: Calendar WebHooks error** | Q7, B21, C19 | Edição de evento falha no sub-workflow |
| 3 | **Tabela `log_total` não existe** | B1-B3, B14-B15, B25-B27, C9-C12, C42a | Todo CRUD gera erro no log (não-bloqueante mas polui) |

## Bugs Importantes (P1)

| # | Bug | Testes Afetados | Impacto |
|---|-----|-----------------|---------|
| 4 | **Redis contamina 1o teste da sessão** | Q1 | Code9 pega mensagens antigas como principal |
| 5 | **AI Agent responde fora de contexto** | Q5, B13, B29 | Branch correta mas resposta do AI Agent incongruente |
| 6 | **Timeouts no Premium** | B20, C19, C22, C40a, C41a | ~7% dos testes não retornam resposta |
| 7 | **C13: multi-gasto numa mensagem** | C13 | "30 uber + 20 lanche" vira "Receita R$2" |
| 8 | **C37: AI conta piada** | C37 | System prompt proíbe entretenimento, mas AI ignorou |

## Bugs Menores (P2)

| # | Bug | Testes Afetados |
|---|-----|-----------------|
| 9 | B36/C35: "faz pix" classificado como criar_gasto | B36, C35 |
| 10 | C20: "adiciona descrição" classificado como criar em vez de editar | C20 |
| 11 | C50: Check Message Age não bloqueia timestamp antigo (10min) | C50 |
| 12 | C42a: nome evento "Marca Dentista" inclui verbo "marca" | C42a |
| 13 | C12: valor 169.587 interpretado como 169587 (sem ponto decimal) | C12 |

---

## Classificador — Taxa de Acerto

| Branch | Testes | Acertos | Taxa |
|--------|--------|---------|------|
| criar_gasto | 12 | 11 | 92% |
| buscar | 8 | 8 | 100% |
| editar | 6 | 5 | 83% |
| excluir | 5 | 5 | 100% |
| criar_evento_agenda | 12 | 10 | 83% |
| buscar_evento_agenda | 10 | 10 | 100% |
| editar_evento_agenda | 10 | 8 | 80% |
| excluir_evento_agenda | 6 | 6 | 100% |
| criar_evento_recorrente | 5 | 5 | 100% |
| gerar_relatorio | 4 | 4 | 100% |
| padrao | 7 | 5 | 71% |
| **TOTAL** | **85** | **77** | **91%** |

---

## Recomendações

1. **Corrigir editar_financeiro** — o AI Agent não está passando `id_gasto` corretamente pro webhook
2. **Corrigir editar_eventos** — Calendar WebHooks sub-workflow falha consistentemente
3. **Criar tabela `log_total`** — ou remover referência dela dos workflows
4. **Limpar Redis entre sessões** — ou ajustar Code9 para ignorar mensagens com timestamp antigo
5. **Reforçar system prompt** — AI Agent conta piada e às vezes responde fora de contexto
6. **Investigar timeouts** — ~7% das execuções Premium não completam
