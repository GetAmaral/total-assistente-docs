# Estudo Completo: Debounce — Do Basico ao Avancado

**Data:** 2026-04-04
**Objetivo:** Entender debounce em profundidade antes de reescrever o sistema do Total Assistente
**Fontes:** Redis oficial, AWS, Google Cloud, Anthropic, OpenAI, Twilio, Slack, Temporal.io, N8N Community, Inngest, Hookdeck, Martin Kleppmann

---

## Indice

1. [Definicoes Precisas](#1-definicoes-precisas)
2. [Debounce no Frontend (origem do conceito)](#2-debounce-no-frontend)
3. [Debounce no Backend (onde estamos)](#3-debounce-no-backend)
4. [Deduplicacao vs Debounce](#4-deduplicacao-vs-debounce)
5. [Padroes com Redis](#5-padroes-com-redis)
6. [Como Empresas Grandes Fazem](#6-como-empresas-grandes-fazem)
7. [Debounce em Sistemas de Mensageria](#7-debounce-em-sistemas-de-mensageria)
8. [Debounce em Workflow Automation (N8N)](#8-debounce-em-workflow-automation)
9. [Side Effects e Idempotencia](#9-side-effects-e-idempotencia)
10. [Anti-Patterns (O Que NAO Fazer)](#10-anti-patterns)
11. [Arquitetura de Referencia](#11-arquitetura-de-referencia)
12. [Fontes](#12-fontes)

---

## 1. Definicoes Precisas

Fonte: MDN Web Docs (Mozilla)

### Debounce

> "Descarta operacoes que ocorrem muito proximas e as consolida em uma unica invocacao. A funcao espera ate que as invocacoes PAREM por um tempo especifico."

- A primeira chamada eh a **leading edge** (borda de subida)
- Chamadas subsequentes dentro da janela formam um "batch"
- Apos o delay sem novas chamadas, temos a **trailing edge** (borda de descida)
- Normalmente executa apenas na trailing edge

**Analogia:** Elevador. A porta so fecha quando ninguem mais entra. Cada nova pessoa reseta o timer.

### Throttle

> "Impoe uma taxa MAXIMA de execucao. A operacao executa no maximo uma vez por intervalo."

- NAO espera inatividade
- Executa em cadencia fixa independente de quantos eventos chegam
- Ex: scroll handler que atualiza no maximo 1x a cada 100ms

**Analogia:** Metronomia. Toca a cada X segundos, nao importa quantas notas voce tente.

### Rate Limiting

> "Controla quantas operacoes podem ser feitas em um periodo. Sinonimo de throttling no servidor."

- Resposta HTTP padrao: `429 Too Many Requests`
- Usado para protecao do servidor e mitigacao de DoS

### Resumo Visual

```
Debounce:   ──●──●──●──────[wait]──→ EXECUTA (1x)
                                      Espera parar de receber

Throttle:   ──●──●──●──●──●──●──●──
              ↑        ↑        ↑
              EXEC     EXEC     EXEC   (1x a cada intervalo)

Rate Limit: ──●──●──●──●──●──✗──✗──
              ↑  ↑  ↑  ↑  ↑
              OK OK OK OK OK  BLOCKED  (max N no periodo)
```

---

## 2. Debounce no Frontend

Onde o conceito nasceu. Util para entender a logica core.

### Implementacao Classica (JavaScript)

```javascript
function debounce(func, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);                    // Cancela timer anterior
    timer = setTimeout(() => {
      func.apply(this, args);               // Executa com os args mais recentes
    }, delay);
  };
}

// Uso:
const buscar = debounce((termo) => {
  fetch(`/api/search?q=${termo}`);
}, 300);

input.addEventListener('input', (e) => buscar(e.target.value));
```

**O que acontece:**
1. Cada keystroke chama `buscar()`
2. `clearTimeout` cancela a busca anterior
3. `setTimeout` agenda nova busca em 300ms
4. So a ULTIMA keystroke (apos 300ms de silencio) dispara a busca real

### Por que funciona no frontend

- **Estado compartilhado:** A variavel `timer` eh visivel para todas as chamadas (closure)
- **Single-thread:** JavaScript no browser roda em uma unica thread — nao tem race condition
- **Sem side-effects na espera:** `clearTimeout` cancela completamente — nada foi executado

### Por que NAO funciona direto no backend

- **Sem estado compartilhado:** Cada request eh uma execucao independente (especialmente em N8N)
- **Multi-thread/processo:** Requests paralelos nao compartilham variaveis
- **Side-effects possiveis:** O "cancelamento" precisa acontecer ANTES de qualquer acao com efeito colateral

---

## 3. Debounce no Backend

### O Desafio

No backend, cada mensagem dispara uma execucao INDEPENDENTE. Nao existe uma variavel `timer` compartilhada. Precisamos de um **estado externo** (Redis, banco de dados) para coordenar.

### Padrao Fundamental: Timer-Reset com Estado Externo

```
MSG1 chega → Armazena MSG1 + Registra timestamp → Espera N segundos
MSG2 chega → Armazena MSG2 + Sobrescreve timestamp → Espera N segundos

MSG1 acorda → Le timestamp → "1234" != "1234"? Nao, timestamp mudou → PARA
MSG2 acorda → Le timestamp → "5678" == "5678"? Sim, sou o ultimo → PROCESSA TUDO
```

### Dois Modelos Fundamentais

**Modelo A: Timestamp Race (Last-Write-Wins)**
1. Cada execucao salva seu timestamp em Redis
2. Espera N segundos
3. Relê o timestamp — se mudou, outra execucao eh mais recente → para
4. Se nao mudou, sou o ultimo → processo

**Modelo B: Version Counter (Ticket)**
1. Cada execucao incrementa um contador atomico (INCR) em Redis
2. Salva seu numero do ticket
3. Espera N segundos
4. Relê o contador — se mudou, outra execucao incrementou → para
5. Se igual, sou o ultimo → processo

**Modelo B eh mais robusto** porque INCR eh atomico e monotonicamente crescente. Timestamps podem ter colisoes (2 msgs no mesmo milissegundo).

### A Janela de Espera (o Wait)

Esse eh o tradeoff central do debounce no backend:

| Wait Curto (1-2s) | Wait Longo (5-10s) |
|---|---|
| Resposta mais rapida | Agrupa mais mensagens |
| Pode nao capturar todas as msgs do burst | Captura bursts longos |
| Melhor UX para mensagens unicas | Pior UX para mensagens unicas |

**Para WhatsApp:** 3-5 segundos eh o consenso da comunidade. Usuarios de WhatsApp tipicamente terminam de digitar em 2-4 segundos.

---

## 4. Deduplicacao vs Debounce

Conceitos relacionados mas DIFERENTES:

| | Deduplicacao | Debounce |
|---|---|---|
| **Objetivo** | Evitar processar o MESMO evento 2x | Agrupar MULTIPLOS eventos em 1 |
| **Input** | Mesmo evento repetido (retry) | Eventos diferentes do mesmo usuario |
| **Mecanismo** | ID unico + check "ja vi isso?" | Timer + "esperar parar de chegar" |
| **Exemplo** | WhatsApp reenvia o mesmo webhook | Usuario manda 3 msgs rapidas |
| **Redis** | SET NX (idempotency gate) | INCR + Wait + Compare |

**Em sistemas de chat, precisamos dos DOIS:**
1. **Deduplicacao:** WhatsApp pode reenviar o mesmo webhook (retry) — precisamos ignorar
2. **Debounce:** Usuario pode mandar 3 msgs em 2 segundos — precisamos agrupar

---

## 5. Padroes com Redis

### 5.1 SET NX — Idempotency Gate (Deduplicacao)

Fonte: Redis oficial (redis.io/tutorials/data-deduplication-with-redis)

```redis
SET {scope}:{idempotencyKey} "claimed" NX EX {ttlSeconds}
```

- `NX` = Set if Not eXists (atomico, zero race condition)
- `EX` = Auto-expira apos N segundos
- Retorna `OK` na primeira chamada (processar)
- Retorna `nil` em duplicatas (ignorar)

**Unico comando = atomico = sem TOCTOU.** Esta eh a primitiva fundamental de deduplicacao no Redis.

### 5.2 INCR + Compare — Debounce por Version Counter

```
# Cada mensagem:
INCR {phone}:debounce:version    → retorna ticket (ex: 42)
EXPIRE {phone}:debounce:version 30

# Apos espera:
GET {phone}:debounce:version     → retorna versao atual
# Se versao atual == meu ticket → sou o ultimo, processar
# Se versao atual > meu ticket → outra msg chegou, parar
```

### 5.3 RPUSH + LRANGE — Acumulacao de Mensagens

```
# Cada mensagem:
RPUSH {phone}:debounce:msgs '{"text":"oi","ts":1234}'
EXPIRE {phone}:debounce:msgs 60

# Quando o ultimo processa:
LRANGE {phone}:debounce:msgs 0 -1   → retorna TODAS as msgs
DEL {phone}:debounce:msgs            → limpa
```

### 5.4 Lua Script — Operacoes Atomicas

Fonte: Redis oficial (redis.io/docs/latest/develop/programmability)

O Redis executa Lua scripts de forma **atomica** — nenhum outro comando roda durante a execucao do script. Isso elimina race conditions entre read-check-write.

**Por que Lua e nao MULTI/EXEC?**

| | Lua (EVAL) | MULTI/EXEC |
|---|---|---|
| Atomicidade | Total — bloqueia o servidor | WATCH pode falhar sob contencao |
| TOCTOU | Eliminado | Vulneravel |
| Round trips | 1 | Minimo 3 (WATCH, MULTI, EXEC) |
| Branching | Sim (if/else dentro do script) | Nao (nao pode decidir baseado em leitura) |

**Script de debounce atomico completo:**

```lua
-- KEYS[1] = {phone}:debounce:version
-- KEYS[2] = {phone}:debounce:msgs
-- ARGV[1] = mensagem (JSON)
-- ARGV[2] = TTL em segundos

-- 1. Acumula mensagem
redis.call('RPUSH', KEYS[2], ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[2])

-- 2. Incrementa versao (ticket)
local version = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])

-- Retorna o ticket para esta execucao
return version
```

**Script de processamento (apos a espera):**

```lua
-- KEYS[1] = {phone}:debounce:version
-- KEYS[2] = {phone}:debounce:msgs
-- KEYS[3] = {phone}:debounce:lock
-- ARGV[1] = meu ticket (versao esperada)
-- ARGV[2] = lock TTL em ms

-- 1. Verifica se sou o ultimo
local current = tonumber(redis.call('GET', KEYS[1]))
if current ~= tonumber(ARGV[1]) then
    return nil  -- outra msg chegou, abortar
end

-- 2. Adquire lock (evita dupla execucao)
local locked = redis.call('SET', KEYS[3], '1', 'NX', 'PX', ARGV[2])
if not locked then
    return nil  -- outra instancia ja esta processando
end

-- 3. Busca todas as mensagens
local msgs = redis.call('LRANGE', KEYS[2], 0, -1)

-- 4. Limpa tudo
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])

return msgs
```

**Isso eh 100% atomico.** Verifica versao + adquire lock + busca msgs + limpa = uma unica operacao sem race conditions.

### 5.5 Rate Limiting — 5 Algoritmos (Redis oficial)

Fonte: redis.io/tutorials/howtos/ratelimiting

| Algoritmo | Como funciona | Melhor para |
|---|---|---|
| **Fixed Window** | 1 contador por janela, INCR + EXPIRE | Simplicidade |
| **Sliding Window Log** | Sorted Set com timestamps | Precisao sem burst |
| **Sliding Window Counter** | Media ponderada de 2 janelas fixas | Melhor geral (recomendado pelo Redis) |
| **Token Bucket** | Hash com tokens + refill rate | Bursts controlados (AWS, Stripe) |
| **Leaky Bucket** | Fila com vazao constante | Zero burst |

---

## 6. Como Empresas Grandes Fazem

### 6.1 AWS — SQS FIFO + Lambda Idempotency

Fonte: docs.aws.amazon.com

**SQS FIFO:** Janela de deduplicacao de 5 minutos. Mensagens com o mesmo `MessageDeduplicationId` sao aceitas mas NAO entregues. Pode usar hash SHA-256 do body automaticamente.

**Lambda Powertools (Idempotency):**

```
1a chamada:  PutItem(INPROGRESS) → Executa handler → UpdateItem(COMPLETED + resultado)
Retry:       GetItem → Ja COMPLETED → Retorna resultado cacheado (sem re-execucao)
Concorrente: GetItem → INPROGRESS → Throw IdempotencyAlreadyInProgressError
Timeout:     inProgressExpiryTimestamp expirou → Trata como nova execucao
Excecao:     Record DELETADO → Proximo retry executa fresh
```

**Maquina de estados:**
```
INEXISTENTE → INPROGRESS → COMPLETED
                ↓ (excecao)
              DELETADO → (retry pode executar novamente)
```

**Melhores praticas da AWS:**
- Use `eventKeyJmesPath` para selecionar subconjunto do payload como chave (nao o evento inteiro)
- Use `payloadValidationJmesPath` para detectar se o payload mudou entre retries
- Excecoes nao tratadas DELETAM o registro de idempotencia, permitindo retry seguro

### 6.2 Google Cloud — Idempotencia em Cloud Functions

Fonte: cloud.google.com/functions/docs/bestpractices

**4 estrategias de idempotencia:**

1. **Event ID como chave:** Usar o ID unico do evento (imutavel em retries) como document ID no Firestore
2. **Transacoes de banco:** Query estado em uma transacao antes de mutar
3. **Mecanismo de lease:** Lock exclusivo na secao nao-idempotente
4. **Cleanup out-of-band:** Processos separados lidam com duplicatas

**Anti-pattern critico:** Habilitar retries sem idempotencia = loops infinitos de retry que duram **dias**.

**Protecao por idade do evento:**
```javascript
const eventAge = Date.now() - Date.parse(event.time);
const eventMaxAge = 10000; // 10 segundos
if (eventAge > eventMaxAge) {
  console.log(`Descartando evento com idade ${eventAge}ms`);
  return;  // Evento muito velho, ignorar
}
```

### 6.3 Anthropic Claude API — Token Bucket

Fonte: platform.claude.com/docs/en/api/rate-limits

- Algoritmo: **Token Bucket** (replenishment continuo, nao reset fixo)
- Dimensoes: RPM, ITPM (input tokens/min), OTPM (output tokens/min)
- Cached tokens NAO contam no ITPM (otimizacao para cache hits)
- Headers de resposta: `anthropic-ratelimit-*` com `-limit`, `-remaining`, `-reset`
- **Sem mecanismo nativo de idempotencia** — voce deve implementar client-side

### 6.4 OpenAI API — Exponential Backoff

Fonte: developers.openai.com/cookbook

```python
from tenacity import retry, stop_after_attempt, wait_random_exponential

@retry(wait=wait_random_exponential(min=1, max=60), stop=stop_after_attempt(6))
def completion_with_backoff(**kwargs):
    return client.chat.completions.create(**kwargs)
```

- Backoff exponencial com **jitter** (aleatoriedade) para evitar thundering herd
- `max_tokens` inflado = rate limit consumido desnecessariamente
- Batch API para workloads nao-real-time

### 6.5 Temporal.io — Workflow ID como Idempotency Key

Fonte: temporal.io/blog/idempotency

O conceito mais elegante: o **ID do workflow** eh a chave de idempotencia.

```
Start workflow "order-12345" → OK (criado)
Start workflow "order-12345" → Erro (ja existe) → Retorna resultado do existente
```

**Nenhum Redis, nenhum timer, nenhum race condition.** O proprio sistema de orquestracao garante unicidade.

**Signal with Start:** Envia um sinal para um workflow em execucao. Se nao existe, cria um. Isso eh exatamente o pattern de debounce para chat:
- MSG1 → Start workflow (cria buffer)
- MSG2 → Signal workflow (adiciona ao buffer)
- MSG3 → Signal workflow (adiciona ao buffer)
- Workflow espera N segundos sem sinais → processa todo o buffer

---

## 7. Debounce em Sistemas de Mensageria

### 7.1 WhatsApp Business API

Fonte: Hookdeck, Medium

- **Entrega:** At-least-once. Duplicatas sao condicao NORMAL de operacao.
- **Retry:** Backoff exponencial por ate **7 dias** se endpoint nao retorna 200
- **Timeout:** 5-10 segundos. Se nao responder nesse tempo, Meta faz retry.
- **Chave de deduplicacao:** `messages[].id` (cada mensagem tem ID unico)

**Padrao recomendado (Redis):**
```
1. Extrair message_id do webhook
2. redis.setex(message_id, 3600, "seen")
3. Se redis.get(message_id) retorna valor → duplicata, ignorar
4. Senao → processar
```

**Capacidade:** 500 msgs/sec = ate 1500+ webhooks/sec (status updates multiplicam). Infraestrutura deve aguentar 3x o trafego de saida + incoming.

### 7.2 Twilio

Fonte: twilio.com/docs/events

- **Entrega:** At-least-once via Event Streams
- **Retry:** Backoff exponencial com jitter por ate 4 horas
- **Deduplicacao:** Event `id` (SID) + header `I-Twilio-Idempotency-Token`
- **Backpressure via HTTP:**
  - `429` → Twilio reduz velocidade mas preserva eventos
  - `400` → Twilio descarta permanentemente
  - `200` em duplicatas → previne novos retries

### 7.3 Slack Events API

Fonte: docs.slack.dev/apis/events-api

- **Timeout:** App DEVE responder com 2xx em **3 SEGUNDOS** (limite rigido)
- **Retry:** 3 tentativas (imediata, 1 min, 5 min)
- **Headers de retry:** `x-slack-retry-num`, `x-slack-retry-reason`
- **Deduplicacao:** `event_id` (globalmente unico) + `event_ts`

**Caso real: 6 respostas duplicadas**
Fonte: startaitools.com

Um bot com LLM demorava 10-60s para processar. Slack dava timeout em 3s e fazia retry. Cada retry disparava outra chamada ao LLM. Resultado: 6 respostas identicas.

**Fix:**
```python
# Retorna 200 em < 100ms
if event_id in cache:
    return {"ok": True}  # Duplicata

# Processa em background
thread = threading.Thread(target=process, args=(text, channel))
thread.start()

return {"ok": True}  # Responde imediatamente
```

**Licao:** Retornar 200 IMEDIATAMENTE, processar em background. Nao tente fazer processamento pesado dentro do handler do webhook.

### 7.4 Discord

Fonte: docs.discord.com/developers/topics/rate-limits

- **Rate limit:** Por rota + global (50 req/s para todos os bots)
- **Buckets:** Endpoints relacionados compartilham buckets
- **Headers:** `X-RateLimit-Remaining`, `X-RateLimit-Reset-After`
- **Algoritmo:** Leaky bucket (rotas) + fixed window (gateway)

---

## 8. Debounce em Workflow Automation

### 8.1 O Problema Fundamental do N8N

Cada webhook dispara uma **execucao independente**. O Wait node pausa UMA execucao, mas NAO agrega dados de outras execucoes concorrentes. Nao existe estado compartilhado nativo.

**Isso significa:** O N8N sozinho NAO pode fazer debounce. Precisa de Redis (ou banco) como estado externo.

### 8.2 Padrao A: Timestamp Race (mais usado na comunidade N8N)

Fonte: community.n8n.io

```
MSG chega → RPUSH buffer + SET last_ts → Wait 10s
            → GET last_ts
            → Se last_ts > meu_ts → PARA (outra msg chegou)
            → Se last_ts == meu_ts → LRANGE buffer → PROCESSA → DEL
```

**Problemas:**
- Toda msg paga o Wait (latencia fixa)
- Race condition no ponto entre GET e DEL
- Se falhar antes do DEL, buffer fica poluido

### 8.3 Padrao B: Dois Workflows (Ingest + Process)

Fonte: @andresfrei/n8n-nodes-redis-debounce

**Workflow 1 (webhook):** Recebe msg → Acumula no Redis → Retorna 200
**Workflow 2 (schedule, a cada 5s):** Poll Redis → Janela expirou? → Processa batch

**Vantagens:**
- Webhook retorna IMEDIATAMENTE (sem Wait)
- Processamento desacoplado
- Sem race conditions entre execucoes

**Desvantagens:**
- Latencia minima = intervalo do schedule (ex: 5s de polling)
- 2 workflows para manter
- Poll consome recursos mesmo sem msgs

### 8.4 Padrao C: Concurrency Control do N8N

Fonte: docs.n8n.io/hosting/scaling/concurrency-control

`N8N_CONCURRENCY_PRODUCTION_LIMIT` — limita execucoes paralelas, mas eh GLOBAL (todos os workflows), nao por workflow.

**Nao resolve o debounce**, apenas evita overload do servidor.

### 8.5 Como Make (Integromat) Faz

O Make processa webhooks **sequencialmente por padrao**. Cada cenario que comeca com webhook enfileira as chamadas e processa uma por vez.

Isso eh efetivamente um debounce natural — nao tem concorrencia.

O N8N nao tem esse comportamento. Cada webhook gera execucao paralela.

---

## 9. Side Effects e Idempotencia

### O Problema Central

Debounce CANCELA execucoes redundantes. Mas se a execucao cancelada ja fez algo irreversivel (UPDATE no banco, PATCH na API, envio de email), o cancelamento eh tarde demais.

### Regra de Ouro

> **Side effects devem acontecer DEPOIS do gate de debounce, NUNCA antes.**

```
ERRADO:
  MSG → UPDATE banco → Check debounce → Descartar resposta
  (banco ja alterado, resposta perdida)

CORRETO:
  MSG → Check debounce → Se sou o ultimo → UPDATE banco → Resposta
  (nenhum side-effect antes da decisao)
```

### Idempotencia para Side Effects

Fonte: Martin Kleppmann, AWS Powertools, Google Cloud

Se o side-effect PODE acontecer mais de uma vez (retry, falha parcial), ele precisa ser **idempotente** — executar 2x deve ter o mesmo resultado que executar 1x.

**3 niveis de idempotencia:**

| Nivel | Tecnica | Exemplo |
|---|---|---|
| **Puro** | Operacao sem estado | `GET /api/events` |
| **Check-then-act** | Verifica se ja fez antes de fazer | `INSERT ... ON CONFLICT DO NOTHING` |
| **With result caching** | Armazena resultado, retorna cache em retry | AWS Lambda Powertools |

**Padrao robusto (Redis + Lua):**

```lua
-- KEYS[1] = idempotency:{action_id}
-- ARGV[1] = TTL
-- ARGV[2] = resultado (JSON) — preenchido APOS execucao

local status = redis.call('GET', KEYS[1])
if status == 'completed' then
    return redis.call('GET', KEYS[1] .. ':result')  -- Retorna resultado cacheado
end
if status == 'processing' then
    return 'WAIT'  -- Outra instancia esta processando
end

-- Primeira execucao: marcar como processing
redis.call('SET', KEYS[1], 'processing', 'EX', ARGV[1])
return 'PROCEED'
```

### Fencing Tokens (Kleppmann)

Para locks distribuidos, Kleppmann recomenda **fencing tokens**: cada aquisicao de lock recebe um numero monotonicamente crescente. O storage REJEITA escritas com token menor que o ultimo visto.

```
Client A adquire lock → token 33 → processa lentamente
Lock expira → Client B adquire → token 34 → processa rapido → escreve (token 34)
Client A tenta escrever → token 33 < 34 → REJEITADO
```

Sem fencing, Client A (com lock expirado) sobrescreveria o trabalho de Client B.

---

## 10. Anti-Patterns (O Que NAO Fazer)

### Anti-Pattern 1: Check-then-Act sem Atomicidade

```
ERRADO:
if (!redis.get(key)) {     // Leitura
    redis.set(key, value);  // Escrita
}
// TOCTOU: entre o GET e o SET, outra execucao pode ter setado
```

```
CORRETO:
redis.set(key, value, 'NX')  // Atomico
```

### Anti-Pattern 2: Debounce com Side-Effects Antes do Gate

Ja discutido na secao 9. Nunca execute acoes irreversiveis antes de decidir se esta execucao eh a "vencedora".

### Anti-Pattern 3: Lista Redis sem TTL

Se a lista de debounce nao tem TTL e o workflow falha antes do DELETE, a lista fica no Redis para sempre. A proxima mensagem do usuario vera lixo de sessoes anteriores.

**Sempre:** `EXPIRE {phone}:debounce:msgs 60` apos cada RPUSH.

### Anti-Pattern 4: Confiar em Timestamps para Ordering

Timestamps podem ter colisao (2 msgs no mesmo ms). Use INCR (contador monotonicamente crescente) como version counter. INCR eh atomico e nunca gera o mesmo valor duas vezes.

### Anti-Pattern 5: MULTI/EXEC para Logica com Branch

MULTI/EXEC nao permite condicoes dentro da transacao. Voce nao pode fazer "SE valor > X ENTAO faz Y". Use Lua scripts para logica condicional atomica.

### Anti-Pattern 6: Wait Fixo em Toda Mensagem

Um wait de 3-5s em TODA mensagem adiciona latencia desnecessaria para mensagens unicas (95%+ dos casos). Considere:
- Wait mais curto (1-2s)
- Processamento imediato com verificacao pos-facto
- Dois workflows (ingest imediato + process desacoplado)

### Anti-Pattern 7: Muitos Nodes para um Padrao Simples

Se o debounce precisa de 36 nodes, algo esta errado. O padrao fundamental eh:
1. Acumular (1 node Redis)
2. Versionar (1 node Redis ou Lua)
3. Esperar (1 node Wait)
4. Verificar + Processar (1 node Redis + 1 If)
5. Limpar (1 node Redis)

**6-8 nodes no maximo.** Se tem mais, esta duplicando logica.

### Anti-Pattern 8: Retries sem Idempotencia

Fonte: Google Cloud

> "Funcoes event-driven que podem ser retentadas DEVEM ser idempotentes."

Habilitar retry sem idempotencia gera loops infinitos que podem durar **dias** (Google Cloud) ou **7 dias** (WhatsApp).

### Anti-Pattern 9: Habilitar Retries para Erros Permanentes

Retries so fazem sentido para falhas **transientes** (timeout, rede fora). Para bugs (TypeError, null reference), retry nao vai resolver — so gasta recursos.

### Anti-Pattern 10: Descarte Silencioso

Se uma execucao eh descartada pelo debounce, NUNCA descarte silenciosamente apos side-effects. Ou:
- Descarte ANTES dos side-effects, ou
- Nao descarte — envie a resposta mesmo que outra execucao "ganhou"

---

## 11. Arquitetura de Referencia

### O Debounce Ideal para Chat (WhatsApp + IA)

Baseado em todas as fontes pesquisadas, o padrao mais robusto:

```
                         ┌──────────────────────────────────┐
                         │         REDIS                     │
                         │                                    │
                         │  {phone}:msgs    → Lista (RPUSH)  │
                         │  {phone}:version → Contador (INCR)│
                         │  {phone}:lock    → Lock (SET NX)  │
                         │                                    │
                         │  Tudo com TTL de 60s               │
                         └──────────────────────────────────┘
                                    ↑           ↓
┌─────────┐    ┌──────────┐   ┌────────────┐   ┌──────────────┐
│ WhatsApp │───→│ Webhook  │──→│  INGEST    │   │   PROCESS    │
│          │    │ (Main)   │   │            │   │              │
└─────────┘    └──────────┘   │ 1. Dedup   │   │ 5. Lock      │
                               │    (SET NX) │   │ 6. LRANGE    │
                               │ 2. RPUSH   │   │ 7. Classif.  │
                               │ 3. INCR    │   │ 8. Agent     │
                               │ 4. Wait Ns │   │ 9. Tool call │
                               │            │   │ 10. Resposta │
                               │ → Compare  │   │ 11. DEL      │
                               │   version  │   │              │
                               │   → WIN?   │   └──────────────┘
                               │     → PROC │
                               │   → LOSE?  │
                               │     → STOP │
                               └────────────┘

```

### Propriedades Desejadas

| Propriedade | Como garantir |
|---|---|
| **Zero perda de mensagens** | RPUSH com TTL (nunca perde, auto-limpa se falhar) |
| **Exatamente 1 execucao** | INCR + Compare + SET NX lock (tripla garantia) |
| **Sem side-effects pre-gate** | Toda logica de negocio APOS o "Sou o ultimo?" |
| **Latencia minima** | Wait proporcional ao caso de uso (2-3s para chat) |
| **Tolerancia a falha** | TTL em TUDO — se qualquer coisa falhar, auto-limpa |
| **Simplicidade** | Maximo 8 nodes, 1 Lua script |

### Comparacao com Sistemas Reais

| Sistema | Padrao de Dedup | Estado | Atomicidade |
|---|---|---|---|
| **AWS SQS FIFO** | MessageDeduplicationId, 5min | DynamoDB | Nativa |
| **Temporal.io** | Workflow ID | Persistence store | Nativa |
| **Google Cloud** | Event ID + Firestore | Firestore | Transacao |
| **Slack** | event_id + cache | In-memory/Redis | SET NX |
| **Twilio** | Event SID + header | Redis/DB | SET NX |
| **Make (Integromat)** | Sequential processing | Interno | N/A (sem concorrencia) |
| **Nosso ideal** | INCR version + SET NX lock | Redis | Lua script |

---

## 12. Fontes

### Documentacoes Oficiais

| Fonte | URL | Topico |
|---|---|---|
| MDN — Debounce | developer.mozilla.org/en-US/docs/Glossary/Debounce | Definicao precisa |
| MDN — Throttle | developer.mozilla.org/en-US/docs/Glossary/Throttle | Definicao precisa |
| MDN — Rate Limit | developer.mozilla.org/en-US/docs/Glossary/Rate_limit | Definicao precisa |
| Redis — Data Deduplication | redis.io/tutorials/data-deduplication-with-redis | SET NX, Sets, Bloom |
| Redis — Rate Limiting | redis.io/tutorials/howtos/ratelimiting | 5 algoritmos com Lua |
| Redis — Distributed Locks | redis.io/docs/latest/develop/clients/patterns/distributed-locks | SET NX + Lua release |
| Redis — Lua Scripting | redis.io/docs/latest/develop/programmability/eval-intro | Atomicidade |
| Redis — Streams Idempotency | redis.io/docs/latest/develop/data-types/streams/idempotency | XADD IDMP |
| AWS — SQS FIFO | docs.aws.amazon.com/.../FIFO-queues-exactly-once-processing.html | Dedup 5min |
| AWS — Lambda Idempotency | docs.aws.amazon.com/powertools/typescript/2.8.0/utilities/idempotency | State machine |
| Google Cloud — Retries | cloud.google.com/functions/docs/bestpractices/retries | 4 estrategias |
| Google — Pub/Sub Exactly-Once | cloud.google.com/pubsub/docs/exactly-once-delivery | Limitacoes |
| Anthropic — Rate Limits | platform.claude.com/docs/en/api/rate-limits | Token bucket |
| OpenAI — Rate Limits | developers.openai.com/cookbook/examples/how_to_handle_rate_limits | Backoff + jitter |
| Twilio — Event Delivery | twilio.com/docs/events/event-delivery-and-duplication | At-least-once |
| Slack — Events API | docs.slack.dev/apis/events-api | 3s timeout, retries |
| Discord — Rate Limits | docs.discord.com/developers/topics/rate-limits | Buckets, leaky bucket |
| Azure — Duplicate Detection | learn.microsoft.com/.../duplicate-detection | Service Bus, 10min default |
| Azure — Competing Consumers | learn.microsoft.com/.../competing-consumers | Idempotent handlers |
| N8N — Concurrency Control | docs.n8n.io/hosting/scaling/concurrency-control | Global limit |
| N8N — Wait Node | docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait | Timer resume |
| N8N — Remove Duplicates | docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.removeduplicates | In-execution dedup |

### Artigos e Blog Posts Tecnicos

| Fonte | URL/Referencia | Topico |
|---|---|---|
| Martin Kleppmann | martin.kleppmann.com — How to do Distributed Locking | Fencing tokens, Redlock critica |
| Inngest Blog | inngest.com/blog/debouncing-in-queuing-systems | PostgreSQL ON CONFLICT debounce |
| Hookdeck — WhatsApp Webhooks | hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks | Best practices |
| Hookdeck — Webhook Idempotency | hookdeck.com/webhooks/guides/implement-webhook-idempotency | 3 patterns |
| Hookdeck — Webhooks at Scale | hookdeck.com/blog/webhooks-at-scale | Queue-first architecture |
| Svix — Idempotency | svix.com/resources/webhook-university/reliability/idempotency-and-deduplication | Fetch-before-process |
| Temporal Blog | temporal.io/blog/idempotency-and-durable-execution | Workflow ID as key |
| Medium — WhatsApp Redis Dedup | medium.com/@nkangprecious26/handling-duplicate-webhooks-in-whatsapp-api-using-redis | SET NX pattern |
| Slack Duplicate Fix | startaitools.com/posts/debugging-slack-integration | 6 respostas → 1 |
| sgnt.ai | sgnt.ai/p/interruptible-llm-responses | Killable LLM + cancel token |
| N8N Community — Debounce | community.n8n.io/t/debounce-workflow-triggers/5919 | Original pattern (2021) |
| N8N Community — WhatsApp | community.n8n.io/t/whatsapp-debounce-flow...redis-n8n/225494 | Timestamp race |
| N8N Community — Idempotency | community.n8n.io/t/preventing-duplicate-webhook-executions...idempotency/275249 | SET NX gate |
| BullMQ | docs.bullmq.io/guide/jobs/deduplication | Queue-native debounce |
| npm — redis-debounce | npmjs.com/package/@andresfrei/n8n-nodes-redis-debounce | Community node |
| OneUptime | oneuptime.com/blog/post/2026-01-21-redis-request-deduplication | Status tracking |
| LINE Engineering | engineering.linecorp.com/en/blog/redis-lua-scripting-atomic-processing-cache | Lua atomico |
