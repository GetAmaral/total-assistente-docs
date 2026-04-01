# Como Aplicar o Fix de Debounce

## Arquivo

`premium-main-debounce-fix.json` — Workflow Premium Main completo com debounce implementado.

## Como importar no N8N DEV

1. Abrir o N8N DEV (http://76.13.172.17:5678)
2. Ir em **Workflows** → abrir o Premium Main atual
3. **ANTES DE TUDO:** Exportar o workflow atual como backup (Menu → Download)
4. Selecionar TODOS os nodes (Ctrl+A) → Deletar
5. No canvas vazio: **Ctrl+V** e colar o conteudo do arquivo `premium-main-debounce-fix.json`
6. Salvar

**OU** (metodo mais seguro):

1. Criar um workflow NOVO no N8N DEV chamado "Premium Main v2 (Debounce)"
2. No canvas vazio: **Ctrl+V** e colar o conteudo do JSON
3. Salvar e ativar
4. No Main workflow, trocar a URL do node "Premium User" para apontar para o novo webhook
5. Testar com a bateria de debounce
6. Se OK, desativar o Premium Main antigo

## O que foi alterado

### Nodes ADICIONADOS (26 novos):

| Node | Tipo | Funcao |
|------|------|--------|
| Gerar Debounce ID | Edit Fields | Gera ID unico por execucao |
| Set Debounce Owner | Redis SET | Registra ID como owner (TTL 15s) |
| Get Owner 1-6 | Redis GET | Le owner atual antes de enviar resposta |
| Check Owner 1-6 | If | Compara: sou o ultimo? |
| Del Owner 1-6 | Redis DELETE | Limpa owner key apos processar |
| Debounce Skip 1-6 | No Operation | Para execucoes que nao sao o ultimo |

### Conexoes ALTERADAS:

| Antes | Depois |
|-------|--------|
| pushRedisMessage → firstGet | pushRedisMessage → Gerar Debounce ID → Set Debounce Owner → firstGet |
| Code9 → mediumGet → If19 → Escolher Branch | Code9 → Escolher Branch (direto) |
| If18 → Redis3 → Send message | If18 → Get Owner 1 → Check Owner 1 → Redis3 → Del Owner 1 → Send message |
| If → Redis → HTTP Create Tool1 | If → Get Owner 2 → Check Owner 2 → Redis → Del Owner 2 → HTTP Create Tool1 |
| If5 → Redis6 → Send message1 | If5 → Get Owner 3 → Check Owner 3 → Redis6 → Del Owner 3 → Send message1 |
| If22 → Redis10 → HTTP Create Calendar3 | If22 → Get Owner 4 → Check Owner 4 → Redis10 → Del Owner 4 → HTTP Create Calendar3 |
| If9 → Redis8 → Set Range Batch | If9 → Get Owner 5 → Check Owner 5 → Redis8 → Del Owner 5 → Set Range Batch |
| If2 → Redis2 → Buscar Conflitos | If2 → Get Owner 6 → Check Owner 6 → Redis2 → Del Owner 6 → Buscar Conflitos |

### Nodes DESCONECTADOS (nao deletados):
- mediumGet
- If19

## Como funciona

```
MSG1 chega → push Redis → SET owner="id1" → [classifica, processa normalmente]
MSG2 chega (2s depois) → push Redis → SET owner="id2" (SOBRESCREVE id1)
  → [classifica, processa normalmente]

MSG1 termina processamento → Get Owner → "id2" != "id1" → DESCARTA (nao envia, nao deleta)
MSG2 termina processamento → Get Owner → "id2" == "id2" → ENVIA resposta + DELETE lista

Resultado: so MSG2 (a ultima) envia resposta ao usuario.
MSG2 tem todas as mensagens no Redis (MSG1 + MSG2), entao processa tudo.
```

## Testar

Apos importar, enviar teste basico:

```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.TEST_DB_SINGLE","timestamp":"1775100000","type":"text","text":{"body":"oi"}}],"field":"messages"}'
```

Se funcionar, rodar a bateria completa: `Testes n8n/bateria-debounce-01-04.md`
