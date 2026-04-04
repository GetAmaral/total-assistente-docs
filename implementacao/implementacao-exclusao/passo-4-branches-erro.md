# Passo 4 — Branches de Erro (Falha Silenciosa)

**Onde:** Sub-workflow "Calendar WebHooks" e "Financeiro - Total"
**Resolve:** ALTA-3 (falha silenciosa quando registro nao existe)
**Risco:** BAIXO (adiciona nodes, nao altera existentes)

---

## O Que Fazer

Adicionar nodes de resposta de erro nos branches FALSE dos IFs que hoje ficam desconectados (dead ends). Quando um registro nao e encontrado, o webhook deve retornar uma mensagem clara de erro em vez de ficar mudo.

---

## 4.1 — Financeiro: Adicionar node no branch FALSE do If7

**Contexto:** O node `If7` verifica se `name_spent` existe (se o registro foi encontrado). Hoje, o branch FALSE nao tem conexao — o workflow para e o webhook nunca responde.

**Acao:**
1. No workflow "Financeiro - Total", localize o node `If7`
2. Crie um novo node **Set** chamado `erro_nao_encontrado`
3. Conecte a saida FALSE (output index 1) do `If7` ao novo node
4. O webhook vai responder com o output deste node (pois `responseMode` e `lastNode`)

**Node novo para colar:**

```json
{
  "parameters": {
    "assignments": {
      "assignments": [
        {
          "id": "e1f2a3b4-c5d6-7890-abcd-111111111111",
          "name": "status",
          "value": "erro",
          "type": "string"
        },
        {
          "id": "f2a3b4c5-d6e7-8901-bcde-222222222222",
          "name": "mensagem",
          "value": "registro nao encontrado ou nao pertence ao usuario",
          "type": "string"
        }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "position": [-1520, 1368],
  "id": "a1b2c3d4-erro-fin1-0000-000000000001",
  "name": "erro_nao_encontrado"
}
```

**Conexao a adicionar:**
```json
{
  "If7": {
    "main": [
      [{"node": "Get a row", "type": "main", "index": 0}],
      [{"node": "erro_nao_encontrado", "type": "main", "index": 0}]
    ]
  }
}
```

**Posicao:** 200px abaixo do If7 (mesma coordenada X, Y + 200).

---

## 4.2 — Financeiro: Adicionar node no branch FALSE do If (validacao de ownership)

**Contexto:** O node `If` compara `profile.id` com `Get_a_row6.fk_user`. Se nao bater, o fluxo para sem resposta.

**Acao:**
1. No mesmo workflow, localize o node `If` (o que valida ownership)
2. Crie um novo node **Set** chamado `erro_permissao`
3. Conecte a saida FALSE do `If` ao novo node

**Node novo para colar:**

```json
{
  "parameters": {
    "assignments": {
      "assignments": [
        {
          "id": "a3b4c5d6-e7f8-9012-cdef-333333333333",
          "name": "status",
          "value": "erro",
          "type": "string"
        },
        {
          "id": "b4c5d6e7-f8a9-0123-defa-444444444444",
          "name": "mensagem",
          "value": "permissao negada: usuario nao e dono deste registro",
          "type": "string"
        }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "position": [-800, 1288],
  "id": "a1b2c3d4-erro-fin2-0000-000000000002",
  "name": "erro_permissao"
}
```

---

## 4.3 — Calendar WebHooks: Adicionar validacao apos Get a row

**Contexto:** O node `Get a row` busca o evento com `id` + `user_id`. Se nao encontrar (evento nao existe ou nao pertence ao usuario), o fluxo continua com dados vazios, podendo causar erros nos nodes seguintes.

**Acao:**
1. No workflow "Calendar WebHooks", localize a conexao entre `Get a row` e `buscar_conexao_user2`
2. Adicione um node **If** chamado `validar_evento_existe` entre eles
3. Conecte: `Get a row` → `validar_evento_existe` → (TRUE) `buscar_conexao_user2`
4. Na saida FALSE, conecte ao novo node de erro

**Node If para colar:**

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
          "id": "c5d6e7f8-a9b0-1234-efab-555555555555",
          "leftValue": "={{ $json.event_name }}",
          "rightValue": "",
          "operator": {
            "type": "string",
            "operation": "exists",
            "singleValue": true
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  },
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [456, 1456],
  "id": "a1b2c3d4-valida-evt-0000-000000000003",
  "name": "validar_evento_existe"
}
```

**Node de erro para colar:**

```json
{
  "parameters": {
    "assignments": {
      "assignments": [
        {
          "id": "d6e7f8a9-b0c1-2345-fabb-666666666666",
          "name": "status",
          "value": "erro",
          "type": "string"
        },
        {
          "id": "e7f8a9b0-c1d2-3456-abbc-777777777777",
          "name": "mensagem",
          "value": "evento nao encontrado ou nao pertence ao usuario",
          "type": "string"
        }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "position": [456, 1656],
  "id": "a1b2c3d4-erro-cal1-0000-000000000004",
  "name": "erro_evento_nao_encontrado"
}
```

**Conexoes atualizadas:**
```json
{
  "Get a row": {
    "main": [
      [{"node": "validar_evento_existe", "type": "main", "index": 0}]
    ]
  },
  "validar_evento_existe": {
    "main": [
      [{"node": "buscar_conexao_user2", "type": "main", "index": 0}],
      [{"node": "erro_evento_nao_encontrado", "type": "main", "index": 0}]
    ]
  }
}
```

---

## Como Fazer no N8N (passo a passo)

### Financeiro:
1. Abra o workflow "Financeiro - Total"
2. Clique no node `If7`
3. Na saida FALSE (lado direito inferior), arraste para criar nova conexao
4. Crie um node Set → nomeie `erro_nao_encontrado` → configure com os 2 campos acima
5. Repita para o node `If` → crie `erro_permissao`

### Calendar WebHooks:
1. Abra o sub-workflow "Calendar WebHooks"
2. Desconecte `Get a row` de `buscar_conexao_user2`
3. Adicione o node If `validar_evento_existe` entre eles
4. Conecte TRUE → `buscar_conexao_user2`
5. Adicione o node Set `erro_evento_nao_encontrado`
6. Conecte FALSE → `erro_evento_nao_encontrado`

---

## Verificacao

1. Chamar `/excluir-evento-total` com um `event_id` inexistente → deve retornar `{"status":"erro","mensagem":"evento nao encontrado..."}`
2. Chamar `/excluir-supabase` com um `id_gasto` inexistente → deve retornar `{"status":"erro","mensagem":"registro nao encontrado..."}`
3. Verificar que exclusoes normais (IDs validos) continuam funcionando
