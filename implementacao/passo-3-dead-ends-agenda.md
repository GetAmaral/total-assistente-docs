# Passo 3 — Dead Ends do Switch (Calendar WebHooks)

**Onde:** Sub-workflow "Calendar WebHooks - Total Assistente"
**Resolve:** PF-CW1 (webhook trava sem resposta quando 0 ou >1 resultados)

---

## O Que Fazer

Adicionar 2 nodes Set conectados aos outputs 0 e 2 do Switch que hoje estão desconectados (dead ends).

---

## Como Fazer no N8N

### 3.1 — Node "Resposta Múltiplos" (Switch output 0)

1. Adicione um novo node **Set** ao lado do Switch
2. Nomeie como: `Resposta Multiplos`
3. Configure os campos abaixo
4. Conecte: **Switch output 0** (length > 1) → Resposta Multiplos
5. Este node deve ser o **último** do fluxo (responseMode: lastNode), então a resposta volta ao webhook caller

**Campos do Set node:**

| Campo | Tipo | Valor |
|-------|------|-------|
| `erro` | String | `multiplos_resultados` |
| `quantidade` | Number | `{{ $json.data.length }}` |
| `mensagem` | String | `Encontrei mais de um evento com esses critérios` |

---

### 3.2 — Node "Resposta Nenhum" (Switch output 2)

1. Adicione um novo node **Set** ao lado do Switch
2. Nomeie como: `Resposta Nenhum`
3. Configure os campos abaixo
4. Conecte: **Switch output 2** (length < 1) → Resposta Nenhum
5. Este node deve ser o **último** do fluxo

**Campos do Set node:**

| Campo | Tipo | Valor |
|-------|------|-------|
| `erro` | String | `nenhum_resultado` |
| `mensagem` | String | `Nenhum evento encontrado com esses critérios` |

---

## Resultado Visual

```
Aggregate → Switch
              ├─ Output 0 (>1): → [Resposta Multiplos] ✅ (antes: dead end)
              ├─ Output 1 (=1): → Smart Merge → ... → Update a row1
              └─ Output 2 (<1): → [Resposta Nenhum] ✅ (antes: dead end)
```

---

## Verificação após Passo 3

1. **Evento que não existe:** "muda a aula de natação pra 18h"
   - Esperado: Agent recebe `{"erro":"nenhum_resultado","mensagem":"..."}` e NÃO diz "Prontinho"
   - Antes: webhook travava, timeout, Agent dizia "Prontinho" sem resposta

2. **Múltiplos eventos com mesmo nome:** Crie 2 eventos "Reunião" no mesmo dia, depois "muda a reunião de amanhã"
   - Esperado: Agent recebe `{"erro":"multiplos_resultados","quantidade":2}` e lista opções
   - Antes: webhook travava, timeout
