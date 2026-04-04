# Passo 3 — Respostas Detalhadas dos Webhooks

**Onde:** Sub-workflow "Calendar WebHooks - Total Assistente"
**Resolve:** ALTA-1 (fire-and-forget), MEDIA-2 (resposta sem detalhes)

---

## O Que Fazer

Substituir os campos dos nodes `sucesso_google2` e `sucesso_padrao2` que retornam texto fixo por campos com os DADOS REAIS do evento excluido.

---

## 3.1 — Node: sucesso_google2

**Como encontrar:** Node Set na posicao [2864, 1440], conectado apos `delete_supabase`.

**Acao:**
1. Abra o node `sucesso_google2`
2. Apague o campo existente (`sucesso`)
3. Adicione estes campos:

| Campo | Tipo | Valor |
|-------|------|-------|
| `status` | String | `sucesso` |
| `mensagem` | String | `exclusao do evento na agenda google e padrao feito com sucesso` |
| `evento_nome` | String | `={{ $('Get a row').item.json.event_name }}` |
| `evento_inicio` | String | `={{ $('Get a row').item.json.start_event }}` |
| `evento_fim` | String | `={{ $('Get a row').item.json.end_event }}` |
| `evento_descricao` | String | `={{ $('Get a row').item.json.desc_event }}` |

4. Salve o node

---

## 3.2 — Node: sucesso_padrao2

**Como encontrar:** Node Set na posicao [1728, 1632], conectado apos `delete_supabase1`.

**Acao:**
1. Abra o node `sucesso_padrao2`
2. Apague o campo existente (`sucesso_padrao`)
3. Adicione estes campos:

| Campo | Tipo | Valor |
|-------|------|-------|
| `status` | String | `sucesso` |
| `mensagem` | String | `evento excluido na agenda padrao com sucesso` |
| `evento_nome` | String | `={{ $('Get a row').item.json.event_name }}` |
| `evento_inicio` | String | `={{ $('Get a row').item.json.start_event }}` |
| `evento_fim` | String | `={{ $('Get a row').item.json.end_event }}` |
| `evento_descricao` | String | `={{ $('Get a row').item.json.desc_event }}` |

4. Salve o node

---

## Resposta Antes vs Depois

**Antes:**
```json
{"sucesso": "exclusão do evento na agenda google e padrão feito com sucesso."}
```

**Depois:**
```json
{
  "status": "sucesso",
  "mensagem": "exclusao do evento na agenda google e padrao feito com sucesso",
  "evento_nome": "Reuniao com Carlos",
  "evento_inicio": "2026-04-05T14:00:00-03:00",
  "evento_fim": "2026-04-05T15:00:00-03:00",
  "evento_descricao": "Sala 3"
}
```

---

## Financeiro: Redis7 (sem mudanca)

O node `Redis7` ja retorna o JSON completo do registro. O prompt corrigido (Passo 1, Etapa 5) ja instrui o AI Agent a verificar a resposta.

---

## Verificacao apos Passo 3

1. Excluir um evento → verificar nos logs do N8N que a resposta contem `evento_nome`, `evento_inicio`
2. Verificar que o AI Agent usa esses dados na mensagem ao usuario
