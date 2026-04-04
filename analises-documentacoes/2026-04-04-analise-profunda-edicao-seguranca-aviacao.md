# Analise Profunda — Sistema de Edicao
## Escopo, Severidade e Paralelo com Seguranca de Aviacao

**Data:** 2026-04-04
**Base de dados:** 4 baterias de teste (72+ testes), 30+ execucoes de edicao reais no N8N DEV
**Frameworks aplicados:** Swiss Cheese Model (Reason), TEM, CRM, BBBK, Defense in Depth, NTSB Investigation

---

# PARTE 1 — O QUE OS TESTES REVELARAM

## 1.1 Inventario Completo de Testes de Edicao

Foram executados **30 testes de edicao** distribuidos em 2 baterias principais (BATERIA-EDICAO-EXCLUSAO 03/04 e RELATORIO-COMPLETE 04/04), mais observacoes incidentais nas baterias de debounce e prompt padrao.

Nenhuma das correcoes dos Passos 1-6 estava implementada. Estes resultados sao o **baseline** — o sistema como esta hoje em producao.

### Edicao de Agenda — Todos os Testes

| # | Teste | Input | Resultado | Modo de Falha |
|---|-------|-------|-----------|---------------|
| 1 | MOD-Q1 | "muda a reuniao pra 15h" | PASS parcial | end_event=14:30 < start=15:00 (corrupcao) |
| 2 | MOD-Q2 | "passa o planning pro dia 8" | PASS | Agent enviou start+end corretos |
| 3 | MOD-Q3 | "muda nome pra Alinhamento" | PASS | Rename simples, sem logica de data |
| 4 | MOD-Q4 | "muda reuniao pro dia 7 de abril" | FAIL | Agent usou campo errado (busca vs edicao) |
| 5 | MOD-Q5 | "renomeia pra PlanningTest" | PASS | Rename simples |
| 6 | MOD-B1 | "atrasa review 30 minutos" | PASS | Offset relativo, Agent calculou start+end |
| 7 | MOD-B2 | "antecipa review pra 8h" | PASS | Agent enviou ambos campos |
| 8 | MOD-B3 | "muda aula natacao pra 17h" | FAIL CRITICO | Evento nao existe, Agent disse "Prontinho" |
| 9 | MOD-B4 | "muda a reuniao pras 20h" | PASS | Pediu clarificacao (multiplos resultados) |
| 10 | MOD-C2 | "muda review pro dia 10 as 14h" | FAIL CRITICO | end ficou dia 05/04, start foi pra dia 10/04 |
| 11 | MOD-C3 | "muda reuniao pro dia 1 marco" | PASS | Recusou data passada |
| 12 | Q7 | "muda reuniao pras 16h" | FAIL | Calendar webhook error |
| 13 | B19 | "muda reuniao pras 16h" | PASS | Pediu qual reuniao |
| 14 | B20 | "passa almoco pra segunda" | FAIL | Timeout, sem execucao Premium |
| 15 | B21 | "renomeia almoco sexta" | FAIL | Calendar error |
| 16 | C18 | "muda reuniao 10h pras 11h" | PASS | Sucesso completo |
| 17 | C19 | "muda reuniao pra 17h-18h30" | FAIL | Timeout |
| 18 | C20 | "adiciona descricao na reuniao" | FAIL | Classificado como criar, nao editar |
| 19 | C21 | "muda reuniao pras 23h50" | PASS | Horario noturno OK |
| 20 | C22 | "muda horario do evento" | FAIL | Timeout (dado insuficiente + dead end) |
| 21 | C23 | "muda aula natacao pra 18h" | PASS | Pediu mais informacao |
| 22 | C43a | "muda dentista pras 11h" | PASS | Pediu confirmacao |

**Agenda: 13 PASS / 9 FAIL = 59% de acerto**

### Edicao de Gastos — Todos os Testes

| # | Teste | Input | Resultado | Modo de Falha |
|---|-------|-------|-----------|---------------|
| 1 | Q3 | "muda uber pra 35 reais" | FAIL | id_gasto=undefined |
| 2 | B7 | "muda uber pra 30" | PASS | Funcionou |
| 3 | B8 | "renomeia almoco" | PASS | Funcionou |
| 4 | B9 | "muda categoria uber lazer" | FAIL | id_gasto=undefined |
| 5 | C14 | "muda gasto de 50" | PASS | Pediu mais info (correto) |
| 6 | C15 | "edita aquele gasto" | PASS | Pediu mais info (correto) |
| 7 | C40a | "muda jantar pra 95" | FAIL | Timeout |

**Gastos: 4 PASS / 3 FAIL = 57% de acerto**

### Taxa Geral de Edicao

| Dominio | Pass | Fail | Taxa |
|---------|------|------|------|
| Agenda | 13 | 9 | 59% |
| Gastos | 4 | 3 | 57% |
| **Total Edicao** | **17** | **12** | **58%** |

Para comparacao: **criacao tem 92-95% de acerto** nas mesmas baterias.

---

## 1.2 Taxonomia dos Modos de Falha

Cada falha de edicao pertence a uma de 6 categorias distintas. Nenhuma falha teve causa unica — todas envolveram multiplas camadas.

### MODO 1 — Corrupcao de Dados (end_event nao acompanha start_event)

**Testes afetados:** MOD-Q1, MOD-C2, e provavelmente Q7, C19
**Camada:** Sub-workflow Calendar WebHooks (node Edit Fields5)
**Severidade:** P0 CRITICA — dado gravado errado no banco

**O que acontece passo a passo:**

```
1. Usuario: "muda a reuniao pra 15h"
2. Agent envia ao Calendar WebHooks:
   novo_inicio_evento = "2026-04-04 15:00:00-03"
   novo_fim_evento    = ""                          <-- VAZIO

3. Edit Fields5 resolve novo_fim com operador ||:
   "" || output[0].fim_evento = "2026-04-04T14:30:00-03"
   (pega o fim ORIGINAL do banco)

4. Supabase grava:
   start_event = 15:00 (NOVO)
   end_event   = 14:30 (ORIGINAL — 30 min ANTES do start)

5. Google Calendar PATCH: "The specified time range is empty" (REJEITA)
6. Agent: "Prontinho, atualizei!" (MENTIRA)
```

**Caso mais grave — MOD-C2:**

```
start_event = 10/04 14:00 (dia 10 — NOVO)
end_event   = 05/04 08:30 (dia 5 — ORIGINAL)
Diferenca: end esta 5 DIAS antes do start
```

**Causa raiz:** O operador JavaScript `||` trata string vazia `""` como falsy, ativando o fallback para o valor original. Quando o start muda de dia/hora mas o end usa o fallback, o resultado e incoerente.

---

### MODO 2 — Confusao de Campos (busca vs edicao)

**Testes afetados:** MOD-Q4
**Camada:** AI Agent (interpretacao do prompt)
**Severidade:** P0 CRITICA — edicao silenciosamente nao acontece

**O que acontece:**

```
1. Usuario: "muda a reuniao pro dia 7 de abril"
2. Agent envia:
   data_inicio_evento = "2026-04-07 00:00:00-03"   <-- campo de BUSCA
   novo_inicio_evento = ""                           <-- campo de EDICAO (vazio!)

3. Calendar WH: encontra evento, mas nao tem valor novo para gravar
4. Edit Fields5: novo_comeco = "" || original = dia 4 (nada muda)
5. Banco: permanece dia 4
6. Agent: "Prontinho, mudei pro dia 7!" (MENTIRA — banco continua dia 4)
```

**Causa raiz:** Os nomes dos campos sao similares (`data_inicio_evento` vs `novo_inicio_evento`). O LLM confundiu o campo de filtro com o campo de atualizacao. O prompt nao diferencia com clareza suficiente.

---

### MODO 3 — Confirmacao Fantasma (evento/gasto inexistente)

**Testes afetados:** MOD-B3
**Camada:** AI Agent + Sub-workflow (dead end)
**Severidade:** P0 CRITICA — confianca zero na resposta

**O que acontece:**

```
1. Usuario: "muda a aula de natacao pra 17h"
2. Agent chama editar_eventos com nome_evento="aula de natacao"
3. Calendar WH busca no banco: 0 resultados
4. Switch output 2 (0 resultados): NAO TEM NODE CONECTADO
5. Webhook trava — sem resposta
6. Agent (que ja gerou a mensagem antes de esperar): "Prontinho, atualizei!"
7. Realidade: nada aconteceu no banco, nada existe
```

**Causa raiz dupla:**
- Switch output 2 e um dead end (sem node conectado)
- Agent gera "Prontinho" ANTES de receber resposta do sub-workflow

---

### MODO 4 — UUID Undefined (gastos)

**Testes afetados:** Q3, B9
**Camada:** AI Agent -> Sub-workflow Financeiro
**Severidade:** P0 CRITICA — edicao nunca acontece

**O que acontece:**

```
1. Usuario: "muda o uber pra 35 reais"
2. Agent chama editar_financeiro com id_gasto=undefined
3. Financeiro: Get a row4 WHERE id_spent=undefined
4. Supabase: 0 resultados
5. Fluxo falha silenciosamente
```

**Causa raiz tripla:**
- Agent pula o passo de busca (deveria chamar buscar_financeiro primeiro)
- Nomes inconsistentes na cadeia: banco usa `id_spent`, busca retorna `id`, prompt mostra `id_spent`, tool espera `id_gasto`
- Information Extractor1 (IA) pode dropar o campo `id` da resposta

---

### MODO 5 — Timeout / Dead End

**Testes afetados:** B20, C19, C22, C40a
**Camada:** Sub-workflows (Switch sem conexao / If4 sem saida FALSE)
**Severidade:** P1 ALTA — usuario nao recebe resposta

**O que acontece:** O webhook nao retorna resposta. O Premium workflow aguarda ate o timeout. O usuario fica sem resposta ou recebe mensagem generica.

**Causa raiz:** Caminhos nao conectados nos sub-workflows. Quando o Switch encontra 0 ou >1 resultados, ou quando If4 recebe FALSE, nao ha node de resposta. O webhook trava.

---

### MODO 6 — Classificacao Incorreta

**Testes afetados:** C20
**Camada:** Classificador
**Severidade:** P1 ALTA — mensagem nem chega ao fluxo de edicao

**O que acontece:** "adiciona descricao na reuniao" e classificado como `criar_evento_agenda` ao inves de `editar_evento_agenda`. A mensagem vai para o fluxo errado.

---

## 1.3 O Que Funciona (e Por Que)

Igualmente importante e entender os 17 testes que passaram:

| Tipo de Edicao | Taxa | Por Que Funciona |
|----------------|------|------------------|
| **Rename** (agenda) | 2/2 = 100% | Nao envolve logica de data/hora. Campo unico. Fallback `\|\|` funciona corretamente para nome. |
| **Rename** (gastos) | 1/1 = 100% | Idem |
| **Offset relativo** ("atrasa 30min") | 2/2 = 100% | Agent calcula start E end com o offset. Ambos campos chegam preenchidos. |
| **Pedido de clarificacao** | 4/4 = 100% | Agent reconhece ambiguidade e pergunta. Nao tenta editar. |
| **Recusa de input invalido** | 1/1 = 100% | Agent reconhece data passada e recusa. |
| **Mudanca de horario com contexto completo** | 2/4 = 50% | Funciona quando Agent envia AMBOS campos (start+end). Falha quando envia so start. |
| **Mudanca de data** | 1/2 = 50% | Funciona quando Agent envia AMBOS campos. |

**Padrao claro:** Edicoes que nao envolvem logica de data/hora funcionam ~100%. Edicoes que envolvem data/hora funcionam ~50% — dependendo de se o Agent enviou ou nao o campo `novo_fim`. **O sistema nao tem defesa backend para quando o Agent falha nesse campo.**

---

## 1.4 Bugs Latentes (Nao Observados mas Existentes)

### PF-F1: UPDATE Destroi Campos em Edicao Parcial de Gastos

Este bug **nao foi observado nos testes** porque a maioria das edicoes de gastos falhou ANTES de chegar ao UPDATE (UUID undefined). Mas a arquitetura mostra que quando uma edicao de gasto FUNCIONA (como B7 e B8), o `Update a row` grava TODOS os 6 campos vindos do body. Se o Agent enviou `novo_nome` mas deixou `nova_data`, `nova_categoria`, etc. como `""`, esses campos sao sobrescritos com string vazia.

**Por que e grave:** B7 ("muda uber pra 30") provavelmente destruiu name_spent, date_spent, category_spent, type_spent e transaction_type desse registro. O teste marcou PASS porque o valor mudou — mas ninguem verificou os outros campos.

**Analogia:** E como um aviao que pousa com sucesso, mas ninguem percebe que o trem de pouso esta danificado. O proximo voo decola com o dano latente.

---

# PARTE 2 — ANALISE DE SEVERIDADE

## 2.1 Classificacao de Impacto

| Modo de Falha | Frequencia | Impacto no Usuario | Impacto nos Dados | Detectabilidade |
|---------------|------------|--------------------|--------------------|-----------------|
| Corrupcao end_event | ~25% das edicoes de horario | Agent mente "Prontinho" | Dado corrompido no Supabase, Google rejeita | BAIXA — usuario so descobre quando olha agenda |
| Confusao de campos | ~10% das edicoes | Agent mente "Prontinho" | Nada muda (melhor cenario) | BAIXA — usuario acha que mudou |
| Confirmacao fantasma | ~5% das edicoes | Agent mente "Prontinho" | Nada acontece | BAIXA |
| UUID undefined | ~30% das edicoes de gastos | Erro silencioso ou timeout | Nada acontece | MEDIA — usuario percebe que nao mudou |
| Timeout/dead end | ~15% das edicoes | Sem resposta | Nada acontece | ALTA — usuario percebe a ausencia |
| Campos destruidos (latente) | 100% das edicoes parciais que FUNCIONAM | Usuario nao sabe | TODOS os campos nao-editados zerados | NULA — invisivel ate consulta futura |

## 2.2 Escala de Gravidade

```
NIVEL 1 — INCONVENIENCIA
Timeout: usuario nao recebe resposta, tenta de novo.
-> 15% das edicoes

NIVEL 2 — DESINFORMACAO
Agent confirma edicao que nao aconteceu. Usuario acredita que mudou.
-> 35% das edicoes (corrupcao + confusao + fantasma)

NIVEL 3 — CORRUPCAO SILENCIOSA
Dados gravados errados no banco SEM o usuario saber.
end_event antes do start_event. Campos zerados.
-> Potencialmente 100% das edicoes parciais "bem-sucedidas"
```

**O Nivel 3 e o mais perigoso porque e invisivel.** O usuario acha que tudo esta correto. A corrupcao so aparece dias depois, quando ele olha a agenda e encontra eventos com horarios impossiveis, ou consulta gastos e encontra campos vazios.

---

# PARTE 3 — PARALELO COM SEGURANCA DE AVIACAO

## 3.1 O Modelo Swiss Cheese de James Reason

James Reason (Universidade de Manchester, 1990) modela as defesas de um sistema como fatias de queijo suico empilhadas em serie. Cada fatia e uma camada de defesa. Cada fatia tem "buracos" — falhas que existem por design imperfeito, falibilidade humana ou degradacao. **Um acidente so acontece quando os buracos de TODAS as fatias se alinham**, criando uma trajetoria que atravessa cada defesa.

### Condicoes Latentes vs Falhas Ativas

- **Falhas ativas:** O ato inseguro cometido pela pessoa na ponta — o piloto que aperta o botao errado, o Agent que envia o campo vazio.
- **Condicoes latentes:** Decisoes feitas a montante — pelo designer, pelo arquiteto — que criam fraquezas dormentes no sistema. Podem existir por meses sem consequencia ate se combinarem com uma falha ativa.

**O insight central de Reason: culpar a pessoa que cometeu a falha ativa nao resolve nada. As condicoes latentes sao onde a melhoria sistemica acontece.**

### Aplicacao ao Sistema de Edicao

Nosso sistema tem **6 fatias de queijo** (camadas de defesa):

```
FATIA 1: Classificador
  Buracos: confunde "adiciona descricao" com "criar"

FATIA 2: Prompt do AI Agent
  Buracos: nao diferencia campos de busca vs edicao
           nao exige busca antes de editar
           nao proibe confirmacao antes da resposta

FATIA 3: Tool Call (httpRequestTool)
  Buracos: $fromAI() aceita undefined/vazio sem validacao
           nomes de campo inconsistentes na cadeia

FATIA 4: Sub-workflow Calendar WebHooks
  Buracos: operador || trata "" como falsy
           Switch tem dead ends
           nao valida start < end

FATIA 5: Sub-workflow Financeiro
  Buracos: UPDATE grava todos campos sem merge
           If4 FALSE e dead end
           resposta so diz "sucesso" sem dados

FATIA 6: Resposta ao Usuario
  Buracos: Agent gera resposta ANTES do resultado
           sem validacao pos-tool
           sem diff-check
```

**Na criacao, pelo menos 3 fatias funcionam** (o fluxo de criacao tem validacao, defaults sensatos, e menor dependencia do LLM para campos). Na edicao, **todas as 6 fatias tem buracos**, e eles se alinham em ~42% das tentativas.

---

## 3.2 Air France 447 — O Paralelo Mais Preciso

Em 1 de junho de 2009, o voo AF447 (Airbus A330, Rio-Paris) caiu no Atlantico. 228 mortos.

### A Cadeia de Eventos

1. **Tubos de Pitot congelaram** — os sensores de velocidade deram leitura falsa
2. **Piloto automatico desconectou** — o sistema reverteu para manual
3. **Alarmes contraditorios** — o cockpit recebeu dados corrompidos
4. **Copiloto puxou o manche para tras** (nariz pra cima) — a acao OPOSTA a correta para um stall
5. **Flight Director confirmou a acao errada** — o instrumento mostrava que a acao do piloto estava correta
6. **A tripulacao NUNCA entendeu que estava em stall** — o alarme de stall tocou 75 vezes em 3 minutos e 30 segundos
7. **O aviao caiu enquanto a tripulacao acreditava estar fazendo a coisa certa**

### Paralelo Exato

| AF447 | Sistema de Edicao |
|-------|-------------------|
| Pitot da leitura corrompida | Tool retorna dados corrompidos/incompletos ao Agent |
| Piloto automatico desconecta | Sub-workflow falha silenciosamente (dead end) |
| Alarmes contraditorios | Agent recebe "" (vazio) e trata como "sem alteracao" |
| Copiloto age com base nos dados errados | Agent gera "Prontinho" baseado em suposicao, nao em verificacao |
| Flight Director CONFIRMA a acao errada | Operador `\|\|` preenche campo com valor original, "confirmando" que tudo esta certo |
| Tripulacao nunca entende o problema | Usuario recebe "Prontinho, editei!" enquanto dado esta corrompido no banco |
| 3min30s de queda sem percepcao | Dias/semanas com dados corrompidos na agenda ate alguem notar |

**A essencia:** Assim como a tripulacao do AF447 morreu acreditando que estava fazendo a coisa certa, nosso sistema **confirma sucesso enquanto corrompe dados**. A ausencia de verificacao independente torna impossivel detectar o erro a tempo.

---

## 3.3 Boeing 737 MAX — O Ponto Unico de Falha

Em 2018 e 2019, dois 737 MAX cairam (Lion Air 610 e Ethiopian 302). 346 mortos.

### O Que Aconteceu

O sistema MCAS (Maneuvering Characteristics Augmentation System) dependia de **um unico sensor** de angulo de ataque. Sem redundancia. Quando o sensor deu leitura errada, o MCAS empurrou o nariz do aviao para baixo repetidamente. Os pilotos lutaram contra o sistema sem saber que ele existia — a Boeing nao os informou.

### Paralelo

| 737 MAX | Sistema de Edicao |
|---------|-------------------|
| MCAS depende de 1 sensor | Edicao depende de 1 tool call sem verificacao |
| Sensor errado = MCAS age errado | Agent envia campo vazio = backend grava errado |
| Boeing nao contou aos pilotos que MCAS existe | O sistema nao informa o usuario que a edicao falhou |
| Sensor redundante era OPCIONAL (pago a parte) | Validacao pos-edicao e "nice to have", nao obrigatoria |
| FAA delegou certificacao a Boeing | Agent "certifica" sua propria acao sem verificacao externa |

**O ponto:** O 737 MAX nao precisava de tecnologia nova. Precisava de **redundancia** — um segundo sensor independente. Nosso sistema nao precisa de IA mais inteligente. Precisa de **validacao independente** — o backend verificando o que o Agent fez, assim como um segundo sensor verifica o primeiro.

---

## 3.4 Tenerife 1977 — O Alinhamento de Buracos

27 de marco de 1977. Dois Boeing 747 colidiram na pista em Tenerife. 583 mortos. O pior acidente aereo da historia.

### A Cadeia

1. Bomba em Gran Canaria desvia voos para Tenerife (aeroporto pequeno, lotado)
2. Neblina densa — ninguem ve nada
3. Sem radar de solo — ATC nao sabe onde estao os avioes
4. Interferencia de radio bloqueia uma transmissao critica
5. Comandante da KLM inicia decolagem SEM autorizacao
6. Engenheiro de voo questiona o comandante, mas e ignorado (gradiente de autoridade)

**Nenhuma dessas falhas sozinha causaria o acidente.** Foi a combinacao simultanea de TODAS elas.

### Paralelo

Quando nosso MOD-C2 corrompe dados:

1. Agent nao envia `novo_fim_evento` (campo vazio) — **a bomba**
2. Edit Fields5 usa `||` que trata "" como falsy — **a neblina**
3. Nenhuma validacao start < end — **sem radar**
4. Agent gera resposta antes de verificar — **a interferencia**
5. Supabase grava sem questionar — **a decolagem sem autorizacao**
6. Google Calendar rejeita mas ninguem escuta — **o engenheiro ignorado**

**Se QUALQUER camada tivesse funcionado, o dado nao seria corrompido.** E exatamente o Swiss Cheese Model: os buracos se alinharam.

---

## 3.5 Eastern Airlines 401 — A Distracao da Lampada

29 de dezembro de 1972. Um L-1011 caiu nos Everglades, Florida. 101 mortos.

**Causa:** Uma lampada indicadora de $12 queimou. Toda a tripulacao (3 pessoas) ficou focada em diagnosticar a lampada. Ninguem monitorou os instrumentos de voo. Alguem esbarrou no manche, desativando o piloto automatico. O aviao desceu gradualmente por 2 minutos. A tripulacao so percebeu a 7 segundos do impacto.

### Paralelo

Nosso bug PF-F1 (UPDATE destroi campos) e a lampada queimada. O foco esta nas edicoes que FALHAM visivelmente (timeout, UUID undefined). Ninguem esta monitorando as edicoes que PARECEM funcionar (B7, B8) — porque ninguem verificou se os outros campos foram preservados.

**A equipe foca nos bugs visiveis enquanto a corrupcao silenciosa acontece em segundo plano, sem ninguem monitorar.**

---

## 3.6 Korean Air 801 — O "Prontinho" Fatal

6 de agosto de 1997. Korean Air 801 colidiu com uma colina em Guam. 229 mortos.

### O Que Aconteceu

O comandante acreditava que o ILS (sistema de aproximacao por instrumentos) estava funcionando. Na verdade, estava fora de servico. Ele captou um sinal falso de outro equipamento e desceu com base nele. O copiloto e o engenheiro perceberam que algo estava errado, mas **fizeram apenas sugestoes vagas** ao inves de desafiar diretamente o comandante. O copiloto finalmente pediu arremetida — **6 segundos antes do impacto**.

### Paralelo

| Korean Air 801 | Sistema de Edicao |
|----------------|-------------------|
| Comandante captou sinal falso | Agent interpretou "" como "sem alteracao" |
| Comandante acredita que esta correto | Agent gera "Prontinho" com confianca total |
| Copiloto percebe erro mas nao desafia | Backend tem dados corretos (original do Get a row) mas nao confronta o Agent |
| Engenheiro faz sugestao vaga | Sub-workflow retorna resposta generica sem detalhe |
| Desafio veio 6 segundos tarde demais | Validacao pos-tool nao existe |

**O backend e o "copiloto" que sabe a verdade mas nao fala.** O Get a row4 (Financeiro) e o Information Extractor (Calendar) TEM os dados originais corretos. Mas a arquitetura atual nao usa esses dados para validar a edicao — eles sao descartados apos o merge.

---

## 3.7 United Airlines 232 — Quando CRM Funciona

19 de julho de 1989. Um fan disk explodiu no DC-10 da United, cortando TODAS as linhas hidraulicas. Zero controles de voo. Por toda engenharia, cenario insurvivavel.

O Capitao Al Haynes usou CRM: recrutou um piloto passageiro, delegou controle de potencia, a tripulacao inventou coletivamente o uso de thrust diferencial para direcionar o aviao. **184 de 296 sobreviveram um cenario projetado para zero sobreviventes.**

### O Paralelo Positivo

Quando o sistema TEM defesas em profundidade funcionando juntas — Agent valida, backend verifica, usuario confirma — ate falhas catastroficas de ferramentas sao recuperaveis.

**Esta e a visao dos Passos 1-6:** criar um "CRM digital" onde Agent, sub-workflow e usuario trabalham como tripulacao coordenada, nao como piloto solitario em cockpit sem instrumentos.

---

# PARTE 4 — OS FRAMEWORKS APLICADOS

## 4.1 TEM (Threat and Error Management)

Desenvolvido pela Universidade do Texas, adotado pela ICAO. Aceita que erros sao **normais e esperados**. O objetivo nao e eliminar erros, mas **detecta-los e gerencia-los** antes que causem dano.

### Tres Camadas: Evitar, Capturar, Mitigar

| Camada | Aviacao | Sistema de Edicao Atual | Apos Correcoes |
|--------|---------|------------------------|----------------|
| **EVITAR** | Briefings pre-voo, checklists, SOPs | Prompt instrui Agent a buscar antes de editar | Prompt reescrito com regras explicitas, exemplos concretos, blocos anti-alucinacao |
| **CAPTURAR** | Cross-checking, callouts, monitoramento de instrumentos | NENHUMA — Agent nao verifica resposta da tool | Smart Merge valida start<end, Merge Fields protege campos, Dead Ends retornam erro |
| **MITIGAR** | Arremetida, pouso de emergencia, procedimentos de falha | NENHUMA — dado corrompido e permanente | Resposta Detalhada permite Agent confirmar com dados reais, validacao de id_gasto |

**Diagnostico TEM do estado atual:**
- Camada EVITAR: parcial (prompt existe mas e fraco)
- Camada CAPTURAR: **ausente**
- Camada MITIGAR: **ausente**

O sistema opera como uma companhia aerea sem cross-check, sem callouts, sem arremetida. Quando o erro acontece, nao ha nada para impedi-lo de se tornar acidente.

---

## 4.2 CRM (Crew Resource Management)

Nasceu diretamente do desastre de Tenerife. A NASA descobriu em 1979 que a maioria dos acidentes nao era por falha tecnica, mas por falhas de comunicacao, lideranca e tomada de decisao no cockpit.

### Principios Fundamentais

1. Nenhuma autoridade age sem verificacao independente
2. Metodo desafio-e-resposta: "piloto voando" declara acao, "piloto monitorando" verifica
3. Cultura de falar: juniores sao treinados e ESPERADOS a contestar
4. Cross-checking: toda acao critica e verificada por outra parte
5. Modelo mental compartilhado: toda a tripulacao tem a mesma consciencia situacional

### Mapeamento ao Sistema

| Papel CRM | No Sistema de Edicao |
|-----------|---------------------|
| Piloto voando (executa) | AI Agent (chama tools, gera resposta) |
| Piloto monitorando (verifica) | **NAO EXISTE** |
| Instrumentos | Resposta do sub-workflow (atualmente: `{"sucesso":"sucesso"}`) |
| Caixa preta (FDR) | Logs do N8N (existem mas ninguem consulta em tempo real) |
| ATC (controle externo) | **NAO EXISTE** |

**O sistema atual e um cockpit de piloto unico sem cross-check.** O Agent tanto executa quanto confirma suas proprias acoes. Isso e proibido na aviacao comercial desde 1981, exatamente por causa de acidentes como Tenerife.

**Apos Passos 1-6:**

| Papel CRM | Implementacao |
|-----------|---------------|
| Piloto voando | AI Agent (inalterado) |
| Piloto monitorando | Smart Merge (valida dados), Merge Fields (protege campos), Dead Ends (retorna erro) |
| Instrumentos | Resposta Detalhada (dados reais, nao "sucesso") |
| Callout de alerta | Erro retornado ao Agent: "nenhum_resultado", "multiplos_resultados", "sem_permissao" |

---

## 4.3 BBBK — Design Reverso a Partir da Garantia

Al "Bugs" Burger fundou a BBBK com uma abordagem radical: ao inves do padrao da industria de "controlar" pragas a niveis aceitaveis, ele **garantiu 100% de eliminacao**. Se um hospede visse UM inseto: reembolso total, pagamento de outro exterminador por 1 ano, pagamento do jantar do hospede, carta de desculpas, pagamento de visita futura. Se o estabelecimento fosse fechado por infestacao: BBBK pagava multas, lucros perdidos, mais $5.000.

### O Principio

BBBK nao partiu dos processos existentes e adicionou uma garantia. Burger partiu da garantia e trabalhou pra tras: **"Se garantimos zero insetos, que sistemas precisam existir?"**

Cada contratacao, protocolo, frequencia de inspecao e escolha de quimico foi projetada a partir da impossibilidade de falha. Era mais barato ser perfeito do que ser descuidado.

### Aplicacao

A pergunta: **"Se GARANTIRMOS que nenhuma edicao do usuario sera corrompida, que sistemas precisam existir?"**

| Sistema Obrigatorio | Existe Hoje? | Apos Correcoes? |
|---------------------|--------------|-----------------|
| Snapshot pre-edicao | NAO | SIM (Get a row4 / Information Extractor) |
| Merge de campos antes do UPDATE | NAO | SIM (Smart Merge + Merge Fields) |
| Validacao start < end | NAO | SIM (Smart Merge) |
| Validacao id antes de editar | NAO | PARCIAL (prompt exige, backend nao valida) |
| Resposta com dados reais | NAO | SIM (Resposta Detalhada) |
| Agent espera resposta antes de confirmar | NAO | SIM (regra_confirmacao no prompt) |
| Resposta de erro para 0/multiplos resultados | NAO | SIM (Dead Ends) |
| Rollback automatico em caso de erro | NAO | NAO |
| Confirmacao do usuario antes de gravar | NAO | NAO |

**A garantia BBBK nos mostra que 2 defesas ainda faltam** (rollback e confirmacao do usuario). Os Passos 1-6 implementam 7 de 9 sistemas obrigatorios. Para o escopo atual (95%+), isso e suficiente. Para 99%+, as 2 ultimas seriam necessarias.

---

## 4.4 Defense in Depth — Barreiras Independentes

### O Principio (IAEA Nuclear, 5 niveis)

1. **Prevenir desvios** da operacao normal (bom design)
2. **Detectar e controlar** desvios quando ocorrem (monitoramento)
3. **Sistemas de seguranca** para impedir escalada (shutdowns automaticos)
4. **Mitigar consequencias** se acidente ocorrer (contencao)
5. **Resposta de emergencia** para limitar impacto externo (evacuacao)

### Regras de Design

- **Independencia:** Falha de uma barreira NAO compromete as outras
- **Redundancia:** Funcoes criticas tem multiplos sistemas independentes
- **Diversidade:** Barreiras usam tecnologias diferentes (falha de modo comum nao derruba todas)
- **Criterio de falha unica:** O sistema deve cumprir objetivos de seguranca mesmo com falha de qualquer componente individual

### Estado Atual vs Corrigido

```
ESTADO ATUAL:

Usuario → Classificador → Agent → Tool Call → Sub-workflow → Banco → Google
           [buraco]      [buraco]  [buraco]    [buraco]     [sem check]  [rejeita tarde]

Barreira 1: Classificador (unica, sem redundancia)
Barreira 2: NAO EXISTE
Barreira 3: NAO EXISTE
Barreira 4: NAO EXISTE
Barreira 5: NAO EXISTE

-> Qualquer falha em qualquer ponto = dado corrompido ou timeout


APOS PASSOS 1-6:

Usuario → Classificador → Agent (prompt novo) → Tool Call → Sub-workflow → Banco → Google
           [barreira 1]   [barreira 2]          [barreira 3] [barreira 4]  [barreira 5]

Barreira 1: Classificador (inalterado)
Barreira 2: Prompt com regras explicitas + exemplos + anti-alucinacao
Barreira 3: Tool description reforçada + $fromAI() com hints claros
Barreira 4: Smart Merge / Merge Fields / Dead Ends / Validacao start<end
Barreira 5: Resposta Detalhada (Agent verifica dados reais antes de confirmar)

-> Para corromper dado, TODAS as 5 barreiras precisam falhar simultaneamente
```

---

## 4.5 Metodologia NTSB — Investigacao de Cadeia de Eventos

O NTSB (National Transportation Safety Board) investiga acidentes aereos trabalhando **de tras pra frente**: parte do acidente e rastreia cada elo da cadeia ate a causa raiz. Distingue entre:

- **Causa:** Fator que diretamente levou ao acidente
- **Fator contribuinte:** Condicao que aumentou a probabilidade ou gravidade

### Aplicacao: Investigacao MOD-C2

**Acidente:** end_event gravado como 05/04 08:30 quando start_event e 10/04 14:00 (5 dias de diferenca)

```
CADEIA (de tras pra frente):

[ACIDENTE] Google rejeita PATCH, Supabase tem dado corrompido
    ↑
[ELO 5] Update a row1 grava start=10/04, end=05/04
    ↑
[ELO 4] Edit Fields5 resolve: novo_fim = "" || "05/04 08:30" (original)
    ↑  CAUSA: operador || trata "" como falsy
    ↑
[ELO 3] Agent envia novo_fim_evento = "" (vazio)
    ↑  FATOR CONTRIBUINTE: prompt nao exige envio de novo_fim
    ↑
[ELO 2] Agent envia novo_inicio_evento = "10/04 14:00" (correto)
    ↑
[ELO 1] Usuario: "muda o review pro dia 10 as 14h"
    ↑  ENTRADA VALIDA


BARREIRAS QUE PODERIAM TER QUEBRADO A CADEIA:

  Entre elo 3 e 4: Smart Merge calcula novo_fim = novo_inicio + duracao_original
  → QUEBRARIA A CADEIA (Passo 2)

  Entre elo 4 e 5: Validacao start < end
  → QUEBRARIA A CADEIA (Passo 2)

  Apos elo 5: Resposta detalhada ao Agent com dados reais
  → Agent perceberia a inconsistencia e NAO confirmaria "Prontinho"
  → QUEBRARIA A CADEIA (Passo 5)
```

**Conclusao NTSB:** Causa provavel: ausencia de calculo de duracao no backend quando apenas start_event e alterado (Edit Fields5 no Calendar WebHooks). Fator contribuinte: prompt insuficiente que permite Agent omitir novo_fim_evento. Fator contribuinte: ausencia de validacao start < end antes do UPDATE.

---

# PARTE 5 — ESCOPO COMPLETO DAS CORRECOES

## 5.1 Cobertura dos 13 Pontos Fracos

| PF | Descricao | Confirmado nos Testes | Corrigido por Qual Passo |
|----|-----------|----------------------|--------------------------|
| PF-A3 | Agent confunde campos busca/edicao | SIM (MOD-Q4) | Passo 1 (prompt) |
| PF-A4 | Agent confirma antes de verificar | SIM (MOD-Q4, MOD-B3) | Passo 1 (prompt) + Passo 5 (dados reais) |
| PF-A5 | Calculo de duracao delegado ao LLM | SIM (MOD-Q1) | Passo 1 (prompt) + Passo 2 (backend) |
| PF-A6 | Agent nao ve dados salvos em gastos | Bloqueado por UUID bug | Passo 5 (Resposta Detalhada) |
| PF-CW1 | Dead ends no Switch | SIM (MOD-B3, C19, C22) | Passo 3 (Dead Ends) |
| PF-CW2 | Operador `\|\|` corrompe datas | SIM (MOD-Q1, MOD-C2) | Passo 2 (Smart Merge) |
| PF-CW3 | String vazia nao tratada | SIM (MOD-Q1, MOD-Q4) | Passo 2 (Smart Merge) |
| PF-CW5 | start > end gravado | SIM (MOD-Q1) | Passo 2 (Smart Merge) |
| PF-F1 | UPDATE destroi campos vazios | Latente (nao observado diretamente) | Passo 4 (Merge Fields) |
| PF-F2 | Busca sem user_id | Nao testado | Passo 6 (filtro fk_user) |
| PF-F3 | If4 FALSE e dead end | SIM indireto (C40a timeout) | Passo 6 (Erro Sem Permissao) |
| PF-X1 | Sem validacao pos-tool | SIM (MOD-Q4, MOD-B3) | Passo 5 (Resposta Detalhada) |
| PF-X2 | Supabase antes Google | SIM (MOD-Q1, MOD-C2) | Passo 2 (validacao impede dado invalido) |

**13/13 pontos cobertos. 10/13 confirmados empiricamente nos testes.**

## 5.2 Bug Adicional Descoberto

| Bug | Descricao | Testes | Cobertura |
|-----|-----------|--------|-----------|
| id_gasto=undefined | Agent nao passa UUID ao editar gasto | Q3, B9 | Parcial pelo Passo 1 (prompt exige busca antes). Defesa backend recomendada mas nao implementada nos Passos 1-6 |

## 5.3 Projecao Pos-Correcao

| Cenario | Antes (baseline) | Apos Passos 1-6 |
|---------|-------------------|------------------|
| Edicao agenda — horario | ~33% | ~95% (Smart Merge preserva duracao + valida start<end) |
| Edicao agenda — rename | 100% | 100% (ja funcionava) |
| Edicao agenda — data | ~50% | ~95% (prompt corrigido + Smart Merge) |
| Edicao agenda — evento inexistente | 0% (fantasma) | 100% (Dead End retorna erro) |
| Edicao agenda — multiplos | funciona (pediu clarificacao) | funciona (Dead End retorna lista) |
| Edicao gastos — valor | ~33% | ~90% (prompt + Merge Fields) |
| Edicao gastos — rename | 100% | 100% |
| Edicao gastos — categoria | 0% (UUID) | ~85% (prompt exige busca) |
| **Taxa geral edicao** | **58%** | **~93-95%** |

---

# PARTE 6 — CONCLUSAO

## O Estado Real do Sistema

O sistema de edicao opera hoje como um aviao **sem copiloto, sem cross-check, sem instrumentos confiaveis e sem procedimento de arremetida**. O piloto (AI Agent) voa sozinho, confirma suas proprias acoes, e quando os sensores (tools) retornam dados corrompidos, ele pousa confiante em cima de uma montanha dizendo "Prontinho".

A taxa de 58% de acerto em edicao nao e aceitavel para um produto que gerencia agenda e financas pessoais. Num paralelo de aviacao, seria uma companhia aerea onde **42% dos voos tem algum incidente** — nenhum regulador permitiria operacao.

## O Que as Correcoes Representam

Os Passos 1-6 nao sao patches isolados. Sao a **implementacao de um sistema CRM digital** onde:

- O **Agent** e o piloto voando (executa)
- O **Smart Merge / Merge Fields** e o piloto monitorando (valida independentemente)
- Os **Dead Ends** sao os callouts de alerta ("altitude!", "terrain!")
- A **Resposta Detalhada** sao os instrumentos confiaveis
- A **regra_confirmacao** e o procedimento de cross-check ("confirme com dados retornados, nao com suposicao")

## A Analogia Final

A aviacao comercial nao e segura porque pilotos nao erram. Pilotos erram o tempo todo. A aviacao e segura porque **o sistema captura e gerencia os erros antes que se tornem acidentes**.

O AI Agent nao vai parar de enviar campos vazios. O LLM nao vai parar de confundir nomes de campo. Essas sao **falhas ativas esperadas**. O que precisa mudar sao as **condicoes latentes** — o backend sem validacao, o sub-workflow sem resposta de erro, o UPDATE sem merge de campos.

**Corrigir as condicoes latentes e o que move o sistema de 58% para 95%.** Nao porque o Agent erra menos, mas porque quando ele erra, o sistema captura o erro antes que chegue ao banco.

Como disse James Reason: **"Nao podemos mudar a condicao humana, mas podemos mudar as condicoes em que humanos trabalham."**

Substituindo: **"Nao podemos mudar a condicao do LLM, mas podemos mudar as condicoes em que o LLM opera."**
