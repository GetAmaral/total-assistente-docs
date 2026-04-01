# Guia — Debounce no Main (5 nodes)

**Arquivo:** `debounce-main-5nodes.json`
**Workflow:** Main - Total Assistente
**Onde:** Entre `setar_user` e `Premium User`

---

## Antes de comecar

1. Reverter os 4 nodes que colocamos no Premium (se ainda estiverem la)
   - Reconectar: pushRedisMessage → firstGet (fio original)
   - Reconectar: Code9 → mediumGet → If19 → Escolher Branch (fio original)
   - Deletar: Gerar Debounce ID, Set Debounce Owner, Get Debounce Owner, Sou o Ultimo?

2. Abrir o workflow **Main - Total Assistente** no N8N DEV

---

## Passo 1 — Colar os 5 nodes

1. Copiar conteudo de `debounce-main-5nodes.json`
2. Clicar no canvas do Main, Ctrl+V
3. Os 5 nodes aparecem ja conectados entre si:

```
Push Debounce → Set Owner → Debounce 3s → Get Owner → Sou o Ultimo?
```

---

## Passo 2 — Cortar 1 fio

```
setar_user ──✂──→ Premium User
```

(Manter os outros fios do setar_user: Log: message_routed e Consume Nudge ficam como estao)

---

## Passo 3 — Conectar 3 fios

```
1. setar_user           → Push Debounce
2. Sou o Ultimo? (TRUE) → Premium User
3. Sou o Ultimo? (FALSE) → Log: message_routed  (ou um No Operation)
```

> Na saida FALSE, a execucao simplesmente para. Pode conectar a um No Operation
> ou ao Log: message_routed se quiser logar que foi descartado por debounce.
> Se preferir nao conectar a nada, tudo bem — o N8N para a execucao sozinho.

---

## Resultado

```
ANTES:
  setar_user → Premium User
              → Log: message_routed
              → Consume Nudge

DEPOIS:
  setar_user → Push Debounce → Set Owner → Debounce 3s (espera 3 seg)
              → Get Owner → Sou o Ultimo?
                  ├ SIM → Premium User
                  └ NAO → (para)
              → Log: message_routed  (continua normal, sem debounce)
              → Consume Nudge        (continua normal, sem debounce)
```

---

## Como funciona

```
MSG1 "reuniao amanha 18h" chega:
  → Main → setar_user → Push Debounce (lista: [msg1])
  → Set Owner = "id1" → Debounce 3s (ESPERA)

MSG2 "depois de amanha as 22h" chega (2s depois):
  → Main → setar_user → Push Debounce (lista: [msg1, msg2])
  → Set Owner = "id2" (SOBRESCREVE id1) → Debounce 3s (ESPERA)

3 segundos depois de MSG1:
  → MSG1 acorda → Get Owner → "id2" ≠ "id1" → PARA (nunca chama Premium)

3 segundos depois de MSG2:
  → MSG2 acorda → Get Owner → "id2" = "id2" → chama Premium User
  → Premium recebe e processa msg1+msg2 juntas
```

**Resultado: 1 chamada ao Premium, 0 duplicatas, 0 msgs perdidas.**

---

## Checklist

- [ ] Premium Main DEV: revertido ao estado original (sem os 4 nodes de antes)
- [ ] Main DEV: 5 nodes colados no canvas
- [ ] Fio cortado: setar_user → Premium User
- [ ] Conectado: setar_user → Push Debounce
- [ ] Conectado: Sou o Ultimo? TRUE → Premium User
- [ ] Push Debounce, Set Owner, Get Owner tem credential "Redis Germany"
- [ ] Salvar workflow Main
- [ ] Salvar workflow Premium

---

## Teste rapido

Enviar uma mensagem unica:

```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.TEST_MAIN_DB","timestamp":"1775100000","type":"text","text":{"body":"oi"}}],"field":"messages"}'
```

Verificar no N8N DEV:
1. Passou por Push Debounce? ✓
2. Passou por Set Owner? ✓
3. Esperou 3 segundos? ✓
4. Passou por Get Owner? ✓
5. "Sou o Ultimo?" retornou TRUE? ✓
6. Chamou Premium User? ✓
