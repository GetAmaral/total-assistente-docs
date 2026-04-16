# Fix — Duração customizada em eventos (lembretes e compromissos)

**Data:** 2026-04-16
**Status:** Pronto para deploy em DEV
**Análise completa:** [../2026-04-16-analise-duracao-eventos.md](../2026-04-16-analise-duracao-eventos.md)

---

## Problema

Usuários pedem eventos com duração customizada ("reunião por 2 horas", "me lembra por 30 min") mas o sistema grava sempre:
- Compromisso pontual → 30 min
- Lembrete pontual → 15 min
- Lembrete recorrente → 15 min (hardcoded em JS)

Além disso, o bug trava a **detecção de conflito de horário** (false-negative), porque o filtro de overlap usa `end_event` que está artificialmente curto.

---

## Arquivos deste pacote

Aplicar **todos** em ordem:

| # | Arquivo | Onde aplicar | Tipo |
|---|---|---|---|
| 01 | [01-prompt_criar1.txt](./01-prompt_criar1.txt) | User Premium → node `prompt_criar1` (linha ≈1131) | Cola o conteúdo inteiro no campo `value` do assignment `prompt` |
| 02 | [02-prompt_lembrete.txt](./02-prompt_lembrete.txt) | User Premium → node `prompt_lembrete` (linha ≈1220) | Cola o conteúdo inteiro |
| 03 | [03-prompt_lembrete1.txt](./03-prompt_lembrete1.txt) | User Premium → node `prompt_lembrete1` (linha ≈1574) | Cola o conteúdo inteiro |
| 04 | [04-tool_criar_lembrete_description.txt](./04-tool_criar_lembrete_description.txt) | User Premium + User Standard → node `criar_lembrete` | Substitui a description do parameter `fim_lembrete` |
| 05 | [05-calcular_end_recurrence.js](./05-calcular_end_recurrence.js) | Lembretes Total Assistente → node `Calcular end & Recurrence` (linha ≈1091) | Substitui todo o conteúdo do campo "JavaScript Code" |
| 06 | [06-extrair_campos_patch.md](./06-extrair_campos_patch.md) | Lembretes Total Assistente → node `Extrair Campos` (linha ≈1078) | Adiciona 1 novo assignment `duracao_minutos` |
| 07 | [07-http_create_calendar_tool3_patch.md](./07-http_create_calendar_tool3_patch.md) | User Premium → node `HTTP - Create Calendar Tool3` (linha ≈4184) | Adiciona 1 novo body parameter `duracao_minutos` |

---

## Ordem de deploy segura

### DEV primeiro (usuário de teste: Luiz Felipe)

**1. Backend do recorrente (Lembretes workflow) — deve ir ANTES do prompt:**
- Aplicar #06 (adicionar `duracao_minutos` em `Extrair Campos`)
- Aplicar #05 (substituir o JS de `Calcular end & Recurrence`)

> **Por quê primeiro?** Se o prompt for atualizado antes, ele mandará um campo novo (`duracao_minutos`) que o backend ainda ignora — não quebra nada, só não tem efeito. Mas fazendo backend primeiro, quando o prompt subir já está tudo funcionando e fácil de testar.

**2. HTTP caller do recorrente:**
- Aplicar #07 (adicionar body parameter `duracao_minutos` em `HTTP - Create Calendar Tool3`)

**3. Prompts LLM (isolados, pode ir por último):**
- Aplicar #01, #02, #03

**4. Tool description:**
- Aplicar #04 nos DOIS workflows (User Premium + User Standard)

### Casos de teste obrigatórios em DEV

Mandar via WhatsApp (usuário Luiz Felipe) no número DEV:

**Compromissos pontuais:**
- `"reunião amanhã das 14h às 16h"` → esperado: 14:00 → 16:00
- `"call amanhã 10h por 45min"` → esperado: 10:00 → 10:45
- `"treino hoje 7h por 1h30"` → esperado: 07:00 → 08:30
- `"reunião sexta tarde toda"` → esperado: sexta 13:00 → 18:00
- `"reunião amanhã 14h"` (sem duração) → esperado: 14:00 → 14:30 (padrão 30min)

**Lembretes pontuais:**
- `"me lembra em 5 min por 30 minutos de alongar"` → inicio=$now+5min, duração=30min
- `"me lembra amanhã 9h por 1h de estudar"` → inicio=amanhã 09:00, duração=60min
- `"me lembra em 10 min de beber água"` (sem duração) → padrão 15min

**Recorrentes:**
- `"toda segunda 14h por 2h dentista"` → duracao_minutos=120
- `"academia de segunda a sexta das 7h às 8h30"` → duracao_minutos=90
- `"me lembra todo dia 7h de tomar remédio"` (sem duração) → duracao_minutos=15
- `"toda segunda 14h dentista"` (sem duração) → duracao_minutos=30

**Validação de conflito (bônus):**
1. Criar `"reunião amanhã das 14h às 16h"`
2. Criar `"call amanhã 15h às 15:30"`
3. Esperado: **sistema dispara aviso ⚠️ de conflito** (antes do fix isso falhava silenciosamente)

### Validação no Supabase (DEV)

Tabela `calendar`:

```sql
-- Os eventos criados devem ter end_event corretamente distanciado de start_event
SELECT event_name, start_event, end_event,
       EXTRACT(EPOCH FROM (end_event - start_event))/60 AS duracao_min
FROM calendar
WHERE user_id = '<id_luiz_felipe_dev>'
ORDER BY created_at DESC
LIMIT 20;
```

Esperado: coluna `duracao_min` com variedade (15, 30, 45, 60, 90, 120...) — nunca só 15 ou só 30.

---

## Deploy em PROD

Só após validar 100% em DEV com todos os casos acima. Mesma ordem (backend → HTTP → prompts → tool description).

---

## Rollback

Cada arquivo é isolado. Para reverter:

1. No node N8N, clique em "History" (ícone de relógio) e restaure a versão anterior.
2. Ou manualmente: cada node pode ser editado individualmente de volta. O sistema volta ao comportamento anterior.

**Nenhum arquivo depende do outro para funcionar em modo legado** — ex.: se você só aplicar os prompts mas não mexer no backend, os prompts mandam `duracao_minutos` mas o backend ignora e aplica 15 (comportamento atual). Sem quebra.

---

## Observações fora do escopo (não aplicar agora)

1. **Compensação +30 min para lembretes** (seção do `prompt_criar1`) — ainda está lá porque o aviso "30min antes" está desativado hoje (Schedule Trigger do Lembretes, linha 1639: `disabled: true`). Se o aviso for reativado, o +30 volta a fazer sentido. Se NÃO for reativado, essa compensação precisa ser removida (bug à parte).

2. **Edição de eventos antigos com duração corrompida** — se o usuário editar um evento antigo (14h-14:30 artificial) mudando só o início, o `novo_fim` pode herdar 14:30 e ficar menor que o novo início. O `prompt_editar1` já tenta preservar D, mas com D=30 sempre, não é útil. Priorizar se surgir reclamação.

3. **Nodes `Code` e `Code1`** no workflow Lembretes têm fallback `+15min` quando o `end` vem inválido. É um safety-net, não é a causa raiz — deixar como está.
