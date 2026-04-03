# RELATÓRIO — Bateria de Testes: Correção Prompt Padrão

**Data:** 2026-04-03 20:35–20:45 UTC  
**Executado por:** Lupa (auditor-360)  
**Ambiente:** N8N DEV (76.13.172.17:5678)  
**User de teste:** Luiz Felipe (554391936205)  
**Total de testes:** 40  

---

## RESUMO EXECUTIVO

| Métrica | Valor |
|---------|-------|
| Testes enviados | 40/40 |
| Main workflow (success) | 40/40 |
| Sub-workflows com ERRO | 6 |
| AI Agent executou | 8/40 (20%) |
| Classificação correta | ~7/40 (17.5%) |
| **Testes efetivamente funcionais** | **~8/40 (20%)** |

### Veredicto: FAIL CRÍTICO

---

## BUG #1 — DEBOUNCE CONGELADO (SEVERIDADE: CRÍTICA)

### Sintoma
A partir do T12, **todos os 29 testes seguintes** (T12–T40) recebem a `mensagem_principal` do T12 ("cria uma meta de gastar no máximo 500 reais por mês com delivery"), independentemente do conteúdo real enviado.

### Causa Raiz
O node **Code9** (Debounce Merge) não está resetando a `mensagem_principal` entre execuções do mesmo user. As mensagens da bateria são enviadas com ~5s de intervalo — o debounce as trata como "rafale" do mesmo usuário e congela na primeira `mensagem_principal` encontrada.

### Evidência

| Teste | Mensagem Enviada | msg_principal no Code9 |
|-------|-----------------|----------------------|
| T12 | "cria uma meta de gastar no máximo 500 reais" | cria uma meta de gastar no máximo 500 reais ✅ |
| T13 | "agenda de hoje" | cria uma meta de gastar no máximo 500 reais ❌ |
| T19 | "oi" | cria uma meta de gastar no máximo 500 reais ❌ |
| T28 | "me conta uma piada" | cria uma meta de gastar no máximo 500 reais ❌ |
| T35 | "café 8 reais" | cria uma meta de gastar no máximo 500 reais ❌ |
| T40 | "quanto já gastei esse mês com alimentação" | cria uma meta de gastar no máximo 500 reais ❌ |

### Impacto
- 29 de 40 mensagens (72.5%) foram classificadas com base na mensagem ERRADA
- Todas classificadas como `criar_limite` — branch que NÃO tem handler no Switch
- Resultado: **zero resposta ao usuário** para 29 testes

### Onde investigar
- Node: **Code9** — lógica de merge/debounce
- Node: **Gerar Debounce ID** + **Set Debounce Owner** + **Get Debounce Owner** — ciclo de vida do debounce
- Redis: chave do debounce não está expirando entre mensagens

---

## BUG #2 — BRANCH "criar_limite" SEM HANDLER (SEVERIDADE: ALTA)

### Sintoma
Quando o classificador retorna `{"branch": "criar_limite"}`, o **Switch - Branches1** não encontra match (0 items). O fluxo MORRE ali. Nenhuma resposta é enviada ao usuário.

### Evidência
- T04, T12-T40: classificados como `criar_limite` → Switch - Branches1 (0 items) → FIM
- O node AI Agent **NÃO executa** para essa branch

### Impacto
Qualquer mensagem real do usuário sobre limites/metas financeiras simplesmente **não recebe resposta**.

### Onde corrigir
- Node: **Switch - Branches1** — adicionar case para `criar_limite` que direcione para o AI Agent ou handler adequado

---

## BUG #3 — TABELA `log_total` NÃO EXISTE (SEVERIDADE: MÉDIA)

### Sintoma
3 workflows secundários falharam tentando inserir em `public.log_total`:

| Exec ID | Workflow | Node com Erro |
|---------|----------|---------------|
| 13789 | Financeiro - Total | Create a row1 |
| 13790 | Financeiro - Total | Create a row1 |
| 13803 | Financeiro - Total | Create a row1 |
| 13779 | Calendar WebHooks | Create a row1 |
| 13782 | Calendar WebHooks | Create a row1 |

### Erro
```
Could not find the table 'public.log_total' in the schema cache
```

### Impacto
- O registro financeiro (gasto) É criado com sucesso, mas o LOG da operação falha
- O evento de agenda É criado, mas o LOG falha
- A operação principal funciona, mas a auditoria/tracking está quebrada

### Causa
A tabela `log_total` foi removida ou renomeada no Supabase principal, mas os workflows ainda referenciam ela.

---

## BUG #4 — GOTENBERG OFFLINE (SEVERIDADE: BAIXA)

### Sintoma
O workflow "Report Unificado" falhou ao tentar gerar PDF.

| Exec ID | Node | Erro |
|---------|------|------|
| 13793 | gotenberg-pdf | DNS server returned error — server offline |

### Causa
O container `totalassistente-gotenberg` não está rodando no ambiente DEV.

---

## BUG #5 — DEBOUNCE CROSS-CONTAMINATION (SEVERIDADE: ALTA)

### Sintoma
Mensagens enviadas com poucos segundos de diferença são DEBOUNCED juntas, como se fossem uma única mensagem do usuário:

| Testes Mesclados | Mensagem Combinada no Code9 |
|-----------------|---------------------------|
| T04 + T05 | "almoco 32 reais, registra netflix 55 reais todo mês" |
| T07 + T08 | "me lembra de tomar remédio todo dia às 21h, quanto eu tenho na conta?" |

### Impacto
- O classificador vê uma mensagem diferente da que o usuário realmente enviou
- Pode gerar classificação errada e respostas confusas
- Em uso real, mensagens enviadas em sequência rápida serão mescladas

---

## RESULTADOS DETALHADOS POR TESTE

### Testes que FUNCIONARAM (com ressalvas)

| # | Prompt | Classificação | Ação | Resposta IA |
|---|--------|--------------|------|-------------|
| T01 | me avisa 1h antes da reunião de amanhã às 15h | criar_evento_agenda ✅ | criar_evento ✅ | Evento agendado! Reunião 04/04 15h00 |
| T02 | coloca dentista quinta às 10h | criar_evento_agenda ✅ | criar_evento ✅ | Evento agendado! Dentista 09/04 10h00 |
| T03 | todo dia às 8h mande meus compromissos | criar_evento_recorrente ⚠️ | padrao | "Não consigo enviar mensagens programadas" |
| T05 | almoco 32 reais (+T04 debounced) | criar_gasto ✅ | registrar_gasto ✅ | Almoço R$32 + Netflix R$55 |
| T06 | resumo da semana todo domingo | gerar_relatorio ⚠️ | padrao | "Seu relatório está sendo gerado" |
| T07 | quanto eu tenho na conta (+T08 debounced) | buscar ✅ | padrao ✅ | Saldo: R$-19.708.168,43 |
| T10 | gastei 150 no mercado | criar_gasto ✅ | registrar_gasto ✅ | Mercado R$150 |
| T11 | me avisa 30 min antes da consulta | criar_evento_agenda ⚠️ | padrao | "Preciso saber qual consulta e quando" |

### Testes SILENCIADOS pelo debounce/classificador

| # | Prompt | Classificação Real | Classificação Esperada |
|---|--------|-------------------|----------------------|
| T04 | registra netflix 55 reais todo mês | criar_limite ❌ | criar_gasto |
| T09 | sempre que eu criar evento, cria lembrete | criar_evento_agenda ❌ | padrao |
| T12 | meta de gastar máximo 500 com delivery | criar_limite ✅ | criar_limite (mas sem handler!) |
| T13 | agenda de hoje | criar_limite ❌ | consultar_agenda |
| T14 | quanto gastei essa semana | criar_limite ❌ | buscar |
| T15 | me manda relatório todo dia 1 | criar_limite ❌ | padrao |
| T16 | paga o boleto da internet | criar_limite ❌ | padrao (fora do escopo) |
| T17 | reunião com carlos segunda 14h | criar_limite ❌ | criar_evento_agenda |
| T18 | me avise 1 dia antes de cada compromisso | criar_limite ❌ | padrao |
| T19 | oi | criar_limite ❌ | padrao |
| T20 | o que você consegue fazer? | criar_limite ❌ | padrao |
| T21 | registra aluguel 1500 todo dia 5 | criar_limite ❌ | criar_gasto |
| T22 | me lembra 15 min antes do dentista | criar_limite ❌ | padrao/criar_lembrete |
| T23 | qual o melhor investimento pra 10 mil? | criar_limite ❌ | padrao |
| T24 | transfere 200 reais pra minha mãe | criar_limite ❌ | padrao (fora do escopo) |
| T25 | coloca academia seg qua sex às 7h | criar_limite ❌ | criar_evento_agenda |
| T26 | gasto com uber na categoria transporte | criar_limite ❌ | padrao |
| T27 | quero ver gastos num gráfico | criar_limite ❌ | padrao |
| T28 | me conta uma piada | criar_limite ❌ | padrao |
| T29 | recebi 3500 de salário hoje | criar_limite ❌ | criar_gasto (entrada) |
| T30 | cancela todos os meus lembretes | criar_limite ❌ | padrao |
| T31 | me avisa 3h antes do voo sábado 14h | criar_limite ❌ | criar_evento_agenda |
| T32 | cria um orçamento mensal | criar_limite ❌ | padrao/criar_limite |
| T33 | aniversário da maria dia 15 de maio | criar_limite ❌ | criar_evento_agenda |
| T34 | exporta meus gastos em pdf | criar_limite ❌ | gerar_relatorio |
| T35 | café 8 reais | criar_limite ❌ | criar_gasto |
| T36 | quando falar gym, registrar academia 80 | criar_limite ❌ | padrao |
| T37 | semana que vem tenho o que? | criar_limite ❌ | consultar_agenda |
| T38 | posso mandar áudio? | criar_limite ❌ | padrao |
| T39 | quero ser avisado na véspera de cada evento | criar_limite ❌ | padrao |
| T40 | quanto gastei esse mês com alimentação | criar_limite ❌ | buscar |

---

## ERROS EM SUB-WORKFLOWS

| Exec ID | Workflow | Node | Erro | Teste Associado |
|---------|----------|------|------|----------------|
| 13779 | Calendar WebHooks | Create a row1 | `log_total` table not found | T01 (criar reunião) |
| 13782 | Calendar WebHooks | Create a row1 | `log_total` table not found | T02 (criar dentista) |
| 13789 | Financeiro - Total | Create a row1 | `log_total` table not found | T05 (almoco/netflix) |
| 13790 | Financeiro - Total | Create a row1 | `log_total` table not found | T05 (almoco/netflix) |
| 13793 | Report Unificado | gotenberg-pdf | DNS error - offline | T06 (relatório) |
| 13803 | Financeiro - Total | Create a row1 | `log_total` table not found | T10 (mercado) |

---

## PLANO DE AÇÃO

### P0 — URGENTE (bloqueia uso real)

1. **Corrigir Code9 (Debounce Merge)** — A `mensagem_principal` deve refletir a ÚLTIMA mensagem da rafale, não ficar congelada na primeira. Investigar se o Redis está expirando a chave de debounce corretamente entre mensagens isoladas (intervalo > 3s deveria ser tratado como mensagem nova).

2. **Adicionar handler para branch `criar_limite` no Switch - Branches1** — Atualmente essa branch cai no vazio. Deve direcionar para o AI Agent ou um handler de limites financeiros.

### P1 — ALTA

3. **Corrigir/remover referência à tabela `log_total`** — Nos workflows Financeiro-Total e Calendar-WebHooks, o node "Create a row1" referencia `public.log_total` que não existe. Atualizar para a tabela correta ou remover se o log foi descontinuado.

4. **Revisar janela de debounce** — Mensagens com >3s de intervalo estão sendo mescladas. Definir threshold adequado (ex: 1.5s) para evitar cross-contamination em conversas normais.

### P2 — MÉDIA

5. **Subir container Gotenberg no DEV** — Para que relatórios em PDF funcionem no ambiente de teste.

6. **Limpar histórico Redis do user de teste** — O chat memory tem centenas de mensagens antigas de auditorias anteriores, poluindo o contexto do classificador.

---

## EXECUÇÕES DE REFERÊNCIA

| Teste | Main Exec | Sub-Workflow Exec | Sub-Workflow Errors |
|-------|-----------|-------------------|-------------------|
| T01 | 13777 | 13778 | 13779 (Calendar log_total) |
| T02 | 13780 | 13781 | 13782 (Calendar log_total) |
| T03 | 13783 | 13784 | — |
| T04 | 13785 | 13786 | — |
| T05 | 13787 | 13788 | 13789, 13790 (Financeiro log_total) |
| T06 | 13791 | 13792 | 13793 (Report Gotenberg) |
| T07 | 13794 | 13795 | — |
| T08 | 13797 | 13798 | — |
| T09 | 13799 | 13800 | — |
| T10 | 13801 | 13802 | 13803 (Financeiro log_total) |
| T11 | 13804 | 13805 | — |
| T12 | 13806 | 13807 | — |
| T13-T40 | 13808-13862 | 13809-13863 | — (silenciados) |

---

*— Lupa, constatando com precisão 🔎*
