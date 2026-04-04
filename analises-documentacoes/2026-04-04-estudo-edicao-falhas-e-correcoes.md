# Estudo Completo: Sistema de Edição — Falhas e Plano de Correção

**Data:** 2026-04-04
**Escopo:** APENAS edição (agenda + gastos). Classificador, exclusão e debounce estão com outros devs.
**Metodologia:** BBBK (garantia → excelência) + Swiss Cheese (defesas em camada) + TEM (evitar → capturar → mitigar)

---

## 1. Como a Edição Funciona Hoje

### 1.1 Fluxo Completo — Edição de Agenda

```
Usuário: "muda a reunião de amanhã pras 16h"
    ↓
[CLASSIFICADOR] → branch: editar_evento_agenda (outros devs cuidam)
    ↓
[DEBOUNCE] → mensagem final extraída (outros devs cuidam)
    ↓
[AI AGENT — Premium]
    │  Recebe prompt_editar1 (Set node)
    │  Regra: "NUNCA peça confirmação. Interprete e aja."
    │  Deve montar 9 campos (4 busca + 4 edição + user_id)
    │  Deve calcular duração se só início fornecido
    │  Chama tool: editar_eventos (HTTP POST)
    ↓
[CALENDAR WEBHOOKS — Sub-workflow]
    │
    ├─ Webhook (path: editar-eventos) → recebe 9 campos
    ├─ Edit Fields3 → extrai: nome, descricao, start_event, end_event, user_id
    ├─ Code → normaliza datas para UTC, monta queryString PostgREST
    ├─ Get many rows → busca eventos com sobreposição temporal + user_id
    ├─ Information Extractor (GPT-4.1-mini) → filtra por similaridade ≥ 0.90
    ├─ Switch (3 saídas):
    │   ├─ Output 0: length > 1 → ⛔ SEM CONEXÃO (dead end)
    │   ├─ Output 1: length === 1 → ✅ continua
    │   └─ Output 2: length < 1 → ⛔ SEM CONEXÃO (dead end)
    ├─ Edit Fields5 → monta campos com fallback ||:
    │   novo_nome = body.novo_nome_evento || evento_encontrado.nome
    │   novo_fim  = body.novo_fim_evento  || evento_encontrado.fim_evento
    ├─ Code3 → filtra null/undefined (NÃO filtra string vazia "")
    ├─ Update a row1 → UPDATE calendar SET event_name, desc_event, start_event, end_event
    ├─ Google Calendar sync (se conectado)
    └─ Resposta: {"sucesso": "edição feito com sucesso"}
```

### 1.2 Fluxo Completo — Edição de Gastos

```
Usuário: "muda o gasto do uber pra 30 reais"
    ↓
[CLASSIFICADOR] → branch: editar (outros devs cuidam)
    ↓
[DEBOUNCE] → mensagem final extraída (outros devs cuidam)
    ↓
[AI AGENT — Premium]
    │  Recebe editar_gasto (Set node)
    │  Regra: "NUNCA peça confirmação. Interprete e aja."
    │  OBRIGATÓRIO: buscar_registro PRIMEIRO, depois editar_registros
    │  Chama tool: editar_financeiro (HTTP POST)
    ↓
[FINANCEIRO — Sub-workflow]
    │
    ├─ Webhook (path: editar-supabase) → recebe 8 campos
    ├─ Get a row4 → busca gasto por id_spent APENAS (sem filtro user_id)
    ├─ Get a row14 → busca perfil do usuário
    ├─ If4 → verifica propriedade: profile.id == gasto.fk_user
    │   └─ FALSE → ⛔ SEM CONEXÃO (dead end silencioso)
    ├─ Update a row → UPDATE spent SET 6 campos DIRETAMENTE do body:
    │   name_spent     = body.novo_nome       ← pode ser ""
    │   value_spent    = body.novo_valor       ← pode ser ""
    │   date_spent     = body.nova_data        ← pode ser ""
    │   category_spent = body.nova_categoria   ← pode ser ""
    │   type_spent     = body.novo_tipo        ← pode ser ""
    │   transaction_type = body.entra_sai      ← pode ser ""
    ├─ Redis2 → cache do resultado (TTL 900s)
    └─ Edit Fields30 → retorna APENAS: {"sucesso": "sucesso"}
```

---

## 2. Pontos Fracos — Apenas Edição

> Filtrado: removidos PF-C1/C2/C3 (classificador), PF-D1/D2/D3 (debounce), pontos de exclusão.

### Camada: AI Agent

| ID | Ponto Fraco | Severidade | Domínio |
|----|-------------|------------|---------|
| **PF-A3** | Agent confunde campos de busca vs edição (nomes similares) | ALTO | Agenda |
| **PF-A4** | Agent confirma "Prontinho" ANTES de verificar resultado da tool | CRÍTICO | Ambos |
| **PF-A5** | Regra de preservação de duração depende 100% do LLM | CRÍTICO | Agenda |
| **PF-A6** | Financeiro retorna apenas {"sucesso":"sucesso"} — Agent não sabe o que foi salvo | ALTO | Gastos |

### Camada: Calendar WebHooks (sub-workflow agenda)

| ID | Ponto Fraco | Severidade | Domínio |
|----|-------------|------------|---------|
| **PF-CW1** | Switch outputs 0 e 2 são dead ends — webhook trava sem resposta | ALTO | Agenda |
| **PF-CW2** | Edit Fields5: operador `\|\|` trata "" como falsy → puxa fim de OUTRO evento/data | CRÍTICO | Agenda |
| **PF-CW3** | Code3 não filtra string vazia "" — passa direto pro UPDATE | MÉDIO | Agenda |
| **PF-CW5** | Sem validação: start_event < end_event antes do UPDATE | MÉDIO | Agenda |

### Camada: Financeiro (sub-workflow gastos)

| ID | Ponto Fraco | Severidade | Domínio |
|----|-------------|------------|---------|
| **PF-F1** | UPDATE envia TODOS os 6 campos sem fallback — campo vazio DESTRÓI dado existente | CRÍTICO | Gastos |
| **PF-F2** | Get a row4 busca por id_spent sem filtro de user_id (validação só no If4) | MÉDIO | Gastos |
| **PF-F3** | If4 FALSE é dead end silencioso — sem resposta de erro | MÉDIO | Gastos |

### Camada: Cross-cutting

| ID | Ponto Fraco | Severidade | Domínio |
|----|-------------|------------|---------|
| **PF-X1** | NENHUM fluxo de edição tem validação pós-tool | CRÍTICO | Ambos |
| **PF-X2** | Supabase atualizado ANTES de verificar Google Calendar (sem rollback) | ALTO | Agenda |

**Total: 13 pontos fracos de edição**
- 5 CRÍTICOS: PF-A4, PF-A5, PF-CW2, PF-F1, PF-X1
- 4 ALTOS: PF-A3, PF-A6, PF-CW1, PF-X2
- 4 MÉDIOS: PF-CW3, PF-CW5, PF-F2, PF-F3

---

## 3. Cenários de Falha Real

### Cenário 1 — Corrupção de data (PF-CW2 + PF-A5)

```
Usuário: "passa a reunião de amanhã pras 16h"

O que acontece:
1. Agent monta: novo_inicio="amanhã 16:00:00-03", novo_fim="" (não calculou duração)
2. Edit Fields5: novo_fim = "" || fim_original = "amanhã 15:30:00-03"
   → Se evento original era 15:00-15:30, novo_fim = 15:30
   → start=16:00 > end=15:30 ❌
3. Supabase salva: start=16:00, end=15:30 (inválido)
4. Google rejeita: "time range is empty"
5. Agent já disse: "Prontinho!" ❌

Pior caso (mudança de dia):
- Original: 04/04 15:00 - 04/04 15:30
- Novo: 10/04 14:00
- Edit Fields5: novo_fim = "" || "04/04 15:30" = "04/04 15:30"
- Resultado: start=10/04, end=04/04 → fim 6 DIAS antes do início
```

### Cenário 2 — Destruição de campos (PF-F1)

```
Usuário: "muda o gasto do uber pra 30 reais"

O que acontece:
1. Agent busca: encontra gasto "Uber" id=abc, valor=27.90, data=03/04, cat=transporte
2. Agent edita: id_gasto="abc", novo_valor="30", novo_nome="", nova_data="", 
   nova_categoria="", novo_tipo="", entra_sai=""
3. Sub-workflow: UPDATE spent SET
   name_spent = ""          ← nome DESTRUÍDO
   value_spent = "30"       ← OK
   date_spent = ""          ← data DESTRUÍDA
   category_spent = ""      ← categoria DESTRUÍDA
   type_spent = ""          ← tipo DESTRUÍDO
   transaction_type = ""    ← tipo transação DESTRUÍDO
4. Agent: "Editado! Valor: R$30,00" ← parece OK
5. Banco: 5 dos 6 campos foram apagados silenciosamente
```

### Cenário 3 — Evento não encontrado, dead end (PF-CW1)

```
Usuário: "muda a aula de yoga pra 18h"

O que acontece:
1. Agent chama editar_eventos com nome="aula de yoga"
2. Calendar WH: busca → 0 resultados
3. Switch output 2 (length < 1) → SEM CONEXÃO
4. Webhook fica pendurado → timeout
5. Agent já montou resposta: "Prontinho, atualizei!"
6. Usuário acha que funcionou. Nada aconteceu.
```

### Cenário 4 — Múltiplos eventos, dead end (PF-CW1)

```
Usuário: "muda a reunião de amanhã pras 14h"
(Tem 2 reuniões amanhã: "Reunião equipe" e "Reunião cliente")

O que acontece:
1. Calendar WH: busca → 2 resultados, ambos com score ≥ 0.90
2. Switch output 0 (length > 1) → SEM CONEXÃO
3. Webhook trava → timeout
4. Agent: "Prontinho!" (sem saber que travou)
```

### Cenário 5 — Sucesso (quando tudo dá certo)

```
Usuário: "passa a reunião de amanhã de 10h pra 14h"

O que acontece:
1. Agent monta TODOS os campos corretamente:
   nome_evento="reunião", data_inicio="amanhã 00:00-03", data_fim="amanhã 23:59-03"
   novo_inicio="amanhã 14:00:00-03", novo_fim="amanhã 14:30:00-03" (duração calculada)
2. Calendar WH: busca → 1 resultado exato
3. Edit Fields5: todos campos preenchidos, || não ativa fallback
4. UPDATE Supabase: start=14:00, end=14:30 ✅
5. Google PATCH: start=14:00, end=14:30 ✅
6. Agent: "Prontinho! Reunião → 14:00-14:30" ✅

Conclusão: funciona APENAS quando o LLM acerta 100% dos campos.
```

---

## 4. Análise de Raiz — Por Que Edição é Frágil

### 4.1 Comparação: Criação vs Edição

| Aspecto | Criação | Edição |
|---------|---------|--------|
| Campos enviados | Todos obrigatórios | Mix de busca + edição |
| Fallback para campo vazio | N/A (todos preenchidos) | ❌ Nenhum (financeiro) ou || bugado (agenda) |
| Validação pós-tool | ✅ Agent vê dados criados | ❌ Agent não vê dados salvos |
| Resposta do sub-workflow | Dados completos do registro | {"sucesso":"sucesso"} |
| Dead ends | Nenhum | 3 (Switch 0, Switch 2, If4 false) |
| Defesas backend | Information Extractor + validação | Zero |
| Taxa de acerto estimada | ~95%+ | ~60-70% |

### 4.2 O Problema Fundamental (visão BBBK)

> **BBBK:** "Se você não pode garantir, não prometa."

O sistema hoje **promete** que editou ("Prontinho!") sem **nenhuma garantia** de que:
- O evento/gasto certo foi encontrado
- Os campos corretos foram atualizados
- Campos não-editados foram preservados
- O resultado final é consistente (start < end)

**Princípio BBBK invertido:** O sistema promete primeiro e tenta cumprir depois — exatamente o oposto do que deveria.

### 4.3 Modelo Swiss Cheese — Onde Estão os Buracos

```
Camada 1: Classificador     → [outros devs]
Camada 2: Debounce           → [outros devs]
Camada 3: AI Agent           → 🕳️ 4 buracos (PF-A3, A4, A5, A6)
Camada 4: Sub-workflow       → 🕳️ 4 buracos agenda (PF-CW1, CW2, CW3, CW5)
                              → 🕳️ 3 buracos gastos (PF-F1, F2, F3)
Camada 5: Validação pós-tool → 🕳️ CAMADA INTEIRA AUSENTE (PF-X1)
Camada 6: Sync externo       → 🕳️ 1 buraco (PF-X2)
```

**Quando os buracos se alinham** (cenários 1-4 acima), o erro passa direto do Agent até o banco de dados sem nenhuma defesa interceptar.

---

## 5. Plano de Correção — Filosofia BBBK + Aviação

### Princípio Central

> **"Desenhe de trás pra frente: comece pela garantia ao usuário, depois construa as defesas que sustentam essa garantia."**

**Garantia ao usuário:** "Se eu confirmo que editei, os dados corretos foram salvos e verificados."

Para sustentar essa garantia, precisamos de defesas **backend** (não depender do LLM).

### 5.1 Correções por Prioridade

#### PRIORIDADE 1 — CRÍTICOS (devem ser corrigidos primeiro)

---

**PF-F1 — Financeiro: UPDATE destrói campos vazios**

**Problema:** Update envia todos 6 campos direto do body. Campo vazio = dado apagado.

**Correção (backend):** Adicionar camada de merge ANTES do Update a row.

```
Novo node: "Merge Fields" (Code node) entre If4 e Update a row

Lógica:
- Para cada campo, se body.novo_X é "" ou null → usar valor original do Get a row4
- Só atualizar campos que realmente mudaram

Pseudocódigo:
const original = $('Get a row4').item.json;
const body = $('entrada1').item.json.body;

return {
  name_spent:       body.novo_nome     || original.name_spent,
  value_spent:      body.novo_valor    || original.value_spent,
  date_spent:       body.nova_data     || original.date_spent,
  category_spent:   body.nova_categoria || original.category_spent,
  type_spent:       body.novo_tipo     || original.type_spent,
  transaction_type: body.entra_sai     || original.transaction_type
};
```

**Validação:** Testar com edição parcial (só valor) — verificar que outros campos permanecem intactos.

---

**PF-CW2 — Agenda: operador || com string vazia causa corrupção de data**

**Problema:** `novo_fim = body.novo_fim_evento || evento.fim_evento` — string vazia ativa fallback para fim do evento ERRADO (pode ser de outra data).

**Correção (backend):** Substituir || por verificação explícita + lógica de duração no backend.

```
Novo node: "Smart Merge" (Code node) substituindo Edit Fields5

Lógica:
const body = $('Editar eventos - webhook').item.json.body;
const original = $json.data[0].output[0];

// Verificação explícita: "" é intencional (não mudar) vs valor novo
const novoInicio = body.novo_inicio_evento !== "" ? body.novo_inicio_evento : null;
const novoFim = body.novo_fim_evento !== "" ? body.novo_fim_evento : null;

// Se mudou início mas não fim: preservar duração
if (novoInicio && !novoFim) {
  const duracao = new Date(original.fim_evento) - new Date(original.inicio_evento);
  const fimCalculado = new Date(new Date(novoInicio).getTime() + duracao);
  return {
    novo_comeco: novoInicio,
    novo_fim: fimCalculado.toISOString(),
    // ... outros campos
  };
}

// Se mudou fim mas não início: manter início original
if (!novoInicio && novoFim) {
  return {
    novo_comeco: original.inicio_evento,
    novo_fim: novoFim,
    // ...
  };
}

// Se mudou ambos: usar ambos
// Se não mudou nenhum: usar originais
```

**Bônus:** Isso resolve PF-A5 também (duração no backend, não no LLM).

---

**PF-CW5 — Agenda: sem validação start < end**

**Correção (backend):** Adicionar validação no mesmo "Smart Merge" node:

```
// Após calcular novo_comeco e novo_fim:
if (new Date(novo_comeco) >= new Date(novo_fim)) {
  // Fallback: adiciona 30 minutos ao início
  novo_fim = new Date(new Date(novo_comeco).getTime() + 30 * 60 * 1000).toISOString();
}
```

---

**PF-X1 — Nenhum fluxo tem validação pós-tool**

**Problema:** Agent confirma sem saber se UPDATE funcionou.

**Correção (backend — ambos sub-workflows):**

Financeiro — Alterar resposta do sub-workflow:
```
Substituir Edit Fields30 ({"sucesso":"sucesso"}) por:

Novo node: "Resposta Detalhada" (Set node)
{
  "sucesso": true,
  "registro_atualizado": {
    "id": {{ $('Update a row').item.json.id_spent }},
    "nome": {{ $('Update a row').item.json.name_spent }},
    "valor": {{ $('Update a row').item.json.value_spent }},
    "data": {{ $('Update a row').item.json.date_spent }},
    "categoria": {{ $('Update a row').item.json.category_spent }}
  }
}
```

Agenda — Já retorna dados, mas Agent não valida. Adicionar instrução no prompt:
```
Após chamar editar_eventos, VERIFIQUE a resposta:
- Se "sucesso" → confirme com dados reais retornados
- Se timeout ou erro → informe: "Não consegui confirmar a edição. Tente novamente."
- NUNCA diga "Prontinho" sem ver "sucesso" na resposta
```

---

**PF-A4 — Agent confirma antes de verificar**

**Problema:** Agent gera "Prontinho" durante a chamada da tool, antes do resultado.

**Correção (prompt):** Adicionar no prompt_editar1 e editar_gasto:

```
## Regra de Confirmação (OBRIGATÓRIA)

1. Chame a tool de edição
2. ESPERE a resposta da tool
3. ANALISE a resposta:
   - Contém "sucesso" → confirme com dados retornados
   - Contém erro ou timeout → informe o erro ao usuário
   - Sem resposta → "Não consegui confirmar. Pode verificar?"
4. NUNCA monte a mensagem de confirmação ANTES de ter a resposta
```

---

#### PRIORIDADE 2 — ALTOS

---

**PF-CW1 — Dead ends nos outputs 0 e 2 do Switch**

**Problema:** Quando 0 ou >1 eventos encontrados, webhook trava sem resposta.

**Correção (backend):**

```
Output 0 (múltiplos): Conectar a novo node "Resposta Múltiplos"
{
  "erro": "multiplos_resultados",
  "quantidade": {{ $json.data.length }},
  "eventos": {{ JSON.stringify($json.data.map(e => ({
    nome: e.output[0].nome,
    inicio: e.output[0].inicio_pretty,
    fim: e.output[0].fim_pretty
  }))) }}
}

Output 2 (nenhum): Conectar a novo node "Resposta Nenhum"
{
  "erro": "nenhum_resultado",
  "mensagem": "Nenhum evento encontrado com esses critérios"
}
```

**No Agent:** Tratar essas respostas:
```
Se resposta contém "multiplos_resultados":
  → Listar eventos e perguntar qual editar
Se resposta contém "nenhum_resultado":
  → Informar que não encontrou e pedir mais detalhes
```

---

**PF-A3 — Agent confunde campos de busca vs edição**

**Problema:** Nomes similares (data_inicio_evento vs novo_inicio_evento) causam confusão.

**Correção (prompt):** Adicionar tabela explícita no prompt_editar1:

```
## Campos da Tool editar_eventos — REFERÊNCIA RÁPIDA

BUSCA (encontrar o evento):          EDIÇÃO (novos valores):
├─ nome_evento                       ├─ novo_nome_evento
├─ descricao_evento                  ├─ novo_desc_evento
├─ data_inicio_evento (range busca)  ├─ novo_inicio_evento (novo horário)
└─ data_fim_evento (range busca)     └─ novo_fim_evento (novo horário)

REGRA: data_inicio/fim = RANGE de busca (dia inteiro). novo_inicio/fim = HORÁRIO NOVO.
Exemplo: "muda reunião de amanhã pras 16h"
  data_inicio_evento = "2026-04-05 00:00:00-03"  ← range do dia
  data_fim_evento    = "2026-04-05 23:59:59-03"  ← range do dia
  novo_inicio_evento = "2026-04-05 16:00:00-03"  ← horário novo
  novo_fim_evento    = "2026-04-05 16:30:00-03"  ← horário novo
```

---

**PF-A6 — Financeiro retorna só {"sucesso":"sucesso"}**

**Correção:** Já coberto em PF-X1 (resposta detalhada do sub-workflow).

---

**PF-X2 — Supabase atualizado antes de verificar Google**

**Correção (backend):** Inverter ordem ou adicionar validação:

```
Opção A (simples): Validar start < end ANTES do UPDATE (já coberto em PF-CW5)
Opção B (ideal): Tentar Google primeiro, se sucesso → UPDATE Supabase
Opção C (pragmática): Se Google falhar, fazer rollback no Supabase com dados originais
```

**Recomendação:** Opção A resolve 90% dos casos. Google só rejeita quando start ≥ end, e isso é prevenido pela validação.

---

#### PRIORIDADE 3 — MÉDIOS

---

**PF-CW3 — Code3 não filtra string vazia**

**Correção:** Já resolvido pelo "Smart Merge" (PF-CW2) que trata "" como "não fornecido".

---

**PF-F2 — Get a row4 busca sem user_id**

**Correção:** Adicionar filtro de user_id na busca inicial:

```
Get a row4: filtro adicional
  fk_user = eq.{{ body.id_user }}
```

Isso é defesa em profundidade — If4 já valida, mas buscar com escopo reduzido é mais seguro.

---

**PF-F3 — If4 FALSE sem resposta**

**Correção:** Conectar output FALSE do If4 a node de resposta:

```
{
  "erro": "sem_permissao",
  "mensagem": "Registro não pertence a este usuário"
}
```

---

## 6. Mapa de Dependências das Correções

```
PF-CW2 (Smart Merge)
  └─ resolve também: PF-A5 (duração), PF-CW3 (string vazia), PF-CW5 (start<end)

PF-F1 (Merge Fields financeiro)
  └─ resolve também: PF-F3 parcialmente (campo vazio não destrói)

PF-X1 (Resposta detalhada)
  └─ resolve também: PF-A6 (Agent vê dados salvos), PF-A4 parcialmente

PF-CW1 (Dead ends)
  └─ independente — sem dependências

PF-A3 (Prompt campos)
  └─ independente — sem dependências

PF-A4 (Regra confirmação)
  └─ depende de PF-X1 (precisa ter dados na resposta para validar)
```

**Ordem de implementação recomendada:**
1. PF-CW2 → Smart Merge (resolve 4 pontos de uma vez)
2. PF-F1 → Merge Fields financeiro (resolve destruição de campos)
3. PF-X1 → Resposta detalhada ambos workflows
4. PF-CW1 → Dead ends (resolve travamento)
5. PF-A4 + PF-A3 → Prompts (polimento final)
6. PF-F2 + PF-F3 → Defesa em profundidade

---

## 7. Validação Pós-Correção — Checklist Aviação

### Pre-flight (antes de implementar)

- [ ] Backup dos workflows atuais (exportar JSONs)
- [ ] Listar todos os nodes que serão alterados
- [ ] Verificar se alteração afeta outros fluxos (criação, exclusão, busca)

### In-flight (durante implementação)

- [ ] Cada correção testada isoladamente antes da próxima
- [ ] Teste com caso de sucesso (cenário 5)
- [ ] Teste com cada cenário de falha (cenários 1-4)
- [ ] Teste de regressão: criação e busca ainda funcionam?

### Post-flight (após implementar)

- [ ] Edição parcial agenda: só mudar horário → outros campos intactos
- [ ] Edição parcial gastos: só mudar valor → outros campos intactos
- [ ] Edição com múltiplos resultados → Agent pergunta qual
- [ ] Edição com 0 resultados → Agent informa que não encontrou
- [ ] Edição com mudança de dia → fim calculado corretamente
- [ ] Edição Google Calendar → sync funciona
- [ ] Verificar: Agent NUNCA diz "Prontinho" sem confirmação real

---

## 8. Resumo Executivo

| Métrica | Antes | Depois (esperado) |
|---------|-------|--------------------|
| Pontos fracos edição | 13 | 0 |
| Dead ends silenciosos | 3 | 0 |
| Campos destruídos em edit parcial | 5/6 (gastos) | 0 |
| Corrupção de data (start>end) | Frequente | Impossível (validação backend) |
| Agent confirma sem verificar | Sempre | Nunca |
| Duração depende do LLM | 100% | 0% (backend calcula) |
| Resposta com dados reais | Nunca (gastos) | Sempre |
| Taxa de acerto estimada | ~60-70% | 95%+ |

**Filosofia aplicada:**
- **BBBK:** "Se confirmo, é porque verifiquei" — garantia sustentada por backend
- **Swiss Cheese:** 4 novas camadas de defesa (Smart Merge, validação, resposta detalhada, confirmação condicional)
- **TEM:** Evitar (validação pre-UPDATE) → Capturar (resposta detalhada) → Mitigar (fallback de duração)

---

*Análise baseada em leitura direta de: premium-workflow.json, Calendar WebHooks - Total Assistente(3).json, Financeiro - Total(2).json*
*Metodologia: BBBK + Swiss Cheese + TEM + Checklists de aviação*
