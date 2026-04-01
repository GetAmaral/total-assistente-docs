# Bateria de Testes — Debounce e Mensagens Consecutivas

**Data:** 2026-04-01
**Ambiente:** N8N DEV (http://76.13.172.17:5678)
**Webhook:** http://76.13.172.17:5678/webhook/dev-whatsapp
**Usuario de teste:** Luiz Felipe (554391936205)

---

## Instrucoes

- Cada teste consiste em enviar **2 ou mais mensagens em sequencia rapida**.
- O intervalo entre as mensagens de um mesmo teste deve ser **entre 1 e 3 segundos** (simular usuario mandando rapido).
- Aguardar **30 segundos** entre cada TESTE (entre um grupo e outro) para garantir que o debounce resetou.
- Apos cada teste, abrir o N8N DEV e anotar:
  1. Quantas execucoes do Premium Main foram disparadas
  2. Para cada execucao: qual mensagem o classificador recebeu, qual branch retornou, qual resposta a IA deu
  3. Se TODAS as mensagens do teste foram processadas (nenhuma perdida)
  4. Se a resposta cobre TODAS as intencoes enviadas
- NAO alterar nenhum workflow entre os testes.
- Executar na ordem: T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12.
- Em cada teste, enviar os curls na ordem indicada (MSG1 primeiro, MSG2 depois, etc).

---

## GRUPO A — Reproducao exata do erro (5 testes identicos)

Enviar as duas mensagens abaixo com intervalo de 1-2 segundos entre elas.

### TESTE T1

**MSG1** (enviar primeiro):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T1M1","timestamp":"1775014800","type":"text","text":{"body":"reuniao amanha as 18h"}}],"field":"messages"}'
```

**MSG2** (enviar 1-2 segundos depois):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T1M2","timestamp":"1775014802","type":"text","text":{"body":"depois de amanha as 22h"}}],"field":"messages"}'
```

Aguardar 30 segundos antes do proximo teste.

---

### TESTE T2

**MSG1** (enviar primeiro):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T2M1","timestamp":"1775014900","type":"text","text":{"body":"reuniao amanha as 18h"}}],"field":"messages"}'
```

**MSG2** (enviar 1-2 segundos depois):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T2M2","timestamp":"1775014902","type":"text","text":{"body":"depois de amanha as 22h"}}],"field":"messages"}'
```

Aguardar 30 segundos antes do proximo teste.

---

### TESTE T3

**MSG1** (enviar primeiro):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T3M1","timestamp":"1775015000","type":"text","text":{"body":"reuniao amanha as 18h"}}],"field":"messages"}'
```

**MSG2** (enviar 1-2 segundos depois):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T3M2","timestamp":"1775015002","type":"text","text":{"body":"depois de amanha as 22h"}}],"field":"messages"}'
```

Aguardar 30 segundos antes do proximo teste.

---

### TESTE T4

**MSG1** (enviar primeiro):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T4M1","timestamp":"1775015100","type":"text","text":{"body":"reuniao amanha as 18h"}}],"field":"messages"}'
```

**MSG2** (enviar 1-2 segundos depois):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T4M2","timestamp":"1775015102","type":"text","text":{"body":"depois de amanha as 22h"}}],"field":"messages"}'
```

Aguardar 30 segundos antes do proximo teste.

---

### TESTE T5

**MSG1** (enviar primeiro):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T5M1","timestamp":"1775015200","type":"text","text":{"body":"reuniao amanha as 18h"}}],"field":"messages"}'
```

**MSG2** (enviar 1-2 segundos depois):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T5M2","timestamp":"1775015202","type":"text","text":{"body":"depois de amanha as 22h"}}],"field":"messages"}'
```

Aguardar 30 segundos antes do proximo teste.

---

## GRUPO B — Cenarios semelhantes (mensagens consecutivas de funcoes diferentes)

### TESTE T6 — Dois eventos diferentes em sequencia

**MSG1** (enviar primeiro):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T6M1","timestamp":"1775015300","type":"text","text":{"body":"dentista sexta as 14h"}}],"field":"messages"}'
```

**MSG2** (enviar 1-2 segundos depois):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T6M2","timestamp":"1775015302","type":"text","text":{"body":"academia amanha 7h"}}],"field":"messages"}'
```

Aguardar 30 segundos.

---

### TESTE T7 — Evento + gasto em sequencia

**MSG1** (enviar primeiro):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T7M1","timestamp":"1775015400","type":"text","text":{"body":"reuniao com cliente amanha 10h"}}],"field":"messages"}'
```

**MSG2** (enviar 1-2 segundos depois):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T7M2","timestamp":"1775015402","type":"text","text":{"body":"gastei 45 reais no almoco"}}],"field":"messages"}'
```

Aguardar 30 segundos.

---

### TESTE T8 — Tres mensagens em rajada

**MSG1** (enviar primeiro):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T8M1","timestamp":"1775015500","type":"text","text":{"body":"reuniao amanha 9h"}}],"field":"messages"}'
```

**MSG2** (enviar 1-2 segundos depois):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T8M2","timestamp":"1775015502","type":"text","text":{"body":"almoco 12h com o joao"}}],"field":"messages"}'
```

**MSG3** (enviar 1-2 segundos depois da MSG2):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T8M3","timestamp":"1775015504","type":"text","text":{"body":"cancela o dentista de sexta"}}],"field":"messages"}'
```

Aguardar 30 segundos.

---

### TESTE T9 — Gasto + gasto em sequencia

**MSG1** (enviar primeiro):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T9M1","timestamp":"1775015600","type":"text","text":{"body":"uber 27,90"}}],"field":"messages"}'
```

**MSG2** (enviar 1-2 segundos depois):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T9M2","timestamp":"1775015602","type":"text","text":{"body":"mercado 150"}}],"field":"messages"}'
```

Aguardar 30 segundos.

---

### TESTE T10 — Evento + correcao imediata

**MSG1** (enviar primeiro):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T10M1","timestamp":"1775015700","type":"text","text":{"body":"reuniao amanha 15h"}}],"field":"messages"}'
```

**MSG2** (enviar 1-2 segundos depois):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T10M2","timestamp":"1775015702","type":"text","text":{"body":"nao, as 16h"}}],"field":"messages"}'
```

Aguardar 30 segundos.

---

### TESTE T11 — Mensagem + relatorio em sequencia

**MSG1** (enviar primeiro):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T11M1","timestamp":"1775015800","type":"text","text":{"body":"minha agenda de amanha"}}],"field":"messages"}'
```

**MSG2** (enviar 1-2 segundos depois):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T11M2","timestamp":"1775015802","type":"text","text":{"body":"e me manda o relatorio do mes"}}],"field":"messages"}'
```

Aguardar 30 segundos.

---

### TESTE T12 — Controle: mensagem unica (sem debounce)

**MSG1** (enviar sozinha, sem segunda mensagem):
```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.DEBOUNCE_T12M1","timestamp":"1775015900","type":"text","text":{"body":"reuniao amanha as 18h"}}],"field":"messages"}'
```

Aguardar 30 segundos. Fim da bateria.

---

## Tabela de Resultados

Preencher apos executar cada teste:

| Teste | Msgs enviadas | Execucoes Premium disparadas | MSG1 processada? | MSG2 processada? | MSG3 processada? | Resposta(s) da IA (resumo) |
|-------|--------------|------------------------------|------------------|------------------|------------------|---------------------------|
| T1    | 2            |                              |                  |                  | —                |                           |
| T2    | 2            |                              |                  |                  | —                |                           |
| T3    | 2            |                              |                  |                  | —                |                           |
| T4    | 2            |                              |                  |                  | —                |                           |
| T5    | 2            |                              |                  |                  | —                |                           |
| T6    | 2            |                              |                  |                  | —                |                           |
| T7    | 2            |                              |                  |                  | —                |                           |
| T8    | 3            |                              |                  |                  |                  |                           |
| T9    | 2            |                              |                  |                  | —                |                           |
| T10   | 2            |                              |                  |                  | —                |                           |
| T11   | 2            |                              |                  |                  | —                |                           |
| T12   | 1            |                              |                  | —                | —                |                           |
