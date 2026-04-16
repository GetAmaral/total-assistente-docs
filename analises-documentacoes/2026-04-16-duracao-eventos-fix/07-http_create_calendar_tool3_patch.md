# Patch — Node "HTTP - Create Calendar Tool3" (User Premium workflow)

**Workflow:** User Premium - Total
**Node:** `HTTP - Create Calendar Tool3` (linha ≈ 4184)
**URL do webhook:** `http://n8n-fcwk0sw4soscgsgs08g8gssk.76.13.172.17.sslip.io/webhook/criar-lembrete-recorrente-total`
**Tipo:** `n8n-nodes-base.httpRequest` (typeVersion 4.3)
**Mudança:** adicionar novo `bodyParameter` `duracao_minutos`.

---

## Onde editar no UI do N8N

1. Abra o workflow **User Premium - Total**
2. Clique no node **HTTP - Create Calendar Tool3**
3. Expanda "Body Parameters"
4. Você verá os parâmetros existentes: `nome_evento`, `rrule`, `dtstart`, `timezone`, `until`, `exdates`, `channel`, `user_id`
5. Clique em **"Add Parameter"** para adicionar o novo

## Novo parameter a adicionar

| Campo | Valor |
|---|---|
| **Name** | `duracao_minutos` |
| **Value** (expressão) | `={{ $('Code in JavaScript').item.json.tool.duracao_minutos || 15 }}` |

---

## Alternativa: patch direto no JSON do node

Adicione o objeto abaixo dentro de `parameters.bodyParameters.parameters`, logo após o parâmetro `channel` e antes do `user_id`:

```json
{
  "name": "duracao_minutos",
  "value": "={{ $('Code in JavaScript').item.json.tool.duracao_minutos || 15 }}"
}
```

---

## Observação — é necessário alterar também no User Standard?

**NÃO.** O User Standard não tem o prompt `prompt_lembrete1` nem o node `HTTP - Create Calendar Tool3`. O branch de "criar evento recorrente" só existe no User Premium. No User Standard o usuário free simplesmente não tem acesso a recorrentes.

## Compatibilidade retroativa

- Se o HTTP não enviar o campo (cenário antigo), o node `Extrair Campos` da outra ponta aplica 15 como fallback.
- Se enviar, respeita o valor.
- Safe deploy.
