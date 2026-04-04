# Passo 2 — Corrigir Nodes DELETE (Adicionar user_id)

**Onde:** Sub-workflow "Calendar WebHooks - Total Assistente"
**Resolve:** CRITICA-1 (cross-user event deletion)

---

## O Que Fazer

Adicionar um TERCEIRO filtro (`user_id`) nos 2 nodes Supabase que fazem DELETE. Hoje eles deletam SEM verificar de quem e o evento.

---

## 2.1 — Node: delete_supabase

**Como encontrar:** No workflow "Calendar WebHooks", procure o node Supabase chamado `delete_supabase` (posicao [2656, 1440]).

**Acao:**
1. Abra o node `delete_supabase`
2. Na secao **Filters**, voce vai ver 2 filtros existentes:
   - `session_event_id_google` eq `{{ $('tudo_edit1').item.json.session_event_id_google }}`
   - `id` eq `{{ $('Edit Fields4').item.json.event_id }}`
3. Clique em **Add Filter**
4. Preencha:

| Campo | Valor |
|-------|-------|
| Key Name | `user_id` |
| Condition | `eq` |
| Key Value | `={{ $('Edit Fields4').item.json.user_id }}` |

5. Salve o node

---

## 2.2 — Node: delete_supabase1

**Como encontrar:** No mesmo workflow, procure `delete_supabase1` (posicao [1440, 1632]). Este e o caminho quando o usuario NAO tem conexao Google.

**Acao:**
1. Abra o node `delete_supabase1`
2. Na secao **Filters**, voce vai ver 1 filtro existente:
   - `id` eq `{{ $('Edit Fields4').item.json.event_id }}`
3. Clique em **Add Filter**
4. Preencha:

| Campo | Valor |
|-------|-------|
| Key Name | `user_id` |
| Condition | `eq` |
| Key Value | `={{ $('Edit Fields4').item.json.user_id }}` |

5. Salve o node

---

## Resultado Visual

```
ANTES:
delete_supabase:  WHERE session_event_id_google = X AND id = Y
delete_supabase1: WHERE id = Y

DEPOIS:
delete_supabase:  WHERE session_event_id_google = X AND id = Y AND user_id = Z ✅
delete_supabase1: WHERE id = Y AND user_id = Z ✅
```

---

## Verificacao apos Passo 2

1. Excluir um evento normalmente → deve funcionar igual
2. Chamar webhook com `user_id` de outro usuario → nenhuma linha afetada
