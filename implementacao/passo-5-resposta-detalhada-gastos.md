# Passo 5 — Resposta Detalhada (Financeiro)

**Onde:** Sub-workflow "Financeiro - Total"
**Resolve:** PF-X1 (sem validação pós-tool), PF-A6 (Agent não vê dados salvos)

---

## O Que Fazer

Substituir o node **Edit Fields30** que retorna apenas `{"sucesso":"sucesso"}` por um Set node que retorna os dados reais do registro atualizado.

---

## Como Fazer no N8N

1. Abra o sub-workflow "Financeiro - Total"
2. Encontre o node **Edit Fields30** (está após o Update a row)
3. Altere os campos conforme abaixo (ou delete e recrie)

---

## Novos Campos do Edit Fields30

Renomeie para `Resposta Detalhada` (opcional, mas recomendado).

| Campo | Tipo | Expressão |
|-------|------|-----------|
| `sucesso` | Boolean | `true` |
| `id` | String | `{{ $('Update a row').item.json.id_spent }}` |
| `nome` | String | `{{ $('Update a row').item.json.name_spent }}` |
| `valor` | Number | `{{ $('Update a row').item.json.value_spent }}` |
| `data` | String | `{{ $('Update a row').item.json.date_spent }}` |
| `categoria` | String | `{{ $('Update a row').item.json.category_spent }}` |
| `tipo` | String | `{{ $('Update a row').item.json.type_spent }}` |
| `transacao` | String | `{{ $('Update a row').item.json.transaction_type }}` |

---

## Resposta Antes vs Depois

**Antes:**
```json
{
  "sucesso": "sucesso"
}
```

**Depois:**
```json
{
  "sucesso": true,
  "id": "abc-123",
  "nome": "Uber",
  "valor": 30,
  "data": "2026-04-03",
  "categoria": "transporte",
  "tipo": "variavel",
  "transacao": "saida"
}
```

---

## Por Que Isso Importa

Com a resposta detalhada, o AI Agent pode:
- Confirmar com dados REAIS: "Editei Uber para R$30,00" (baseado na resposta, não na suposição)
- Detectar se algo deu errado: se nome voltou vazio, sabe que houve problema
- Cumprir a `regra_confirmacao` do novo prompt (Passo 1): "ESPERE a resposta e confirme com dados retornados"

---

## Verificação após Passo 5

1. Edite qualquer gasto e verifique nos logs do N8N que a resposta do webhook agora contém todos os campos
2. Verifique que o Agent usa os dados retornados na mensagem de confirmação (não inventa)
