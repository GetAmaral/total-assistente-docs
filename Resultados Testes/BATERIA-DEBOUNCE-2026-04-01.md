# Bateria de Testes — Debounce e Mensagens Consecutivas

**Data:** 2026-04-01
**Auditor:** Lupa (auditor-360)
**Ambiente:** N8N DEV (http://76.13.172.17:5678)
**Webhook:** /webhook/dev-whatsapp
**Usuario:** Luiz Felipe (554391936205)
**Baseline exec ID:** 13605
**Total execucoes geradas:** 72 (IDs 13606–13677)

---

## Resumo Executivo

| Metrica | Valor |
|---------|-------|
| Testes executados | 12 |
| Mensagens enviadas | 25 |
| Execucoes Premium disparadas | 24 |
| Debounce efetivo (msgs agrupadas em 1 exec) | **0 de 12 testes** |
| Classificador correto | 18/24 (75%) |
| Classificador errado | 6/24 (25%) |
| Mensagens perdidas (nunca processadas) | T8-MSG3 "cancela dentista", T11-MSG1 "agenda amanha", T11-MSG2 "relatorio do mes" |
| Calendar errors (log_total table) | 17 |
| Financeiro errors (log_total table) | 2 |
| Report errors (log_total table) | 2 |
| Bugs criticos encontrados | 3 |

---

## Bug Critico #1 — DEBOUNCE INEXISTENTE

**Severidade:** CRITICA
**Descricao:** O sistema NAO faz debounce. Cada mensagem do webhook gera sua propria execucao Main→Premium independente. Quando o usuario envia 2 mensagens rapidas, o sistema dispara 2 pipelines paralelos.

**Comportamento observado:**
- Todos os 12 testes geraram execucoes independentes por mensagem
- MSG1 dispara Main #1 → Premium #1
- MSG2 (2s depois) dispara Main #2 → Premium #2
- Premium #2 LE o Redis e ve MSG1 no historico, processando ambas
- Premium #1 so ve MSG1

**Consequencia:** A MSG2 "absorve" MSG1 via Redis, mas MSG1 ja foi processada separadamente. Resultado: **acoes duplicadas** (ex: T2-T5 criaram 2 eventos cada vez, um para cada mensagem).

---

## Bug Critico #2 — CONTAMINACAO REDIS ENTRE SESSOES

**Severidade:** CRITICA
**Descricao:** O Redis Chat Memory acumula historico sem limite. Mensagens de testes anteriores (e ate de sessoes passadas) aparecem como `confirmados` no Code9.

**Evidencia T1:**
- MSG1 enviada: "reuniao amanha as 18h"
- Code9 mensagem_principal: "Me manda o relatorio do mes" (MENSAGEM DE SESSAO ANTERIOR!)
- Classificador: `gerar_relatorio` (correto para a mensagem que recebeu, errado para a que foi enviada)

**Evidencia T11:**
- MSG1 enviada: "minha agenda de amanha"
- MSG2 enviada: "e me manda o relatorio do mes"
- Code9 mensagem_principal em AMBAS execucoes: "reuniao amanha 15h" (MSG DO T10!)
- Historico confirmados: 5 entradas de "reuniao amanha as 18h" de testes anteriores
- Resultado: IA respondeu "Consigo te ajudar com agenda e gastos" e "Nao consegui identificar o evento" — mensagens reais do T11 NUNCA foram processadas

**Causa raiz:** O Code9 extrai `mensagem_principal` do buffer Redis, mas o buffer nao eh limpo corretamente entre interacoes.

---

## Bug Critico #3 — GASTO VIRA EVENTO DE AGENDA

**Severidade:** CRITICA
**Teste:** T7
**Descricao:** MSG2 "gastei 45 reais no almoco" foi classificada como `criar_evento_agenda` e o AI Agent criou um evento chamado "Gastei R$45 no Almoco" no calendario.

**Causa raiz:** O debounce nao agrupou as msgs. Premium #2 recebeu MSG1 ("reuniao com cliente amanha 10h") como mensagem_principal via Code9. O classificador viu "reuniao amanha 10h" e retornou `criar_evento_agenda`. O AI Agent, que via ambas as mensagens no Redis, tentou processar MSG2 dentro do contexto de agenda, criando um evento absurdo.

---

## Tabela Completa de Resultados

### GRUPO A — Reproducao (5 testes identicos)

| Teste | Exec Premium | mensagem_principal (Code9) | Branch classificador | Acao AI | Correto? |
|-------|-------------|---------------------------|---------------------|---------|----------|
| **T1** | 13607 | "Me manda o relatorio do mes" | gerar_relatorio | Relatorio sendo gerado | ERRADO (contaminacao Redis) |
| | 13610 | "depois de amanha as 22h" | criar_evento_agenda | Compromisso 03/04 22h | OK |
| **T2** | 13613 | "reuniao amanha as 18h" | criar_evento_agenda | Reuniao 02/04 18h | OK |
| | 13615 | "reuniao amanha as 18h" | criar_evento_agenda | Reuniao 03/04 22h | PARCIAL (processou MSG2 via Redis) |
| **T3** | 13619 | "reuniao amanha as 18h" | criar_evento_agenda | Reuniao 02/04 18h | OK |
| | 13621 | "reuniao amanha as 18h" | criar_evento_agenda | Reuniao 03/04 22h | PARCIAL |
| **T4** | 13625 | "reuniao amanha as 18h" | criar_evento_agenda | Reuniao 02/04 18h | OK |
| | 13627 | "reuniao amanha as 18h" | criar_evento_agenda | Reuniao 03/04 22h | PARCIAL |
| **T5** | 13631 | "reuniao amanha as 18h" | criar_evento_agenda | Reuniao 02/04 18h | OK |
| | 13633 | "reuniao amanha as 18h" | criar_evento_agenda | Reuniao 03/04 22h | PARCIAL |

**Padrao Grupo A (T2-T5):** Consistente. Exec #1 cria evento MSG1 correto. Exec #2 cria evento MSG2 correto MAS com mensagem_principal de MSG1 (confuso para debug). Ambas as mensagens sao processadas, porem duplicam o processamento de MSG1.

### GRUPO B — Cenarios variados

| Teste | Exec Premium | mensagem_principal | Branch | Acao AI | Correto? |
|-------|-------------|-------------------|--------|---------|----------|
| **T6** | 13637 | "dentista sexta as 14h" | criar_evento_agenda | Dentista 03/04 14h | OK |
| | 13639 | "dentista sexta as 14h" | criar_evento_agenda | Academia 02/04 7h | PARCIAL (absorveu MSG2) |
| **T7** | 13643 | "reuniao com cliente amanha 10h" | criar_evento_agenda | Reuniao Cliente 02/04 10h | OK |
| | 13645 | "reuniao com cliente amanha 10h" | criar_evento_agenda | **"Gastei R$45 no Almoco" como EVENTO** | **BUG CRITICO** |
| **T8** | 13649 | "reuniao amanha 9h" | criar_evento_agenda | ? (output vazio) | FALHA |
| | 13651 | "reuniao amanha 9h" | criar_evento_agenda | Almoco com Joao 12h | PARCIAL (MSG2 virou evento, MSG1 perdida) |
| | 13653 | "reuniao amanha 9h" | criar_evento_agenda | Almoco com Joao 12h (duplicado) | ERRADO (MSG3 "cancela dentista" PERDIDA) |
| **T9** | 13660 | "uber 27,90" | criar_gasto | Uber R$27,90 | OK |
| | 13662 | "uber 27,90" | criar_gasto | Mercado R$150 | OK (absorveu MSG2 corretamente) |
| **T10** | 13666 | "reuniao amanha 15h" | criar_evento_agenda | Reuniao 02/04 15h | OK |
| | 13668 | "reuniao amanha 15h" | criar_evento_agenda | Evento ATUALIZADO 02/04 16h | OK (correcao funcionou!) |
| **T11** | 13671 | "reuniao amanha 15h" (ERRADO!) | criar_evento_agenda | "Consigo te ajudar com agenda e gastos" | **ERRADO** (msgs reais nunca chegaram) |
| | 13673 | "reuniao amanha 15h" (ERRADO!) | criar_evento_agenda | "Nao consegui identificar o evento" | **ERRADO** |
| **T12** | 13676 | "reuniao amanha as 18h" | criar_evento_agenda | Reuniao 02/04 18h | OK |

---

## Erros de Infraestrutura (Nao-Criticos)

### Calendar Workflow — Tabela `log_total` inexistente

**Ocorrencia:** 17 execucoes com erro
**Node:** `Create a row1`
**Erro:** `Could not find the table 'public.log_total' in the schema cache`
**Impacto:** O evento eh criado com sucesso no Google Calendar e no Supabase. O erro ocorre apenas no node de logging final. **Funcionalidade nao afetada, apenas o log.**

### Financeiro Workflow — Mesma tabela `log_total`

**Ocorrencia:** 2 execucoes (T9)
**Impacto:** Gasto registrado com sucesso. Log falha.

### Report Workflow — Mesma tabela `log_total`

**Ocorrencia:** 2 execucoes (T1, T11)
**Impacto:** Relatorio nao pode ser gerado (workflow falha antes de completar).

---

## Analise do Debounce — Como Funciona (e Nao Funciona)

### Fluxo Atual

```
MSG1 → Webhook → Main #1 → Premium #1 (pushRedisMessage → firstGet → Code9 → classificador → AI Agent)
MSG2 (2s depois) → Webhook → Main #2 → Premium #2 (pushRedisMessage → firstGet → Code9 → classificador → AI Agent)
```

### O Que Redis Faz

O Premium workflow tem um mecanismo de acumulacao Redis:
1. `pushRedisMessage` — grava a msg no Redis
2. `firstGet` — le TODAS as msgs acumuladas
3. `Code9` — processa o buffer e extrai `mensagem_principal` e `confirmados`

**Porem:** Cada execucao Premium roda independentemente. Nao ha lock, nao ha debounce timer, nao ha merge. O Redis serve como HISTORICO, nao como buffer de debounce.

### O Que Seria Esperado

1. MSG1 chega → sistema espera N segundos por msgs adicionais
2. MSG2 chega dentro da janela → sistema acumula
3. Janela fecha → UMA UNICA execucao Premium processa MSG1+MSG2 juntas
4. Classificador ve ambas as intencoes e decide como tratar

---

## Diagnostico por Camada (Protocolo 5 Camadas)

| Camada | Status | Detalhe |
|--------|--------|---------|
| 1. CLASSIFICADOR | PARCIAL | Funciona quando recebe a mensagem correta. Falha quando Code9 entrega mensagem contaminada do Redis |
| 2. AI AGENT | PARCIAL | Processa corretamente o que recebe, mas as vezes ve msgs contraditórias no historico Redis e gera respostas confusas |
| 3. TOOL HTTP | OK | Calendar Webhook, Financeiro Webhook funcionam |
| 4. SUPABASE | PARCIAL | Operacoes funcionam, mas tabela `log_total` nao existe (apenas logging) |
| 5. RESPOSTA | PARCIAL | Correta quando classificador e AI Agent recebem dados corretos |

**Causa raiz principal:** Ausencia de debounce real + contaminacao do Redis Chat Memory.

---

## Recomendacoes

### Prioridade 1 (Critica) — Implementar Debounce Real

O sistema precisa de um mecanismo que:
1. Receba MSG1 no webhook
2. Armazene em buffer temporario (Redis key com TTL)
3. Inicie timer de N segundos (ex: 3-5s)
4. Se MSG2 chega antes do timer: reseta timer, acumula
5. Quando timer expira: dispara UMA execucao Premium com todas as msgs

### Prioridade 2 (Critica) — Limpar Redis Chat Memory

O Code9 precisa distinguir entre:
- Mensagens do buffer atual (novas, nao processadas)
- Historico de conversas anteriores (ja processadas)

### Prioridade 3 (Media) — Criar tabela `log_total`

A tabela `public.log_total` nao existe no Supabase. Todos os workflows que tentam logar nela falham. Criar a tabela ou remover os nodes de logging.

### Prioridade 4 (Baixa) — Classificador multi-intencao

Quando o debounce agrupar mensagens de intencoes diferentes (ex: evento + gasto), o classificador precisa detectar multi-intencao e rotear para branches paralelos.

---

## Dados Brutos — Execucoes

| ID | Workflow | Status | Started |
|----|----------|--------|---------|
| 13606 | Main | success | 14:14:58 |
| 13607 | Premium | success | 14:14:59 |
| 13608 | Report | error | 14:15:02 |
| 13609 | Main | success | 14:15:37 |
| 13610 | Premium | success | 14:15:37 |
| 13611 | Calendar | error | 14:15:40 |
| 13612 | Main | success | 14:21:37 |
| 13613 | Premium | success | 14:21:37 |
| 13614 | Main | success | 14:21:39 |
| 13615 | Premium | success | 14:21:39 |
| 13616 | Calendar | error | 14:21:43 |
| 13617 | Calendar | error | 14:21:43 |
| 13618 | Main | success | 14:22:52 |
| 13619 | Premium | success | 14:22:52 |
| 13620 | Main | success | 14:22:54 |
| 13621 | Premium | success | 14:22:54 |
| 13622 | Calendar | error | 14:22:58 |
| 13623 | Calendar | error | 14:22:58 |
| 13624 | Main | success | 14:23:33 |
| 13625 | Premium | success | 14:23:33 |
| 13626 | Main | success | 14:23:36 |
| 13627 | Premium | success | 14:23:36 |
| 13628 | Calendar | error | 14:23:39 |
| 13629 | Calendar | error | 14:23:39 |
| 13630 | Main | success | 14:24:29 |
| 13631 | Premium | success | 14:24:29 |
| 13632 | Main | success | 14:24:31 |
| 13633 | Premium | success | 14:24:31 |
| 13634 | Calendar | error | 14:24:35 |
| 13635 | Calendar | error | 14:24:35 |
| 13636 | Main | success | 14:28:20 |
| 13637 | Premium | success | 14:28:20 |
| 13638 | Main | success | 14:28:22 |
| 13639 | Premium | success | 14:28:22 |
| 13640 | Calendar | error | 14:28:25 |
| 13641 | Calendar | error | 14:28:25 |
| 13642 | Main | success | 14:29:48 |
| 13643 | Premium | success | 14:29:48 |
| 13644 | Main | success | 14:29:50 |
| 13645 | Premium | success | 14:29:51 |
| 13646 | Calendar | error | 14:29:54 |
| 13647 | Calendar | error | 14:29:54 |
| 13648 | Main | success | 14:31:58 |
| 13649 | Premium | success | 14:31:59 |
| 13650 | Main | success | 14:32:01 |
| 13651 | Premium | success | 14:32:01 |
| 13652 | Main | success | 14:32:03 |
| 13653 | Premium | success | 14:32:04 |
| 13654 | Calendar | error | 14:32:05 |
| 13655 | Calendar | error | 14:32:05 |
| 13656 | Calendar | success | 14:32:06 |
| 13657 | Calendar | error | 14:32:18 |
| 13658 | Calendar | error | 14:32:18 |
| 13659 | Main | success | 14:34:17 |
| 13660 | Premium | success | 14:34:17 |
| 13661 | Main | success | 14:34:19 |
| 13662 | Premium | success | 14:34:20 |
| 13663 | Financeiro | error | 14:34:23 |
| 13664 | Financeiro | error | 14:34:23 |
| 13665 | Main | success | 14:35:06 |
| 13666 | Premium | success | 14:35:06 |
| 13667 | Main | success | 14:35:08 |
| 13668 | Premium | success | 14:35:08 |
| 13669 | Calendar | error | 14:35:11 |
| 13670 | Main | success | 14:38:09 |
| 13671 | Premium | success | 14:38:09 |
| 13672 | Main | success | 14:38:12 |
| 13673 | Premium | success | 14:38:12 |
| 13674 | Report | error | 14:38:15 |
| 13675 | Main | success | 14:39:07 |
| 13676 | Premium | success | 14:39:08 |
| 13677 | Calendar | error | 14:39:11 |

---

*— Lupa, constatando com precisao*
