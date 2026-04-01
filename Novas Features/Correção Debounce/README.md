# Correcao Debounce — Premium Main

**Data:** 2026-04-01
**Workflow:** Premium Main (`tyJ3YAAtSg1UurFj`)
**Base:** Bateria de testes debounce 01/04 (12 testes, 25 mensagens)

---

## 1. O Que Aconteceu

### Cenario real

Usuario envia duas mensagens rapidas:
```
00:34:05 → "reuniao amanha as 18h"
00:34:08 → "depois de manaha as 22h"
```

### O que o sistema fez

```
MSG1 → Main #1 → Premium #1 (pushRedis → firstGet → Code9 → classificador → criou evento 18h) → Redis2 DELETE
MSG2 → Main #2 → Premium #2 (pushRedis → firstGet → Redis JA DELETADO → Code9 msg vazia → padrao → "nao consegui processar")
```

**Premium #1 deletou a lista Redis 20ms depois de Premium #2 ter feito push.** A mensagem 2 foi destruida.

### Resultados da bateria (12 testes)

| Problema | Ocorrencia |
|----------|-----------|
| Debounce efetivo (msgs agrupadas em 1 exec) | **0 de 12 testes** |
| Acoes duplicadas (mesmo evento criado 2x) | T2, T3, T4, T5 |
| Gasto vira evento (classificacao errada) | T7 — "gastei 45 no almoco" virou evento |
| Mensagens perdidas | T8-MSG3, T11-MSG1, T11-MSG2 |
| Contaminacao Redis (msg de sessao anterior) | T1, T11 |

---

## 2. Causa Raiz

### Problema 1: Nao existe debounce

O fluxo atual **nao eh debounce**. Cada webhook dispara uma execucao independente. O `firstGet/mediumGet/If19` tenta detectar se algo mudou no Redis entre duas leituras, mas:

- Nao tem janela de espera (Wait)
- Nao tem lock (SETNX)
- O DELETE de uma execucao destroi mensagens de outra

### Problema 2: Race condition no DELETE

```
T=0ms    Premium #2 → pushRedisMessage (msg2 entra no Redis)
T=20ms   Premium #1 → Redis2 DELETE (apaga lista inteira, incluindo msg2)
T=24ms   Premium #2 → firstGet (lista ja deletada → null)
```

Janela de 20ms. Impossivel de evitar sem lock.

### Problema 3: Contaminacao do Redis

O Code9 le `mensagem_principal` do buffer Redis (`firstGet`). Quando o buffer tem lixo de execucoes anteriores (que nao limparam corretamente), Code9 extrai a mensagem errada.

---

## 3. Solucao: Debounce com Ownership (SET + Wait + GET)

### Principio

Cada execucao gera um ID unico. Apos fazer push da mensagem, ela registra seu ID como "dono" do debounce. Depois espera 5 segundos. Ao acordar, verifica: o dono ainda sou eu?

- **SIM** (nenhuma msg nova chegou) → eu sou o ultimo, processo tudo
- **NAO** (outra msg chegou e sobrescreveu o dono) → paro, a outra execucao vai processar

### Por que funciona

A cada nova mensagem, o owner eh sobrescrito. Apos 5 segundos de silencio, so o ULTIMO owner esta no Redis. Todas as execucoes anteriores acordam, veem que nao sao mais o dono, e param.

```
MSG1 → push → SET owner="exec1" → Wait 5s → GET owner → "exec2" (nao sou eu) → STOP
MSG2 → push → SET owner="exec2" → Wait 5s → GET owner → "exec2" (sou eu!) → PROCESS ALL
```

### Vantagens

- Usa apenas nodes nativos do N8N (Redis SET, Wait, Redis GET, If)
- Nao precisa de SETNX nem Lua scripts
- Nao precisa de workflow separado
- Remove o `mediumGet` e `If19` (mecanismo antigo)
- Zero race condition (o check acontece DEPOIS do wait)

---

## 4. Fluxo Antes vs Depois

### ANTES (bugado)

```
Merge1 → pushRedisMessage → firstGet → Aggregate7 → Redis Chat Memory7
  → Code9 → mediumGet → If19
    → TRUE (tamanhos iguais): Escolher Branch → ...
    → FALSE: No Operation (stop)
```

### DEPOIS (corrigido)

```
Merge1 → pushRedisMessage → Set Debounce Owner → Debounce Wait (5s)
  → Get Debounce Owner → Sou o Ultimo?
    → SIM: firstGet → Aggregate7 → Redis Chat Memory7 → Code9 → Escolher Branch → ...
    → NAO: No Operation (stop)
```

### Nodes removidos
- `mediumGet` — nao precisa mais da segunda leitura
- `If19` — substituido por "Sou o Ultimo?"

### Nodes adicionados
- `Set Debounce Owner` — Redis SET com o ID unico da execucao
- `Debounce Wait` — Wait 5 segundos
- `Get Debounce Owner` — Redis GET para verificar quem eh o dono
- `Sou o Ultimo?` — If comparando IDs

---

## 5. Implementacao Passo a Passo

### PASSO 1 — Criar node "Set Debounce Owner"

**Tipo:** Redis
**Posicao:** Entre `pushRedisMessage` e `firstGet`
**Conexao:** pushRedisMessage → **Set Debounce Owner** → Debounce Wait

**Configuracao:**
```
Operation: Set
Key:       ={{ $('Evolution API- Take all').item.json.phone }}_debounce_owner
Value:     ={{ Date.now().toString() + '_' + Math.random().toString(36).substring(2, 8) }}
Expire:    true
TTL:       15
```

> O Value gera um ID unico por execucao (timestamp + random). O TTL de 15s garante limpeza automatica.

---

### PASSO 2 — Criar node "Debounce Wait"

**Tipo:** Wait
**Posicao:** Depois de "Set Debounce Owner"
**Conexao:** Set Debounce Owner → **Debounce Wait** → Get Debounce Owner

**Configuracao:**
```
Resume:    After Time Interval
Amount:    5
Unit:      Seconds
```

---

### PASSO 3 — Criar node "Get Debounce Owner"

**Tipo:** Redis
**Posicao:** Depois de "Debounce Wait"
**Conexao:** Debounce Wait → **Get Debounce Owner** → Sou o Ultimo?

**Configuracao:**
```
Operation:     Get
Key:           ={{ $('Evolution API- Take all').item.json.phone }}_debounce_owner
Property Name: debounce_owner
Key Type:      automatic
```

---

### PASSO 4 — Criar node "Sou o Ultimo?"

**Tipo:** If
**Posicao:** Depois de "Get Debounce Owner"
**Conexao TRUE:** → `firstGet` (continua o fluxo normal)
**Conexao FALSE:** → `No Operation, do nothing2` (para a execucao)

**Configuracao:**
```
Conditions:
  Left Value:  ={{ $json.debounce_owner }}
  Operation:   equals
  Right Value: ={{ $('Set Debounce Owner').item.json.value }}
```

> IMPORTANTE: O `$('Set Debounce Owner').item.json.value` referencia o valor que foi setado no PASSO 1. Se o N8N nao expor esse valor automaticamente, use a alternativa abaixo.

**Alternativa (mais segura):** Adicionar um Set Fields node entre pushRedisMessage e Set Debounce Owner que salva o ID em um campo:

```
// Node "Gerar Debounce ID" (tipo: Set / Edit Fields)
Campo: debounce_id
Valor: ={{ Date.now().toString() + '_' + Math.random().toString(36).substring(2, 8) }}
```

E entao:
- "Set Debounce Owner" usa: `Value: ={{ $json.debounce_id }}`
- "Sou o Ultimo?" compara: `{{ $json.debounce_owner }}` equals `{{ $('Gerar Debounce ID').item.json.debounce_id }}`

---

### PASSO 5 — Reconectar firstGet

**Antes:** pushRedisMessage → firstGet
**Depois:** "Sou o Ultimo?" (TRUE) → firstGet

O firstGet continua funcionando igual — le a lista `{phone}_debounce` com todas as mensagens acumuladas.

---

### PASSO 6 — Remover mediumGet e If19

**Antes:** Code9 → mediumGet → If19 → Escolher Branch
**Depois:** Code9 → Escolher Branch (direto)

Desconectar `mediumGet` e `If19` do fluxo. Conectar a saida do `Code9` direto ao `Escolher Branch`.

> Nao precisa deletar os nodes, apenas desconectar. Assim eh facil reverter se necessario.

---

### PASSO 7 — Adicionar cleanup do owner key

Em CADA branch de cleanup que ja tem DEL do `_debounce` (nodes Redis2, Redis3, Redis, Redis6, Redis8, Redis10), adicionar um node Redis DELETE para `_debounce_owner` APOS o DEL do `_debounce`.

**Ou mais simples:** No ultimo node de cada branch (antes do Send message), adicionar um Code node que deleta ambas as keys. Porem, como cada branch ja tem seu proprio Redis DELETE, basta duplicar o padrao.

**Configuracao do novo Redis DELETE:**
```
Operation: Delete
Key:       ={{ $('Evolution API- Take all').item.json.phone }}_debounce_owner
```

---

## 6. Resumo Visual das Conexoes

```
ANTES:
  Merge1 → pushRedisMessage → firstGet → Aggregate7 → RedisChatMemory7 → Code9 → mediumGet → If19
                                                                                                 ├→ TRUE: Escolher Branch
                                                                                                 └→ FALSE: No Operation

DEPOIS:
  Merge1 → pushRedisMessage → Gerar Debounce ID → Set Debounce Owner → Debounce Wait (5s)
    → Get Debounce Owner → Sou o Ultimo?
        ├→ SIM: firstGet → Aggregate7 → RedisChatMemory7 → Code9 → Escolher Branch
        └→ NAO: No Operation
```

---

## 7. Configs Prontos para Ctrl+C Ctrl+V

Os arquivos de configuracao de cada node estao nesta pasta:

- `node-gerar-debounce-id.txt` — Edit Fields: gera ID unico
- `node-set-debounce-owner.txt` — Redis SET: registra owner
- `node-debounce-wait.txt` — Wait: 5 segundos
- `node-get-debounce-owner.txt` — Redis GET: le owner atual
- `node-sou-o-ultimo.txt` — If: compara IDs
- `node-del-debounce-owner.txt` — Redis DELETE: cleanup

---

## 8. Criterios de Sucesso

Apos aplicar a correcao, rodar a bateria `bateria-debounce-01-04.md` novamente.

| Metrica | Pre-fix | Pos-fix esperado |
|---------|---------|------------------|
| Debounce efetivo (msgs agrupadas) | 0/12 | 11/12 (T12 eh controle, msg unica) |
| Mensagens perdidas | 3 | 0 |
| Acoes duplicadas | 4 testes | 0 |
| Gasto vira evento | 1 | 0 |
| Contaminacao Redis | 2 testes | 0 |

---

## 9. Riscos e Mitigacao

| Risco | Mitigacao |
|-------|----------|
| Wait node perde execucao se N8N reiniciar | TTL de 15s no owner key garante cleanup automatico. Mensagens ficam no Redis ate proximo envio |
| 5 segundos eh muito / pouco | Ajustavel no Wait node. 5s eh consenso para WhatsApp |
| Owner key nao eh deletada (edge case) | TTL de 15s auto-expira |
| User envia msgs por mais de 5s seguidos | Cada nova msg reseta o owner. So o ultimo Wait processa |

---

*Baseado em: BBBK (honestidade radical), Aviation Safety (Swiss Cheese), Debounce best practices (Redis SETNX pattern adaptado para N8N)*
