# Passo 2 — Corrigir Nodes DELETE (Adicionar user_id)

**Onde:** Sub-workflow "Calendar WebHooks - Total Assistente"
**Resolve:** CRITICA-1 (cross-user event deletion), CRITICA-2 (webhook aceita qualquer user_id)
**Risco:** BAIXO (apenas adiciona filtro, nao remove nenhum)

---

## O Que Fazer

Substituir os 2 nodes Supabase DELETE (`delete_supabase` e `delete_supabase1`) por versoes corrigidas que incluem `user_id` no filtro WHERE.

---

## 2.1 — Node: delete_supabase (CORRIGIDO)

**Como encontrar:** No workflow "Calendar WebHooks", procure o node Supabase chamado `delete_supabase`.
**Acao:** Abra o node, va em Filters, e adicione um TERCEIRO filtro: `user_id` eq `{{ $('Edit Fields4').item.json.user_id }}`.

**Node corrigido completo (ctrl+c ctrl+v no N8N):**

```json
{
  "parameters": {
    "operation": "delete",
    "tableId": "calendar",
    "filters": {
      "conditions": [
        {
          "keyName": "session_event_id_google",
          "condition": "eq",
          "keyValue": "={{ $('tudo_edit1').item.json.session_event_id_google }}"
        },
        {
          "keyName": "id",
          "condition": "eq",
          "keyValue": "={{ $('Edit Fields4').item.json.event_id }}"
        },
        {
          "keyName": "user_id",
          "condition": "eq",
          "keyValue": "={{ $('Edit Fields4').item.json.user_id }}"
        }
      ]
    }
  },
  "type": "n8n-nodes-base.supabase",
  "typeVersion": 1,
  "position": [2656, 1440],
  "id": "a4697511-af21-4689-a105-6bd21ee1b35e",
  "name": "delete_supabase",
  "credentials": {
    "supabaseApi": {
      "id": "kQkN5PrZm2GihQfS",
      "name": "Total Supabase"
    }
  }
}
```

**Diferenca do original:**
```diff
  "filters": {
    "conditions": [
      { "keyName": "session_event_id_google", ... },
-     { "keyName": "id", ... }
+     { "keyName": "id", ... },
+     {
+       "keyName": "user_id",
+       "condition": "eq",
+       "keyValue": "={{ $('Edit Fields4').item.json.user_id }}"
+     }
    ]
  }
```

---

## 2.2 — Node: delete_supabase1 (CORRIGIDO)

**Como encontrar:** No workflow "Calendar WebHooks", procure o node Supabase chamado `delete_supabase1`.
**Acao:** Abra o node, va em Filters, e adicione um SEGUNDO filtro: `user_id` eq `{{ $('Edit Fields4').item.json.user_id }}`.

**Node corrigido completo (ctrl+c ctrl+v no N8N):**

```json
{
  "parameters": {
    "operation": "delete",
    "tableId": "calendar",
    "filters": {
      "conditions": [
        {
          "keyName": "id",
          "condition": "eq",
          "keyValue": "={{ $('Edit Fields4').item.json.event_id }}"
        },
        {
          "keyName": "user_id",
          "condition": "eq",
          "keyValue": "={{ $('Edit Fields4').item.json.user_id }}"
        }
      ]
    }
  },
  "type": "n8n-nodes-base.supabase",
  "typeVersion": 1,
  "position": [1440, 1632],
  "id": "7c0398f3-5247-40b3-898a-24a690ea5942",
  "name": "delete_supabase1",
  "credentials": {
    "supabaseApi": {
      "id": "kQkN5PrZm2GihQfS",
      "name": "Total Supabase"
    }
  }
}
```

**Diferenca do original:**
```diff
  "filters": {
    "conditions": [
-     { "keyName": "id", ... }
+     { "keyName": "id", ... },
+     {
+       "keyName": "user_id",
+       "condition": "eq",
+       "keyValue": "={{ $('Edit Fields4').item.json.user_id }}"
+     }
    ]
  }
```

---

## Verificacao

Apos aplicar, testar:
1. Excluir um evento do usuario de teste → deve funcionar normalmente
2. Tentar chamar o webhook com um `user_id` diferente do dono do evento → deve retornar vazio (nenhuma linha deletada)
