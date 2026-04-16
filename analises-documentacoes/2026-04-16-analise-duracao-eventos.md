# Análise — Bug "duração travada" em Lembretes e Compromissos

**Data:** 2026-04-16
**Escopo:** Workflows N8N do Total Assistente (Premium + Standard + Lembretes + Calendar WebHooks)
**Modo:** STRICT READ-ONLY — nenhuma alteração feita em produção.
**Pastas auditadas:** `/home/totalAssistente/jsons/` (DEV) e `/home/totalAssistente/jsonsProd/` (PROD — confirmação).

---

## 1. Resumo executivo

Quando o usuário pede um evento com duração diferente do padrão ("reunião amanhã das 14h às 16h", "agendar treino de 1h30", "me lembra às 9h por 2 horas"), o sistema **ignora a duração informada** e grava sempre:

- **Compromisso pontual** → `fim = início + 30 min`
- **Lembrete pontual** → `fim = início + 15 min`
- **Lembrete recorrente** → `fim = início + 15 min` (hardcoded em JS)

A causa está distribuída em **3 prompts LLM + 1 node JS + 1 tool description**. Abaixo mapeio cada um, os riscos colaterais (incluindo um bug de **detecção de conflito de horário** que atualmente falha silenciosamente), e proponho correções em 4 camadas, ordenadas por risco.

---

## 2. Fluxos afetados — mapa completo

### 2.1. Cadeia de decisão

```
WhatsApp → Main → User Premium/Standard workflow
  → Text Classifier (categoria)
    ├─ criar_evento_agenda       → prompt_criar1       → AI Agent → Switch2 → HTTP-Create-Calendar-Tool   → webhook /5e0f5e77... (Calendar WebHooks)
    ├─ criar_lembrete_agenda     → prompt_lembrete     → AI Agent → Switch2 → tool criar_lembrete         → webhook /criar-lembrete-total (Lembretes)
    └─ criar_lembrete_recorrente → prompt_lembrete1    → AI Agent → Switch2 → HTTP-Create-Calendar-Tool3  → webhook /criar-lembrete-recorrente-total (Lembretes)
```

**Localização dos 3 prompts** (User Premium - Total(3).json):
- `prompt_criar1` — linha 1131
- `prompt_lembrete` — linha 1200
- `prompt_lembrete1` — linha 1554

No **User Standard** os prompts equivalentes de agenda NÃO existem como nodes isolados; só restam `prompt_criar_limite`, `prompt_editar_limite`, `prompt_excluir_limite` (financeiro) e `prompt_rel_*` (relatórios). Isso sugere que Standard usa apenas a **tool `criar_lembrete`** diretamente (linha 2402), cuja descrição `fromAI` para `fim_lembrete` diz textualmente:

> *"Coloque o fim do lembrete (15 minutos após o começo), formatado."*

Ou seja, no Standard a regra de 15 min é **forçada pela description da tool**, não por prompt.

### 2.2. Quem efetivamente grava `end`

| Webhook | Arquivo/node | Como calcula `end` |
|---|---|---|
| `/5e0f5e77-aea5-4784-8a85-58e8eaf49c30` (compromisso pontual) | Calendar WebHooks → `Edit Fields15` (linha 52) | `end = body.data_fim_evento` (passa direto, sem cálculo) |
| `/criar-lembrete-total` (lembrete pontual) | Lembretes → `Create an event1` (linha 108) | `end = body.fim_lembrete` (passa direto). Um node `Code` posterior (linha 1904) faz fallback: se `end` inválido ou `end ≤ start`, força `start + 15 min` |
| `/criar-lembrete-recorrente-total` (recorrente) | Lembretes → `Calcular end & Recurrence` (linha 1082) | **HARDCODED em JS:** `const end = addMinutes(dtstart, 15);` — o body nem tem campo de duração |

**Conclusão dos webhooks:** compromissos e lembretes pontuais **respeitam o body** — toda a responsabilidade está no prompt/tool. Só o recorrente tem barreira em JS.

---

## 3. Causa-raiz por local

### 3.1. `prompt_criar1` — compromisso pontual (User Premium, linha 1131)

Seção **DURAÇÃO DOS EVENTOS**:

```
• Compromissos normais → 30 minutos (padrão)
• Avisos / "me lembra" → 15 minutos (padrão)
Se o usuário informar início e fim → usar exatamente o informado
(e se for lembrete, aplicar +30 min em ambos no interno).
```

**Problema:** o prompt só reconhece o caso "início E fim explícitos". Não há regra para:
- "por X horas/minutos" ("reunião por 2h")
- "duração de X" ("call com duração de 45min")
- "das X às Y" (interpretável como intervalo, mas sem exemplo no prompt)
- "até Y" ("reunião hoje 14h até 16h")
- "manhã/tarde/dia todo" (block de 4h / 4h / 8h)

Todos esses casos caem no padrão 30 min, silenciosamente.

### 3.2. `prompt_lembrete` — lembrete pontual (User Premium, linha 1200)

Seções **2.1** e **2.2** contêm literalmente:

```
data_fim_lembrete = data_inicio_lembrete + 15 minutos.
```

Sem nenhuma condicional, sem exceção. O próprio schema da `tool` força o agente a sempre devolver `data_fim_lembrete = início + 15`.

### 3.3. `prompt_lembrete1` — recorrente (User Premium, linha 1554)

Schema da `tool`:

```json
{
  "nome_evento": "string",
  "rrule": "string",
  "dtstart": "string ISO 8601 -03:00",
  "timezone": "America/Sao_Paulo",
  "until": "string ou \"\"",
  "exdates": "string ou \"\"",
  "channel": "whatsapp"
}
```

**Não existe campo de duração/fim.** O agente não tem como informar duração mesmo se o usuário pedir.

### 3.4. Node `Calcular end & Recurrence` — Lembretes workflow (linha 1082)

Dentro do JS:

```javascript
// calcula end = dtstart + 15 min
const end = addMinutes(dtstart, 15);
```

**Hardcoded.** Mesmo que adicionássemos um campo duração no prompt + body, esse node sobrescreveria.

### 3.5. Tool `criar_lembrete` — fromAI description (User Premium linha 2894, User Standard linha 2385)

Em `bodyParameters[fim_lembrete].value`, a description que o LLM vê:

> *"Coloque o fim do lembrete (15 minutos após o começo), formatado."*

Isso é uma **segunda barreira** além do prompt: mesmo se o prompt mudasse, o `$fromAI` instrui o LLM a preencher o campo com +15min.

### 3.6. Nodes `Code` e `Code1` — Lembretes (linhas 1904 e 1917)

São safety-nets para casos de end inválido. Regra:

```javascript
if (!endParsed || endOk.getTime() <= startParsed.getTime()) {
  endIso = addMinutesISO(startIso, 15);
}
```

**Avaliação:** esse fallback É correto (end inválido deve virar algo). Mas o valor 15 é um chute — seria mais seguro usar um fallback diferenciado (compromisso=30, lembrete=15) OU receber do upstream.

---

## 4. Consumidores de `end_event` — impacto colateral

Busquei todos os pontos onde `end_event`/`fim_evento` é lido:

### 4.1. CRÍTICO — Detecção de conflito de horário (Calendar WebHooks, linha 2409)

```
filterString: user_id=eq.{userId}&start_event=lt.{newEnd}&end_event=gt.{newStart}
```

Esse é o filtro clássico de **overlap**: `start1 < end2 AND end1 > start2`. Mas como `end_event` está artificialmente curto no banco, o sistema **gera falso-negativo**:

**Exemplo concreto:**
- Usuário agenda "reunião das 14h às 16h" → banco grava `start=14:00, end=14:30` (artificial)
- Usuário agenda depois "call das 15h às 16h" → filtro busca `start < 16h AND end > 15h` → o primeiro evento não aparece (end=14:30 < 15h).
- **Sistema diz que não há conflito**, mas na realidade o usuário tem dupla marcação das 15h-16h.

Ou seja: **consertar a duração também conserta a detecção de conflito** — eles estão travados juntos. O bug atual é mais grave que "visual".

### 4.2. Google Calendar

O `end.dateTime` enviado ao Google é o `body.data_fim_evento` direto. Usuário que abre o Google Calendar vê eventos sempre 15/30 min.

**Impacto adicional:** se o usuário mover/estender o evento no próprio Google (arrastar a borda), o Supabase **não fica em sync** (não há webhook de volta do Google → Total). Mas isso é outro bug, fora do escopo.

### 4.3. Fluxo de edição — propagação do end curto

No Calendar WebHooks → `Edit Fields5` (linha 907):

```javascript
novo_fim: $('Editar eventos - webhook').item.json?.body?.novo_fim_evento
          || $json?.data?.[0]?.output?.[0]?.fim_evento
```

Se o usuário edita só o início ("muda para 16h"), `novo_fim` **herda o fim antigo**. Se o fim antigo já era artificial (start+30), ao mover o início para depois, pode gerar `novo_fim < novo_comeco` — estado inválido.

O `prompt_editar1` (linha 1177) tem uma seção "REGRA CENTRAL DE DURAÇÃO" que tenta preservar `D = original_fim − original_inicio` — mas `D` é sempre 30 min (do estado corrompido), então preservar 30 min não é útil.

### 4.4. Sistema de notificação "30 min antes" — NÃO depende do end

Lembretes → `Get Events (in 30 min)1` (linha 1580):

```
reminder=false AND remembered=false
AND start_event > $now
AND start_event < $now + 30min
```

**Usa apenas `start_event`.** Mudar a duração **não afeta** a notificação. Isso é bom — separa o risco.

**Observação importante (fora do escopo, mas relevante):** linha 1639 mostra `"disabled": true` no Schedule Trigger de 1 min. O `prompt_criar1` aplica uma "compensação +30min" alegando que "o sistema dispara aviso 30 min antes" — mas esse aviso está desativado. Isso significa que todos os lembretes pontuais criados hoje via `prompt_criar1` estão com `start_event` **30 min à frente** do horário pedido pelo usuário. Pode ser a causa real de reclamações de "o lembrete chegou atrasado" — mas precisa investigação própria.

### 4.5. Relatórios Mensais/Semanais — NÃO usam end

Grep no arquivo inteiro retornou zero ocorrências de `end_event`/`fim_evento`/`duracao`. Relatórios listam apenas `event_name` e `start_event`. **Seguro.**

### 4.6. Main workflow — NÃO usa end diretamente

Grep retornou zero ocorrências. **Seguro.**

---

## 5. Tabela consolidada — onde corrigir

| # | Local | Tipo | Risco | Obrigatório para fix? |
|---|---|---|---|---|
| 1 | `prompt_criar1` (compromisso pontual) | LLM instruction | Baixo | Sim |
| 2 | `prompt_lembrete` (lembrete pontual) | LLM instruction | Baixo | Sim |
| 3 | `prompt_lembrete1` (recorrente) | LLM schema + instruction | Baixo | Sim (parte 1 de 2) |
| 4 | Tool `criar_lembrete` → description `fim_lembrete` | `$fromAI` hint | Baixo | Sim |
| 5 | Node `Calcular end & Recurrence` | JS hardcoded | **Médio** | Sim (parte 2 de 2) |
| 6 | Nodes `Code` e `Code1` (fallback) | JS fallback | Baixo | Opcional (safety-net OK) |
| 7 | `prompt_editar1` + `Edit Fields5` (propagação no edit) | LLM + JS | Alto | Opcional (pós-fix) |

---

## 6. Riscos e efeitos colaterais

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Agente LLM passa a alucinar durações ("por 5 horas" quando usuário não pediu) | Média | Prompt com exemplos de "se NÃO houver duração → aplicar padrão" |
| Prompt pede duração no recorrente, mas webhook antigo não recebe → evento criado sem duração | Alta se deploy não for coordenado | Deploy prompt + JS na mesma janela |
| Evento com `data_fim_evento` sem offset `-03:00` quebra o parse no JS | Baixa | Reutilizar o parser `addMinutesISO` existente (já tolerante) |
| Edição antiga de eventos curtos propaga fim errado após fix | Média | Garantir que `prompt_editar1` recalcule `novo_fim` quando `D` atual < 30min e evento for compromisso |
| Detecção de conflito passa a funcionar → usuários recebem mais warnings | Baixa (positivo) | Documentar mudança no CHANGELOG |
| Recorrentes já existentes no banco têm `end_event = start+15min` — ficam "desatualizados" mas **não quebram** | Baixa | Opcional: migração one-off para recomputar `end` dos recorrentes cadastrados com duração diferente (mas se o usuário não reclamou até agora, não fazer) |

---

## 7. Correções propostas — 4 camadas

### Camada 1 — `prompt_criar1` (compromisso pontual)

**Onde:** User Premium → node `prompt_criar1` (linha ~1131)

**Seção a substituir:** Bloco "DURAÇÃO DOS EVENTOS"

**Nova versão do bloco (colar substituindo o atual):**

```
────────────────────────────────────────
DURAÇÃO DOS EVENTOS (ATUALIZADA)
────────────────────────────────────────

Ordem de prioridade para definir data_fim_evento:

(1) Se o usuário informar INÍCIO e FIM explícitos → usar exatamente
    Exemplos: "das 14h às 16h", "14h até 16h", "de 14 a 15h", "entre 9 e 11"
    data_inicio_evento = 14:00
    data_fim_evento    = 16:00

(2) Se o usuário informar APENAS DURAÇÃO → data_fim = data_inicio + duração
    Padrões reconhecidos (number parser):
    - "por X horas" / "por Xh" / "durante Xh"
    - "por X minutos" / "X min" / "X minutos"
    - "por Xh30" / "por 1h30min" / "1:30 de duração"
    - "duração de X" / "que dure X"
    - "X horas de reunião" / "reunião de X horas"

    Exemplos obrigatórios:
    "reunião amanhã 14h por 2 horas" → início 14:00, fim 16:00
    "call de 45 minutos amanhã 10h" → início 10:00, fim 10:45
    "treino hoje 7h por 1h30" → início 07:00, fim 08:30

(3) Se o usuário disser "até Y" SEM dizer início → usar início padrão e fim = Y
    Ex.: "reunião hoje até 16h" → início = HORA_AGORA arredondada para hora cheia (ou padrão 09:00 se for "amanhã até 16h"), fim 16:00

(4) Termos de período inteiro:
    "manhã toda" → 09:00 às 12:00
    "tarde toda" → 13:00 às 18:00
    "dia todo" / "o dia inteiro" → 09:00 às 18:00

(5) Se NÃO houver nenhuma informação de duração:
    • Compromissos normais → 30 minutos (padrão)
    • Avisos / "me lembra" → 15 minutos (padrão)

REGRA ANTI-INVENÇÃO:
Nunca invente duração. Se o usuário disser "reunião amanhã 14h" sem mais nada,
use 30 min. Não assuma 1 hora "porque parece reunião".

REGRA DE LEMBRETE (COMPENSAÇÃO +30 se aplicável, já descrita acima):
Para eventos de lembrete, a duração acima é aplicada DEPOIS do cálculo do
HORÁRIO_ALVO e da compensação +30 min. Ou seja:
   inicio_interno = HORARIO_ALVO + 30min
   fim_interno    = inicio_interno + DURACAO_EXTRAIDA (ou 15min default)
```

**Adicionar também exemplos no bloco "EXEMPLOS ANTI-ERRO":**

```
"reunião amanhã das 14h às 16h"
→ acao=criar_evento, data_inicio=amanhã 14:00, data_fim=amanhã 16:00

"call amanhã 10h por 45min"
→ acao=criar_evento, data_inicio=amanhã 10:00, data_fim=amanhã 10:45

"me lembra amanhã 9h por 2h de estudar inglês"
→ lembrete, HORARIO_ALVO=amanhã 09:00, inicio_interno=amanhã 09:30,
  fim_interno=amanhã 11:30 (09:30 + 2h)

"reunião sexta tarde toda"
→ acao=criar_evento, data_inicio=sexta 13:00, data_fim=sexta 18:00
```

### Camada 2 — `prompt_lembrete` (lembrete pontual)

**Onde:** User Premium → node `prompt_lembrete` (linha ~1200)

**Seção a substituir:** Os dois trechos `data_fim_lembrete = data_inicio_lembrete + 15 minutos` dentro de **2.1 Tempo RELATIVO** e **2.2 Data ABSOLUTA**.

**Novo texto para ambas as seções:**

```
- data_fim_lembrete = data_inicio_lembrete + DURACAO
  onde DURACAO é:
    * a duração explícita informada pelo usuário, se houver
      ("por 30min", "por 1h", "durante 2 horas", "de 1h de duração")
    * 15 minutos (padrão) se o usuário não informar
  Sempre com segundos e com "-03:00".
```

E adicionar novo bloco antes de "2.3":

```
2.X REGRA DE DURAÇÃO (ATUALIZADA)

Reconheça padrões de duração:
- "por X min" / "por X minutos" / "X min"
- "por X horas" / "por Xh" / "Xh de duração"
- "por 1h30" / "por 2h15min"
- "que dure X"
- "com duração de X"

Exemplos:
"me lembra em 10 min de beber água por 5min"
→ inicio = $now + 10min, fim = inicio + 5min

"me lembra amanhã 9h de tomar remédio por 30 min"
→ inicio = amanhã 9:00, fim = amanhã 9:30

"me lembra às 15h de ler"
→ inicio = hoje 15:00, fim = hoje 15:15 (padrão, usuário não deu duração)
```

### Camada 3 — `prompt_lembrete1` (recorrente)

**Onde:** User Premium → node `prompt_lembrete1` (linha ~1554)

**Mudança 3.a — Schema da tool:**

No bloco "CAMPO 'tool' (OBRIGATÓRIO...)", substituir o schema para:

```json
{
  "nome_evento": "string",
  "rrule": "string (RFC 5545)",
  "dtstart": "string ISO 8601 com -03:00",
  "duracao_minutos": 15,
  "timezone": "America/Sao_Paulo",
  "until": "string ou \"\"",
  "exdates": "string ou \"\"",
  "channel": "whatsapp"
}
```

**Mudança 3.b — Adicionar regra de duração (bloco novo):**

```
────────────────────────────────────────
DURAÇÃO (duracao_minutos) — NOVO
────────────────────────────────────────

Para cada evento recorrente:

(1) Se o usuário informar duração explícita → usar exatamente (em minutos)
    "toda segunda 14h por 2h" → duracao_minutos: 120
    "academia de segunda a sexta às 7h por 1h30" → duracao_minutos: 90

(2) Se NÃO informar duração:
    - Se a frase contém sinais de lembrete ("me lembre", "me avisa",
      "lembrete", "alerta") → duracao_minutos: 15
    - Caso contrário (compromisso recorrente) → duracao_minutos: 30

(3) Valor deve ser SEMPRE inteiro positivo ≥ 1.
```

**Mudança 3.c — Atualizar exemplo de saída:**

```json
{
  "acao": "evento_recorrente",
  "tool": {
    "nome_evento": "Dentista",
    "rrule": "FREQ=WEEKLY;BYDAY=MO;BYHOUR=14;BYMINUTE=0;BYSECOND=0",
    "dtstart": "2026-04-20T14:00:00-03:00",
    "duracao_minutos": 60,
    "timezone": "America/Sao_Paulo",
    "until": "",
    "exdates": "",
    "channel": "whatsapp"
  },
  "mensagem": "✅ Evento recorrente registrado!\n\n📅 Nome: Dentista\n🔁 Quando: Toda segunda às 14h"
}
```

### Camada 4 — Tool `criar_lembrete` (description do fim_lembrete)

**Onde:** User Premium node `criar_lembrete` (linha ~2893) E User Standard node `criar_lembrete` (linha ~2385).

**Trocar a description:**

De:
```
Coloque o fim do lembrete (15 minutos após o começo), formatado.
```

Para:
```
Coloque o fim do lembrete. Se o usuário informou duração explícita
("por X min", "por Xh", "duração de X"), use inicio + essa duração.
Senão, use inicio + 15 minutos. Formato ISO 8601 com -03:00.
```

### Camada 5 — Node `Calcular end & Recurrence` (JS, Lembretes workflow)

**Onde:** Lembretes Total Assistente → node `Calcular end & Recurrence` (linha ~1082)

**Mudança 5.a — Ler campo do body:** no nó `Extrair Campos` (linha ~1015) adicionar:

```javascript
{
  "id": "a9",
  "name": "duracao_minutos",
  "value": "={{ $json.body.duracao_minutos || 15 }}",
  "type": "number"
}
```

**Mudança 5.b — Atualizar JS:** no node `Calcular end & Recurrence`, substituir:

```javascript
// calcula end = dtstart + 15 min
const end = addMinutes(dtstart, 15);
```

Por:

```javascript
// calcula end = dtstart + duracao_minutos (fallback 15)
const duracao = Number(inp.duracao_minutos) > 0 ? Number(inp.duracao_minutos) : 15;
const end = addMinutes(dtstart, duracao);
```

**Mudança 5.c — HTTP do webhook no User Premium:** no node `HTTP - Create Calendar Tool3` (linha ~4134), adicionar no `bodyParameters`:

```json
{
  "name": "duracao_minutos",
  "value": "={{ $('Code in JavaScript').item.json.tool.duracao_minutos || 15 }}"
}
```

### Camada 6 (opcional) — Nodes `Code` e `Code1` (Lembretes)

Fallback atual `addMinutesISO(startIso, 15)` é safety-net, não é a causa raiz. Pode deixar como está para evitar mexer em área estável. **Recomendação:** NÃO alterar nesta rodada.

### Camada 7 (opcional, pós-fix) — Edição

`prompt_editar1` já tem regra "preservar D" — mas com eventos antigos corrompidos, D = 30min sempre. Duas opções:

- **Opção A (conservador):** deixar como está. Eventos antigos continuam com 30 min; novos ficam corretos; edições de evento antigo reaproveitam 30 min (igual hoje).
- **Opção B (limpeza retroativa):** SQL one-off para recomputar `end_event` onde houver pistas na `desc_event` (ex.: "Lembrete para: ..."). Alto risco, recomendo NÃO fazer salvo reclamação explícita.

---

## 8. Plano de deploy seguro

### Ordem recomendada (DEV → PROD)

1. **Preparar em DEV (usuário de teste: Luiz Felipe):**
   - Aplicar camadas 1, 2, 3, 4 (só prompts + tool description)
   - Testar em DEV com mensagens:
     - "reunião amanhã 14h às 16h"
     - "call amanhã 10h por 45min"
     - "me lembra em 5 min de beber água por 10min"
     - "toda segunda 14h por 1h30 dentista"
     - Casos sem duração (deve cair no padrão)
   - Conferir na Supabase dev se `data_fim_evento` está correto

2. **Aplicar camada 5 em DEV (webhook recorrente):**
   - Editar `Extrair Campos` + `Calcular end & Recurrence` + `HTTP - Create Calendar Tool3`
   - Testar recorrente com duração

3. **Validar detecção de conflito:**
   - Criar dois eventos sobrepostos → confirmar que sistema dispara aviso de conflito

4. **Deploy PROD em janela única:**
   - Prompts/tool description podem ir primeiro (compatíveis com webhook antigo — `duracao_minutos` novo campo é ignorado se backend não souber)
   - MAS para recorrente é necessário coordenar: se só prompt subir sem backend, nada muda (backend ignora campo); se só backend subir sem prompt, campo vem undefined e cai no fallback 15 (igual hoje). Portanto **ordem: backend primeiro, prompt depois** para recorrente.

5. **Monitoramento pós-deploy:**
   - Squad `auditor-real` em modo `*auditar` após 24h — verificar se `end_event` no banco tem variedade de durações
   - Verificar se nenhum evento caiu com `end < start`

### Rollback

Cada camada é isolada e reversível:
- Prompts → basta colar a versão anterior
- JS → idem (guardar string antes de editar)
- Tool description → idem

---

## 9. Plano de teste — casos obrigatórios

### Compromissos pontuais (prompt_criar1)

| Input | Esperado (data_inicio, data_fim) |
|---|---|
| "reunião amanhã 14h" | 14:00, 14:30 (padrão 30min) |
| "reunião amanhã 14h até 16h" | 14:00, 16:00 |
| "call amanhã 10h por 45min" | 10:00, 10:45 |
| "treino hoje 7h por 1h30" | 07:00, 08:30 |
| "reunião sexta tarde toda" | sexta 13:00, sexta 18:00 |
| "almoço amanhã entre 12 e 14" | 12:00, 14:00 |

### Lembretes pontuais (prompt_lembrete)

| Input | Esperado |
|---|---|
| "me lembra em 10 min de beber água" | inicio=$now+10min, fim=inicio+15 |
| "me lembra em 5 min por 30 minutos de alongar" | inicio=$now+5min, fim=inicio+30 |
| "me lembra amanhã 9h de tomar remédio" | inicio=amanhã 09:00, fim=inicio+15 |

### Recorrentes (prompt_lembrete1)

| Input | Esperado (duracao_minutos) |
|---|---|
| "toda segunda 14h dentista" | 30 (compromisso padrão) |
| "toda segunda 14h por 2h dentista" | 120 |
| "me lembra todo dia 7h de tomar remédio" | 15 (lembrete padrão) |
| "academia de segunda a sexta 7h por 1h30" | 90 |

### Anti-regressão

- Evento sem duração informada continua caindo em 30/15 min (não quebra comportamento atual)
- Notificação "30 min antes" continua funcionando se for reativada
- Relatórios continuam funcionando
- Edição de evento existente continua funcionando

### Teste de conflito

1. Criar "reunião 14h às 16h" em `day A`
2. Tentar criar "call 15h às 15:30" em `day A`
3. Esperado: sistema dispara aviso "⚠️ Você possui compromissos que coincidem com esse horário"
4. (Antes do fix isso não acontecia — o banco dizia end=14:30)

---

## 10. O que NÃO foi alterado / próximos passos

1. **Compensação +30 min para lembretes** (seção do prompt_criar1) — o comentário diz que é para compensar "aviso 30 min antes", mas esse aviso está DESATIVADO atualmente (Schedule Trigger linha 1639 `"disabled": true`). Vale auditoria própria — **fora do escopo deste doc**.
2. **Propagação do end na edição** — deixa como está por enquanto; priorizar se surgir reclamação pós-fix.
3. **Sync reverso Google → Supabase** — usuário arrastar borda no Google não atualiza o banco. Bug conhecido, fora do escopo.
4. **Migração retroativa de eventos antigos** — não recomendo, sem demanda.

---

## 11. Anexos — trechos exatos a alterar (para colar no N8N)

### Anexo A — Prompts novos (versões completas prontas para colar)

Se o deploy for confirmado, posso gerar em seguida:
- `prompt_criar1_v2.txt`
- `prompt_lembrete_v2.txt`
- `prompt_lembrete1_v2.txt`

com os prompts INTEIROS reescritos (não só o diff), cada um em `.txt` plano, pronto para colar no node.

### Anexo B — JSONs colaveis (meta + nodes + connections)

Para os nodes `Calcular end & Recurrence`, `Extrair Campos` e `HTTP - Create Calendar Tool3`, também posso gerar o JSON completo de cada node no formato que o N8N aceita em "Import from Clipboard".

---

## 12. Checklist final de revisão

- [x] Mapeados 3 prompts + 1 tool description + 1 node JS onde duração é travada
- [x] Mapeados todos os consumidores de `end_event` — identificado bug crítico de conflito
- [x] Confirmado que PROD tem os mesmos padrões (jsonsProd vs jsons)
- [x] Confirmado que notificação 30min e Relatórios NÃO dependem de `end_event` — seguro alterar
- [x] Proposta correção em 4 camadas, isolada e reversível
- [x] Plano de deploy DEV→PROD com ordem coordenada
- [x] Plano de teste com casos de regressão + conflito

**Status:** Análise concluída. Aguardando aprovação para:
1. Gerar os 3 prompts completos reescritos (Anexo A)
2. Gerar JSON colavel do node JS corrigido (Anexo B)
3. Subir este doc para o repositório `testing-system-total` no GitHub
