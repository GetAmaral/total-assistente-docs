# Patch — Node "Extrair Campos" (Lembretes workflow)

**Workflow:** Lembretes Total Assistente
**Node:** `Extrair Campos` (linha ≈ 1015)
**Tipo:** `n8n-nodes-base.set` (typeVersion 3.4)
**Mudança:** adicionar novo assignment `duracao_minutos` lendo do body, com fallback 15.

---

## Onde editar no UI do N8N

1. Abra o workflow **Lembretes Total Assistente**
2. Clique no node **Extrair Campos**
3. No painel "Fields to Set" você verá os assignments existentes: `nome_lembrete`, `rrule_raw`, `dtstart_raw`, `timezone_raw`, `until_raw`, `exdates_raw`, `description`, `user_id`
4. Clique em **"Add Field"** para adicionar um novo assignment

## Novo assignment a adicionar

| Campo | Valor |
|---|---|
| **Name** | `duracao_minutos` |
| **Type** | `Number` |
| **Value** (expressão) | `={{ Number($json.body.duracao_minutos) > 0 ? Math.floor(Number($json.body.duracao_minutos)) : 15 }}` |

---

## Alternativa: patch direto no JSON do node

Se preferir editar via "Edit Node JSON" (botão `...` → `Edit` no node), adicione o objeto abaixo dentro de `parameters.assignments.assignments`, logo após o último assignment existente:

```json
{
  "id": "a9",
  "name": "duracao_minutos",
  "value": "={{ Number($json.body.duracao_minutos) > 0 ? Math.floor(Number($json.body.duracao_minutos)) : 15 }}",
  "type": "number"
}
```

---

## Resultado esperado

Após a alteração, o output do node `Extrair Campos` passa a incluir o campo `duracao_minutos` (inteiro ≥ 1, default 15), que é consumido pelo próximo node `Calcular end & Recurrence` (ver arquivo `05-calcular_end_recurrence.js`).

## Compatibilidade retroativa

- Se o webhook for chamado SEM `duracao_minutos` no body (comportamento antigo), o node aplica `15` como fallback — **comportamento idêntico ao atual**.
- Se for chamado COM `duracao_minutos` (novo comportamento), respeita o valor.
- Nenhum cliente existente quebra.
