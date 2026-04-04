# Passo 7 — Checklist de Teste Completo

**Quando:** Após implementar todos os passos (1 a 6)
**Objetivo:** Validar que todas as 13 correções funcionam

---

## Pre-flight (antes de testar)

- [ ] Todos os 6 passos implementados no N8N DEV
- [ ] Workflow Premium salvo
- [ ] Sub-workflow Calendar WebHooks salvo
- [ ] Sub-workflow Financeiro salvo
- [ ] Nenhum node com erro vermelho (verificar no canvas)

---

## Testes de Edição de Agenda

### Teste A1 — Edição parcial de horário (PF-CW2, PF-A5)
**Enviar:** "muda a reunião de amanhã pras 16h"
(Pré-condição: ter evento "Reunião" amanhã, ex: 15:00-15:30)

| Verificar | Esperado | Status |
|-----------|----------|--------|
| novo_inicio no log | 16:00:00-03 do dia correto | [ ] |
| novo_fim no log | 16:30:00-03 (duração preservada: 30min) | [ ] |
| Banco (Supabase calendar) | start_event=16:00, end_event=16:30 | [ ] |
| Resposta do Agent | "Prontinho, atualizei..." com horários corretos | [ ] |

### Teste A2 — Mudança de dia (PF-CW2 caso extremo)
**Enviar:** "passa o dentista de hoje pra sexta às 10h"
(Pré-condição: ter evento "Dentista" hoje)

| Verificar | Esperado | Status |
|-----------|----------|--------|
| novo_inicio no log | sexta 10:00:00-03 | [ ] |
| novo_fim no log | sexta 10:30:00-03 (NÃO o fim de hoje) | [ ] |
| Banco | start < end, ambos no mesmo dia (sexta) | [ ] |

### Teste A3 — Evento não encontrado (PF-CW1)
**Enviar:** "muda a aula de natação pra 18h"
(Pré-condição: NÃO ter evento "aula de natação")

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Resposta sub-workflow | `{"erro":"nenhum_resultado",...}` | [ ] |
| Resposta do Agent | "Não encontrei eventos..." (NÃO "Prontinho") | [ ] |
| Webhook | Sem timeout, resposta rápida | [ ] |

### Teste A4 — Múltiplos resultados (PF-CW1)
**Enviar:** "muda a reunião de amanhã pras 14h"
(Pré-condição: ter 2+ eventos "Reunião" amanhã)

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Resposta sub-workflow | `{"erro":"multiplos_resultados","quantidade":2}` | [ ] |
| Resposta do Agent | Lista opções, pergunta qual editar | [ ] |

### Teste A5 — Só renomear, sem mudar horário
**Enviar:** "renomeia a reunião de amanhã pra 'Daily standup'"

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Banco | event_name="Daily standup", horários INTACTOS | [ ] |
| Resposta do Agent | Confirma só o nome, sem mencionar horário | [ ] |

### Teste A6 — Validação start < end (PF-CW5)
**Enviar:** "muda a reunião de amanhã pras 23h50"
(Pré-condição: evento com duração de 30min → fim seria 00:20 do dia seguinte)

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Banco | start_event < end_event (válido) | [ ] |
| Google Calendar | Sem erro "time range is empty" | [ ] |

---

## Testes de Edição de Gastos

### Teste G1 — Edição parcial de valor (PF-F1)
**Enviar:** "muda o gasto do uber pra 30 reais"
(Pré-condição: ter gasto "Uber" com valor 27.90)

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Banco (Supabase spent) | value_spent=30 | [ ] |
| Banco | name_spent="Uber" (INTACTO) | [ ] |
| Banco | date_spent original (INTACTO) | [ ] |
| Banco | category_spent original (INTACTO) | [ ] |
| Banco | type_spent original (INTACTO) | [ ] |
| Banco | transaction_type original (INTACTO) | [ ] |
| Resposta do Agent | "✅ Edição concluída!" com dados reais | [ ] |

### Teste G2 — Edição de nome (PF-F1)
**Enviar:** "renomeia o gasto 'uber' pra 'Uber para aeroporto'"

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Banco | name_spent="Uber para aeroporto" | [ ] |
| Banco | value_spent, date_spent, etc. INTACTOS | [ ] |

### Teste G3 — Edição de categoria
**Enviar:** "muda a categoria do uber pra lazer"

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Banco | category_spent="lazer" | [ ] |
| Banco | Outros campos INTACTOS | [ ] |
| Resposta | Mostra "📂 Categoria: Lazer" | [ ] |

### Teste G4 — Gasto não encontrado
**Enviar:** "muda o gasto do restaurante italiano pra 200"
(Pré-condição: NÃO ter gasto com esse nome)

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Resposta do Agent | "✏️ Não encontrei nenhum registro..." | [ ] |
| Agent NÃO diz | "✅ Edição concluída!" | [ ] |

### Teste G5 — Dado insuficiente
**Enviar:** "edita aquele gasto"

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Resposta do Agent | "✏️ Não consegui identificar qual registro editar." | [ ] |
| Tools chamadas | NENHUMA (não deve chamar buscar nem editar) | [ ] |

### Teste G6 — Resposta detalhada (PF-X1)
**Enviar:** qualquer edição que funcione

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Log do sub-workflow (resposta) | JSON com sucesso, id, nome, valor, data, categoria, tipo, transacao | [ ] |
| Antes | Era apenas {"sucesso":"sucesso"} | [ ] |

---

## Testes de Regressão

### Teste R1 — Criação de evento ainda funciona
**Enviar:** "marca uma reunião amanhã às 10h"

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Evento criado | Sim, normalmente | [ ] |

### Teste R2 — Criação de gasto ainda funciona
**Enviar:** "gastei 50 no almoço"

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Gasto criado | Sim, normalmente | [ ] |

### Teste R3 — Busca ainda funciona
**Enviar:** "quais meus gastos de hoje?"

| Verificar | Esperado | Status |
|-----------|----------|--------|
| Lista de gastos | Retorna normalmente | [ ] |

---

## Resumo

| Categoria | Testes | Pontos cobertos |
|-----------|--------|-----------------|
| Agenda | A1-A6 | PF-CW1, PF-CW2, PF-CW3, PF-CW5, PF-A3, PF-A4, PF-A5 |
| Gastos | G1-G6 | PF-F1, PF-F2, PF-F3, PF-X1, PF-A6 |
| Regressão | R1-R3 | Garantir que criação/busca não quebrou |
| **Total** | **15 testes** | **13/13 pontos fracos** |

---

## Critério de Sucesso

- [ ] Todos os testes A1-A6 passaram
- [ ] Todos os testes G1-G6 passaram
- [ ] Todos os testes R1-R3 passaram
- [ ] Nenhum campo destruído em edição parcial
- [ ] Nenhum "Prontinho" falso
- [ ] Nenhum dead end / timeout
- [ ] Taxa estimada: 95%+
