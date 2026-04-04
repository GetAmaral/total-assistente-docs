# Passo 6 — Verificacao Pos-DELETE (IF Nodes)

**Onde:** Sub-workflow "Calendar WebHooks - Total Assistente"
**Resolve:** ALTA-1 (fire-and-forget — sucesso retornado sem verificar)
**Risco:** BAIXO (adiciona nodes de verificacao, nao altera logica existente)
**Camada Swiss Cheese:** 6 (validacao Google antes de tocar Supabase)

---

## O Que Fazer

Adicionar nodes IF entre o DELETE/UPDATE e a resposta de sucesso. Verificar se a operacao realmente afetou registros antes de retornar "sucesso".

---

## 6.1 — IF apos soft_delete_calendar (caminho Google)

**Contexto:** Apos o node `delete_supabase` (ou `soft_delete_calendar` do Passo 5), precisamos verificar se o UPDATE realmente funcionou antes de ir para `sucesso_google2`.

**Acao:**
1. Desconecte `delete_supabase` (ou `soft_delete_calendar`) de `sucesso_google2`
2. Adicione o node IF abaixo entre eles
3. Conecte TRUE → `sucesso_google2`
4. Conecte FALSE → novo node de erro

**Node IF para colar:**

```json
{
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict",
        "version": 2
      },
      "conditions": [
        {
          "id": "a1b2c3d4-verif-cal1-0000-aaaaaaaaaaaa",
          "leftValue": "={{ $json.status }}",
          "rightValue": "sucesso",
          "operator": {
            "type": "string",
            "operation": "equals"
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  },
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [2760, 1440],
  "id": "a1b2c3d4-verif-cal1-0000-bbbbbbbbbbbb",
  "name": "verificar_delete_google"
}
```

**Node de erro para colar:**

```json
{
  "parameters": {
    "assignments": {
      "assignments": [
        {
          "id": "a1b2c3d4-verif-cal1-0000-cccccccccccc",
          "name": "status",
          "value": "erro",
          "type": "string"
        },
        {
          "id": "a1b2c3d4-verif-cal1-0000-dddddddddddd",
          "name": "mensagem",
          "value": "falha ao excluir evento do banco de dados",
          "type": "string"
        }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "position": [2760, 1640],
  "id": "a1b2c3d4-verif-cal1-0000-eeeeeeeeeeee",
  "name": "erro_delete_google"
}
```

**Conexoes:**
```json
{
  "delete_supabase": {
    "main": [
      [{"node": "verificar_delete_google", "type": "main", "index": 0}]
    ]
  },
  "verificar_delete_google": {
    "main": [
      [{"node": "sucesso_google2", "type": "main", "index": 0}],
      [{"node": "erro_delete_google", "type": "main", "index": 0}]
    ]
  }
}
```

---

## 6.2 — IF apos soft_delete_calendar_padrao (caminho sem Google)

**Mesmo padrao, mas para o caminho que NAO tem conexao Google.**

**Node IF para colar:**

```json
{
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict",
        "version": 2
      },
      "conditions": [
        {
          "id": "b2c3d4e5-verif-cal2-0000-aaaaaaaaaaaa",
          "leftValue": "={{ $json.status }}",
          "rightValue": "sucesso",
          "operator": {
            "type": "string",
            "operation": "equals"
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  },
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [1544, 1632],
  "id": "b2c3d4e5-verif-cal2-0000-bbbbbbbbbbbb",
  "name": "verificar_delete_padrao"
}
```

**Node de erro para colar:**

```json
{
  "parameters": {
    "assignments": {
      "assignments": [
        {
          "id": "b2c3d4e5-verif-cal2-0000-cccccccccccc",
          "name": "status",
          "value": "erro",
          "type": "string"
        },
        {
          "id": "b2c3d4e5-verif-cal2-0000-dddddddddddd",
          "name": "mensagem",
          "value": "falha ao excluir evento do banco de dados",
          "type": "string"
        }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "position": [1544, 1832],
  "id": "b2c3d4e5-verif-cal2-0000-eeeeeeeeeeee",
  "name": "erro_delete_padrao"
}
```

**Conexoes:**
```json
{
  "delete_supabase1": {
    "main": [
      [{"node": "verificar_delete_padrao", "type": "main", "index": 0}]
    ]
  },
  "verificar_delete_padrao": {
    "main": [
      [{"node": "sucesso_padrao2", "type": "main", "index": 0}],
      [{"node": "erro_delete_padrao", "type": "main", "index": 0}]
    ]
  }
}
```

---

## 6.3 — IF apos excluir_evento_google (verificar Google Calendar API)

**Contexto:** Antes de deletar no Supabase, verificar se a exclusao no Google Calendar realmente funcionou. Se o Google retornar erro, NAO prosseguir com a exclusao local.

**NOTA:** Este IF deve ser adicionado ENTRE o node `excluir_evento_google` (HTTP Request) e o node `delete_supabase`.

**Acao:**
1. Localize o node `excluir_evento_google` (HTTP Request que chama a API do Google Calendar)
2. Localize a conexao dele com os nodes seguintes
3. Adicione um IF verificando o status code da resposta

**Node IF para colar:**

```json
{
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict",
        "version": 2
      },
      "conditions": [
        {
          "id": "c3d4e5f6-verif-goo-0000-aaaaaaaaaaaa",
          "leftValue": "={{ $json.statusCode || $json.status || 200 }}",
          "rightValue": "400",
          "operator": {
            "type": "number",
            "operation": "lt"
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  },
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [2450, 1440],
  "id": "c3d4e5f6-verif-goo-0000-bbbbbbbbbbbb",
  "name": "verificar_google_api"
}
```

**Node de erro Google para colar:**

```json
{
  "parameters": {
    "assignments": {
      "assignments": [
        {
          "id": "c3d4e5f6-verif-goo-0000-cccccccccccc",
          "name": "status",
          "value": "erro",
          "type": "string"
        },
        {
          "id": "c3d4e5f6-verif-goo-0000-dddddddddddd",
          "name": "mensagem",
          "value": "falha ao excluir evento no Google Calendar. O evento foi mantido no banco.",
          "type": "string"
        }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "position": [2450, 1640],
  "id": "c3d4e5f6-verif-goo-0000-eeeeeeeeeeee",
  "name": "erro_google_api"
}
```

**Conexoes:**
```json
{
  "excluir_evento_google": {
    "main": [
      [{"node": "verificar_google_api", "type": "main", "index": 0}]
    ]
  },
  "verificar_google_api": {
    "main": [
      [{"node": "limpar_tokens_e_reduzir_saida2", "type": "main", "index": 0}],
      [{"node": "erro_google_api", "type": "main", "index": 0}]
    ]
  }
}
```

---

## Fluxo Atualizado (Calendar WebHooks - DELETE path)

```
ANTES:
excluir_evento_google → ... → delete_supabase → sucesso_google2
                                delete_supabase1 → sucesso_padrao2

DEPOIS:
excluir_evento_google → verificar_google_api
  ├─ TRUE → ... → delete_supabase → verificar_delete_google
  |                                    ├─ TRUE → sucesso_google2
  |                                    └─ FALSE → erro_delete_google
  └─ FALSE → erro_google_api

delete_supabase1 → verificar_delete_padrao
  ├─ TRUE → sucesso_padrao2
  └─ FALSE → erro_delete_padrao
```

---

## Verificacao

1. Excluir evento normalmente → deve passar por todos os IFs e retornar sucesso com detalhes
2. Simular falha Google (token expirado) → deve parar em `erro_google_api` e NAO excluir do banco
3. Verificar que respostas de erro chegam ao AI Agent com `status: "erro"`
