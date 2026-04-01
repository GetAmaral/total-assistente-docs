# Correcao Debounce — Passo a Passo (N8N DEV)

**Workflow:** Premium Main (DEV)
**Objetivo:** Implementar debounce real com ownership pattern

---

## Antes de comecar

1. Abrir o workflow Premium Main no N8N DEV
2. Localizar o trecho: `pushRedisMessage` → `firstGet`
3. Vamos inserir 4 nodes novos ENTRE `pushRedisMessage` e `firstGet`
4. Vamos desconectar `mediumGet` e `If19`

---

## PASSO 1 — Desconectar o fio pushRedisMessage → firstGet

- Clicar no fio que liga `pushRedisMessage` ao `firstGet`
- Deletar esse fio (clicar no fio e apertar Delete/Backspace)
- Tambem desconectar o fio `Code9` → `mediumGet`
- Tambem desconectar o fio `mediumGet` → `If19`
- Tambem desconectar o fio `If19` (saida TRUE) → `Escolher Branch`
- Tambem desconectar o fio `If19` (saida FALSE) → `No Operation, do nothing2`

> Nao delete os nodes mediumGet e If19. Apenas desconecte os fios.

---

## PASSO 2 — Criar node "Gerar Debounce ID"

**Tipo:** Edit Fields (Set)

Adicionar node → buscar "Edit Fields" ou "Set"

**Configuracao:**

| Campo | Valor |
|-------|-------|
| Mode | Manual |
| Include Other Fields | ON (marcado/true) |

**Assignment 1:**

| Campo | Valor |
|-------|-------|
| Name | `debounce_id` |
| Type | String |
| Value | `={{ Date.now().toString() + '_' + Math.random().toString(36).substring(2, 8) }}` |

**Wiring:**
```
pushRedisMessage → [Gerar Debounce ID]
```

---

## PASSO 3 — Criar node "Set Debounce Owner"

**Tipo:** Redis

Adicionar node → buscar "Redis"

**Configuracao:**

| Campo | Valor |
|-------|-------|
| Credential | (mesma credential Redis que os outros nodes usam) |
| Operation | Set |
| Key | `={{ $('Evolution API- Take all').item.json.phone }}_debounce_owner` |
| Value | `={{ $json.debounce_id }}` |
| Key Type | automatic |
| Expire | ON (marcado/true) |
| TTL | `15` |

**Wiring:**
```
Gerar Debounce ID → [Set Debounce Owner]
```

---

## PASSO 4 — Criar node "Debounce Wait"

**Tipo:** Wait

Adicionar node → buscar "Wait"

**Configuracao:**

| Campo | Valor |
|-------|-------|
| Resume | After Time Interval |
| Amount | `5` |
| Unit | Seconds |

**Wiring:**
```
Set Debounce Owner → [Debounce Wait]
```

---

## PASSO 5 — Criar node "Get Debounce Owner"

**Tipo:** Redis

Adicionar node → buscar "Redis"

**Configuracao:**

| Campo | Valor |
|-------|-------|
| Credential | (mesma credential Redis) |
| Operation | Get |
| Key | `={{ $('Evolution API- Take all').item.json.phone }}_debounce_owner` |
| Property Name | `debounce_owner` |
| Key Type | automatic |

**Wiring:**
```
Debounce Wait → [Get Debounce Owner]
```

---

## PASSO 6 — Criar node "Sou o Ultimo?"

**Tipo:** If

Adicionar node → buscar "If"

**Configuracao:**

| Campo | Valor |
|-------|-------|
| Combinator | AND |
| Case Sensitive | ON |
| Type Validation | Strict |

**Condition 1:**

| Campo | Valor |
|-------|-------|
| Left Value | `={{ $json.debounce_owner }}` |
| Operator | String → is equal to |
| Right Value | `={{ $('Gerar Debounce ID').item.json.debounce_id }}` |

**Wiring:**
```
Get Debounce Owner → [Sou o Ultimo?]

Saida TRUE  → firstGet  (o node que ja existia)
Saida FALSE → No Operation, do nothing2  (o node que ja existia)
```

---

## PASSO 7 — Reconectar Code9 direto ao Escolher Branch

Agora que mediumGet e If19 estao desconectados:

```
Code9 → Escolher Branch  (conectar direto)
```

> Antes era: Code9 → mediumGet → If19 → Escolher Branch
> Agora eh:  Code9 → Escolher Branch

---

## PASSO 8 — Adicionar cleanup do owner key

Para cada node Redis DELETE que ja existe no workflow (Redis2, Redis3, Redis, Redis6, Redis8, Redis10), duplicar e adicionar um DELETE da key `_debounce_owner`.

**OU mais simples:** em cada branch, ANTES do node Redis DELETE existente (ex: Redis2), adicionar a key `_debounce_owner` como um segundo DELETE.

Se preferir so adicionar 1 node de cleanup universal, crie:

**Tipo:** Redis

| Campo | Valor |
|-------|-------|
| Credential | (mesma credential Redis) |
| Operation | Delete |
| Key | `={{ $('Evolution API- Take all').item.json.phone }}_debounce_owner` |

E conecte DEPOIS de cada Redis DELETE existente no fluxo.

> Se for muito trabalhoso agora, pode pular esse passo. O TTL de 15 segundos vai auto-limpar a key de qualquer jeito. Voce pode adicionar o cleanup depois.

---

## Resumo do fluxo final

```
ANTES:
  Merge1 → pushRedisMessage → firstGet → Aggregate7 → RedisChatMem7 → Code9 → mediumGet → If19
                                                                                              ├→ TRUE: Escolher Branch
                                                                                              └→ FALSE: No Operation

DEPOIS:
  Merge1 → pushRedisMessage → Gerar Debounce ID → Set Debounce Owner → Debounce Wait (5s)
    → Get Debounce Owner → Sou o Ultimo?
        ├→ SIM: firstGet → Aggregate7 → RedisChatMem7 → Code9 → Escolher Branch
        └→ NAO: No Operation
```

---

## Checklist antes de salvar

- [ ] pushRedisMessage → Gerar Debounce ID (conectado)
- [ ] Gerar Debounce ID → Set Debounce Owner (conectado)
- [ ] Set Debounce Owner → Debounce Wait (conectado)
- [ ] Debounce Wait → Get Debounce Owner (conectado)
- [ ] Get Debounce Owner → Sou o Ultimo? (conectado)
- [ ] Sou o Ultimo? TRUE → firstGet (conectado)
- [ ] Sou o Ultimo? FALSE → No Operation (conectado)
- [ ] Code9 → Escolher Branch (conectado direto, sem mediumGet/If19)
- [ ] mediumGet esta DESCONECTADO (mas nao deletado)
- [ ] If19 esta DESCONECTADO (mas nao deletado)
- [ ] Todos os nodes novos usam a mesma credential Redis
- [ ] Salvar workflow

---

## Testar

Apos salvar, enviar um teste simples:

```
curl -X POST http://76.13.172.17:5678/webhook/dev-whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","metadata":{"display_phone_number":"554384983452","phone_number_id":"744582292082931"},"contacts":[{"profile":{"name":"Luiz Felipe"},"wa_id":"554391936205"}],"messages":[{"from":"554391936205","id":"wamid.TEST_DEBOUNCE_01","timestamp":"1775100000","type":"text","text":{"body":"oi"}}],"field":"messages"}'
```

Verificar no N8N DEV:
1. A execucao passou por Gerar Debounce ID? ✓
2. Passou por Set Debounce Owner? ✓
3. Esperou 5 segundos no Wait? ✓
4. Passou por Get Debounce Owner? ✓
5. "Sou o Ultimo?" retornou TRUE? ✓
6. Continuou para firstGet → Code9 → Escolher Branch? ✓

Se tudo OK, rodar a bateria de debounce (`bateria-debounce-01-04.md`).
