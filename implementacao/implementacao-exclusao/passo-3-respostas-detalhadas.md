# Passo 3 — Respostas Detalhadas dos Webhooks

**Onde:** Sub-workflow "Calendar WebHooks - Total Assistente" e "Financeiro - Total"
**Resolve:** ALTA-1 (fire-and-forget), MEDIA-2 (resposta sem detalhes)
**Risco:** BAIXO (substitui nodes Set por nodes Set com mais campos)

---

## O Que Fazer

Substituir os nodes de resposta hardcoded (`sucesso_google2`, `sucesso_padrao2`) por nodes que retornam os DETALHES do evento excluido. Assim o AI Agent sabe EXATAMENTE o que foi deletado.

---

## 3.1 — Node: sucesso_google2 (CORRIGIDO)

**Como encontrar:** No workflow "Calendar WebHooks", procure o node Set chamado `sucesso_google2`.
**Acao:** Apague o node atual e cole este no lugar (mantenha as mesmas conexoes).

**Node corrigido completo:**

```json
{
  "parameters": {
    "assignments": {
      "assignments": [
        {
          "id": "3c9b9b8c-c13f-4063-a9e6-33cd39b6ed66",
          "name": "status",
          "value": "sucesso",
          "type": "string"
        },
        {
          "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          "name": "mensagem",
          "value": "exclusao do evento na agenda google e padrao feito com sucesso.",
          "type": "string"
        },
        {
          "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
          "name": "evento_nome",
          "value": "={{ $('Get a row').item.json.event_name }}",
          "type": "string"
        },
        {
          "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
          "name": "evento_inicio",
          "value": "={{ $('Get a row').item.json.start_event }}",
          "type": "string"
        },
        {
          "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
          "name": "evento_fim",
          "value": "={{ $('Get a row').item.json.end_event }}",
          "type": "string"
        },
        {
          "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
          "name": "evento_descricao",
          "value": "={{ $('Get a row').item.json.desc_event }}",
          "type": "string"
        }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "position": [2864, 1440],
  "id": "275363b0-ae94-4143-8821-4e5c171860b4",
  "name": "sucesso_google2"
}
```

**O que muda:** Em vez de retornar apenas `"sucesso": "exclusao do evento..."`, agora retorna:
- `status`: "sucesso"
- `evento_nome`: nome do evento excluido
- `evento_inicio`: data/hora inicio
- `evento_fim`: data/hora fim
- `evento_descricao`: descricao (se existir)

---

## 3.2 — Node: sucesso_padrao2 (CORRIGIDO)

**Como encontrar:** No workflow "Calendar WebHooks", procure o node Set chamado `sucesso_padrao2`.
**Acao:** Apague o node atual e cole este no lugar.

**Node corrigido completo:**

```json
{
  "parameters": {
    "assignments": {
      "assignments": [
        {
          "id": "4ede406e-5e39-4dfc-98a4-699202badec3",
          "name": "status",
          "value": "sucesso",
          "type": "string"
        },
        {
          "id": "f6a7b8c9-d0e1-2345-fabb-456789012345",
          "name": "mensagem",
          "value": "evento excluido na agenda padrao com sucesso, usuario nao possui conexao com google agenda.",
          "type": "string"
        },
        {
          "id": "a7b8c9d0-e1f2-3456-abbc-567890123456",
          "name": "evento_nome",
          "value": "={{ $('Get a row').item.json.event_name }}",
          "type": "string"
        },
        {
          "id": "b8c9d0e1-f2a3-4567-bccd-678901234567",
          "name": "evento_inicio",
          "value": "={{ $('Get a row').item.json.start_event }}",
          "type": "string"
        },
        {
          "id": "c9d0e1f2-a3b4-5678-cdde-789012345678",
          "name": "evento_fim",
          "value": "={{ $('Get a row').item.json.end_event }}",
          "type": "string"
        },
        {
          "id": "d0e1f2a3-b4c5-6789-deef-890123456789",
          "name": "evento_descricao",
          "value": "={{ $('Get a row').item.json.desc_event }}",
          "type": "string"
        }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "position": [1728, 1632],
  "id": "e666451f-cd7e-4715-8d33-2539019d7d9a",
  "name": "sucesso_padrao2"
}
```

---

## 3.3 — Financeiro: Redis7 (sem mudanca necessaria)

O node `Redis7` ja retorna o JSON completo do registro excluido (`$json` do Delete a row). O AI Agent recebe os dados — o problema estava no PROMPT que nao instruia a verificar. Isso ja foi corrigido no Passo 1 (Etapa 5 do prompt).

---

## Verificacao

Apos aplicar, testar:
1. Excluir um evento → verificar que o retorno do webhook contem `evento_nome`, `evento_inicio`, `evento_fim`
2. Verificar no log do AI Agent que ele recebe os detalhes e usa na resposta ao usuario
