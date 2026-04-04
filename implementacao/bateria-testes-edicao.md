# Bateria de Testes — Edição (Agenda + Gastos)

**Data:** 2026-04-04
**Pré-requisito:** Passos 1 a 6 implementados no N8N DEV
**Instruções:** Envie cada mensagem via WhatsApp para o bot DEV. Anote o resultado real na coluna "Resultado".

---

## Setup (criar dados para testar)

Antes de começar, crie estes registros:

**Agenda:**
1. "marca uma reunião amanhã às 15h" (deve criar evento 15:00-15:30)
2. "marca um almoço sexta às 12h" (deve criar evento 12:00-12:30)
3. "marca uma reunião amanhã às 10h" (segundo evento "Reunião" no mesmo dia — para teste de múltiplos)

**Gastos:**
1. "gastei 27.90 de uber hoje" (categoria transporte)
2. "gastei 45 no almoço hoje" (categoria alimentação)
3. "recebi 500 de freelance hoje" (entrada)

---

## Testes de Edição de Agenda

### A1 — Edição de horário (preservação de duração)
**Enviar:** "muda a reunião de amanhã das 15h pras 16h"
**Resultado:**

---

### A2 — Mudança de dia
**Enviar:** "passa o almoço de sexta pra segunda às 13h"
**Resultado:**

---

### A3 — Múltiplos resultados (2 reuniões amanhã)
**Enviar:** "muda a reunião de amanhã pras 14h"
**Resultado:**

---

### A4 — Evento que não existe
**Enviar:** "muda a aula de natação pra 18h"
**Resultado:**

---

### A5 — Só renomear (sem mudar horário)
**Enviar:** "renomeia o almoço de sexta pra 'Almoço com Maria'"
**Resultado:**

---

### A6 — Horário sem especificar dia
**Enviar:** "muda a reunião das 10h pras 11h"
**Resultado:**

---

### A7 — Horário com intervalo explícito
**Enviar:** "muda a reunião de amanhã das 15h pra das 17h às 18h30"
**Resultado:**

---

### A8 — Dado insuficiente
**Enviar:** "muda o horário do evento"
**Resultado:**

---

### A9 — Edição de descrição
**Enviar:** "adiciona a descrição 'levar notebook' na reunião de amanhã às 10h"
**Resultado:**

---

### A10 — Mudança para horário noturno (borda)
**Enviar:** "muda a reunião de amanhã das 15h pras 23h50"
**Resultado:**

---

## Testes de Edição de Gastos

### G1 — Edição de valor (preservação de campos)
**Enviar:** "muda o gasto do uber pra 30 reais"
**Resultado:**

---

### G2 — Edição de nome
**Enviar:** "renomeia o gasto 'almoço' pra 'Almoço executivo'"
**Resultado:**

---

### G3 — Edição de categoria
**Enviar:** "muda a categoria do uber pra lazer"
**Resultado:**

---

### G4 — Edição de valor de entrada
**Enviar:** "muda o freelance pra 600 reais"
**Resultado:**

---

### G5 — Gasto que não existe
**Enviar:** "muda o gasto do restaurante italiano pra 200"
**Resultado:**

---

### G6 — Dado insuficiente (sem identificação)
**Enviar:** "edita aquele gasto"
**Resultado:**

---

### G7 — Dado insuficiente (sem campo novo)
**Enviar:** "muda o gasto de 50 reais"
**Resultado:**

---

### G8 — Edição de data
**Enviar:** "muda a data do uber pra ontem"
**Resultado:**

---

### G9 — Edição de tipo
**Enviar:** "muda o tipo do uber pra fixo"
**Resultado:**

---

### G10 — Múltiplos gastos parecidos
**Enviar:** "muda o gasto de hoje pra 100 reais"
**Resultado:**

---

## Testes de Regressão

### R1 — Criação de evento
**Enviar:** "marca uma consulta quinta às 9h"
**Resultado:**

---

### R2 — Criação de gasto
**Enviar:** "gastei 15 no café"
**Resultado:**

---

### R3 — Busca de gastos
**Enviar:** "quais meus gastos de hoje?"
**Resultado:**

---

### R4 — Busca de agenda
**Enviar:** "o que tenho amanhã?"
**Resultado:**

---

## Validação no Banco (após testes G1-G3)

Após os testes G1, G2 e G3, verifique no Supabase (tabela `spent`) o registro do Uber:

| Campo | Valor esperado após G1+G2+G3 |
|-------|------------------------------|
| name_spent | |
| value_spent | |
| date_spent | |
| category_spent | |
| type_spent | |
| transaction_type | |

---

## Resumo

| Categoria | Quantidade |
|-----------|------------|
| Agenda | 10 testes (A1-A10) |
| Gastos | 10 testes (G1-G10) |
| Regressão | 4 testes (R1-R4) |
| **Total** | **24 testes** |
