# MEGA ESTUDO — Análise Consolidada de Bugs do Total Assistente

**Data:** 2026-04-03  
**Fonte:** 3 baterias de testes (68 testes, 121 execuções N8N)  
**Período coberto:** 2026-04-01 a 2026-04-03  
**Ambiente:** N8N DEV (76.13.172.17:5678)

---

## 1. INVENTÁRIO TOTAL DE BUGS

Foram identificados **12 bugs únicos** cruzando as 3 baterias. Alguns aparecem em múltiplas baterias, confirmando que são problemas sistêmicos.

| # | Bug | Severidade | Baterias onde aparece | Escopo afetado |
|---|-----|-----------|----------------------|----------------|
| B01 | Debounce inexistente/quebrado | CRÍTICO | Debounce, Prompt Padrão | Todas as features |
| B02 | Contaminação Redis (cross-session) | CRÍTICO | Debounce, Prompt Padrão | Todas as features |
| B03 | end_event não acompanha start_event | CRÍTICO | Edição/Exclusão | Edição de agenda |
| B04 | IA confirma ação que não aconteceu | CRÍTICO | Edição/Exclusão | Edição de agenda |
| B05 | IA "edita" evento inexistente (fantasma) | CRÍTICO | Edição/Exclusão | Edição de agenda |
| B06 | Branch `criar_limite` sem handler | ALTO | Prompt Padrão | Limites financeiros |
| B07 | Classificador confunde nome com intenção | ALTO | Edição/Exclusão | Criação/Exclusão |
| B08 | Gasto classificado como evento de agenda | ALTO | Debounce | Gastos + Agenda |
| B09 | Tabela `log_total` não existe | MÉDIO | Debounce, Prompt Padrão | Logging/Auditoria |
| B10 | Hard delete sem soft delete | MÉDIO | Edição/Exclusão | Exclusão de agenda |
| B11 | Debounce cross-contamination (merge errado) | MÉDIO | Prompt Padrão | Todas as features |
| B12 | Gotenberg offline no DEV | BAIXO | Prompt Padrão | Relatórios PDF |

---

## 2. ANÁLISE POR CAMADA DO SISTEMA

### Camada 1: WEBHOOK / DEBOUNCE (Main Workflow)

**Bugs:** B01, B02, B11  
**Impacto:** CATASTRÓFICO — afeta 100% das mensagens

O debounce é o primeiro ponto de contato. Se ele falha, TUDO depois recebe dados errados.

**O que acontece:**
- Não existe debounce real. Cada mensagem dispara pipeline independente.
- O Code9 extrai `mensagem_principal` do Redis, mas o Redis acumula histórico de sessões anteriores sem limpeza.
- Quando o usuário envia 2 msgs rápidas, elas são processadas em paralelo — a segunda "absorve" a primeira via Redis, gerando duplicação.
- Na bateria Prompt Padrão, o debounce CONGELOU a partir do T12: todas as 29 mensagens seguintes foram classificadas usando a mensagem do T12.

**Evidência quantitativa:**
- Bateria Debounce: 0/12 testes com debounce efetivo
- Bateria Prompt Padrão: 29/40 mensagens (72.5%) processadas com mensagem ERRADA
- Bateria Debounce: 3 mensagens completamente PERDIDAS (nunca processadas)

**Conclusão:** O debounce é o bug mais destrutivo do sistema. Ele transforma todos os outros bugs em cascata.

---

### Camada 2: CLASSIFICADOR (Switch/Router)

**Bugs:** B06, B07, B08  
**Impacto:** ALTO — afeta roteamento correto

**O que acontece:**
- O classificador funciona CORRETAMENTE quando recebe a mensagem certa (75% de acurácia na bateria debounce com mensagens corretas).
- Porém, quando o debounce entrega mensagem contaminada, o classificador roteia para a branch errada.
- A branch `criar_limite` existe no classificador mas NÃO tem handler no Switch — mensagens caem no vazio.
- Palavras no NOME do evento ("excluir teste") são interpretadas como INTENÇÃO de exclusão.

**Evidência:**
- T12-T40 (Prompt Padrão): 29 mensagens classificadas como `criar_limite` por debounce congelado → zero resposta
- S3 (Edição): "marca reuniao excluir teste" → classificou como exclusão em vez de criação
- T7 (Debounce): gasto de R$45 virou evento de agenda por classificação errada

**Conclusão:** O classificador em si não é o problema principal. O problema é o que ele RECEBE (debounce) e o que acontece DEPOIS (handlers ausentes).

---

### Camada 3: AI AGENT (Execução)

**Bugs:** B04, B05  
**Impacto:** CRÍTICO — destrói confiança do usuário

**O que acontece:**
- O AI Agent responde "Prontinho" ANTES de verificar se a ação realmente aconteceu.
- Quando o Calendar WebHooks falha silenciosamente, o usuário recebe confirmação de algo que não ocorreu.
- O Agent também "edita" eventos que não existem — chamou `editar_eventos` para "Aula de Natação" que nunca foi criada, e confirmou a edição.

**Evidência:**
- MOD-Q4: IA disse "mudei pro dia 7" mas banco continua dia 4 — campos errados enviados (`data_inicio_evento` vs `novo_inicio_evento`)
- MOD-B3: IA "editou" Aula de Natação inexistente e disse "Prontinho"
- MOD-C2: Start mudou pro dia 10 mas end ficou no dia 5 — IA confirmou como sucesso

**Conclusão:** O Agent tem um problema de DESIGN: ele gera resposta antes de ter feedback da tool. Isso é exatamente o tipo de BLEFE que o post-mortem do jau.mj identificou — a IA confirma sem ter certeza.

---

### Camada 4: TOOLS / WEBHOOKS (Calendar WebHooks, Financeiro)

**Bugs:** B03, B10  
**Impacto:** CRÍTICO (B03) — corrompe dados no banco

**O que acontece:**
- O nó `Edit Fields5` no Calendar WebHooks usa fallback errado para `novo_fim_evento`:
  ```
  novo_fim = body.novo_fim_evento || output[0].fim_evento
  ```
  Quando o Agent não envia `novo_fim_evento`, o fallback pega o fim ORIGINAL. Se o start mudou, o end fica antes do start.
- A exclusão usa DELETE real (hard delete) no Supabase, sem `active=false`. Sem rollback, sem audit trail.

**Evidência:**
- MOD-Q1: start=15:00, end=14:30 (end ANTES do start!)
- MOD-C2: start=dia 10, end=dia 5 (end 5 DIAS antes do start!)
- Google Calendar rejeitou ambos com "time range is empty"
- DEL-Q2: evento excluído fisicamente do banco, sem registro

**Conclusão:** Edit Fields5 é uma bomba-relógio. Toda edição de horário que não envie `novo_fim_evento` explicitamente corrompe o dado.

---

### Camada 5: INFRAESTRUTURA (Supabase, Redis, Gotenberg)

**Bugs:** B09, B12  
**Impacto:** MÉDIO — não afeta funcionalidade core, mas afeta auditoria

**O que acontece:**
- A tabela `log_total` foi removida do Supabase mas 3 workflows ainda referenciam ela (Calendar, Financeiro, Report).
- Gotenberg (gerador de PDF) não está rodando no DEV.

**Evidência:**
- 26 execuções falharam por `log_total` nas 3 baterias (17+5+2+2)
- A funcionalidade principal (criar evento, registrar gasto) funciona — apenas o log falha
- Relatórios PDF não podem ser gerados no DEV

---

## 3. MAPA DE DEPENDÊNCIA ENTRE BUGS

```
B01 (Debounce quebrado)
 ├── causa → B02 (Contaminação Redis)
 ├── causa → B08 (Gasto vira evento)
 ├── causa → B11 (Cross-contamination)
 └── amplifica → B07 (Classificador confuso)

B03 (end_event não acompanha)
 └── amplificado por → B04 (IA confirma sem verificar)

B05 (Evento fantasma)
 └── causado por → B04 (IA confirma sem verificar)

B06 (Branch sem handler)
 └── amplificado por → B01 (Debounce manda tudo pra criar_limite)

B09 (log_total) ← independente
B10 (Hard delete) ← independente
B12 (Gotenberg) ← independente
```

**Insight principal:** Corrigir B01 (debounce) resolve ou reduz significativamente B02, B08 e B11. Corrigir B04 (validação pós-tool) resolve B05. São os dois pontos de alavancagem máxima.

---

## 4. TAXA DE SUCESSO REAL POR FEATURE

### Criar Evento de Agenda
| Bateria | Tentativas | Sucesso Real | Taxa |
|---------|-----------|-------------|------|
| Debounce | 10 | 7 (com duplicatas) | 70% |
| Prompt Padrão | 2 | 2 | 100% |
| Edição (setup) | 6 | 5 | 83% |
| **TOTAL** | **18** | **14** | **78%** |

**Nota:** A taxa de 78% esconde que em uso real (bateria Debounce), vários eventos foram DUPLICADOS — o usuário pediu 1 e recebeu 2.

### Editar Evento de Agenda
| Teste | Sucesso Real | Problema |
|-------|-------------|---------|
| MOD-Q1 | ⚠️ Parcial | end_event incoerente |
| MOD-Q2 | ✅ | — |
| MOD-Q3 | ✅ | — |
| MOD-Q4 | ❌ | IA mentiu, nada mudou |
| MOD-Q5 | ✅ | — |
| MOD-B1 | ✅ | — |
| MOD-B2 | ✅ | — |
| MOD-B3 | ❌ | Evento fantasma |
| MOD-B4 | ✅ | Pediu clarificação |
| MOD-C2 | ⚠️ Parcial | end_event corrompido |
| MOD-C3 | ✅ | Recusou data passada |
| **TOTAL** | **6/11 (55%)** | **3 falhas graves, 2 parciais** |

### Excluir Evento de Agenda
| Teste | Sucesso Real | Problema |
|-------|-------------|---------|
| DEL-Q1 | ⏭️ Skip | Setup falhou |
| DEL-Q2 | ❌ | Hard delete, sem audit |
| DEL-Q3 | ✅ | Não encontrou (correto) |
| DEL-Q6 | ✅ | Pediu confirmação (correto) |
| **TOTAL** | **2/3 (67%)** | |

### Registrar Gasto
| Bateria | Tentativas | Sucesso | Taxa |
|---------|-----------|---------|------|
| Debounce | 2 | 2 | 100% |
| Prompt Padrão | 3 | 3 | 100% |
| **TOTAL** | **5/5** | **100%** |

### Consultar (buscar agenda/gastos)
| Bateria | Tentativas | Sucesso | Taxa |
|---------|-----------|---------|------|
| Prompt Padrão | 1 | 1 | 100% |
| **Nota:** Amostra muito pequena para conclusão. |

### Modo Padrão (conversacional)
| Bateria | Tentativas | Sucesso | Taxa |
|---------|-----------|---------|------|
| Prompt Padrão | ~5 avaliáveis | 2 | ~40% |
| **Nota:** Maioria silenciada pelo debounce congelado |

---

## 5. CLASSIFICAÇÃO DE RISCO POR ESCOPO

### 🔴 RISCO CRÍTICO — Pode causar DANO ao usuário

| Escopo | Bug(s) | Dano |
|--------|--------|------|
| Edição de agenda | B03, B04, B05 | Dados corrompidos (end < start), compromissos no horário errado, edição fantasma |
| Debounce | B01, B02 | Qualquer feature pode falhar, mensagens perdidas, duplicação |

**Por que é crítico:** O usuário confia na IA para gerenciar sua agenda real. Se a IA diz "mudei pra 15h" mas não mudou, ou se o end_event fica antes do start, o Google Calendar fica inconsistente. O usuário pode PERDER compromissos ou chegar no horário errado.

### 🟠 RISCO ALTO — Feature não funciona

| Escopo | Bug(s) | Dano |
|--------|--------|------|
| Limites financeiros | B06 | Branch existe mas não tem handler — zero resposta |
| Classificação | B07 | Nomes com certas palavras geram roteamento errado |
| Gastos + Debounce | B08 | Gasto pode virar evento no calendário |

**Por que é alto:** O usuário não recebe resposta (branch sem handler) ou recebe ação completamente errada (gasto vira evento). Não corrompe dados existentes, mas gera experiência quebrada.

### 🟡 RISCO MÉDIO — Funcionalidade degradada

| Escopo | Bug(s) | Dano |
|--------|--------|------|
| Auditoria | B09, B10 | Sem logs, sem soft delete, sem trail |
| Mensagens rápidas | B11 | Msgs mescladas quando enviadas em sequência |

### ⚪ RISCO BAIXO — Ambiente DEV apenas

| Escopo | Bug(s) | Dano |
|--------|--------|------|
| Relatórios PDF | B12 | Gotenberg offline no DEV |

---

## 6. PRIORIZAÇÃO DE CORREÇÃO

### WAVE 1 — Parar o sangramento (corrigir AGORA)

| # | O que | Onde | Esforço | Impacto |
|---|-------|------|---------|---------|
| 1 | **Edit Fields5 — recalcular end quando start muda** | Calendar WebHooks → Edit Fields5 | Médio | Elimina B03 (dados corrompidos) |
| 2 | **AI Agent — validar resultado antes de "Prontinho"** | Fix Conflito v2 → prompt_editar1 | Médio | Elimina B04, B05 (falsas confirmações) |
| 3 | **prompt_editar1 — documentar campos busca vs edição** | Fix Conflito v2 → prompt_editar1 | Baixo | Reduz B04 (Agent confunde campos) |

**Justificativa:** Esses 3 fixes protegem dados de agenda. Agenda é o core do produto. Dados corrompidos = usuário perde confiança.

### WAVE 2 — Estabilizar o fluxo

| # | O que | Onde | Esforço | Impacto |
|---|-------|------|---------|---------|
| 4 | **Debounce real no Main** | Main Workflow → novo mecanismo | Alto | Elimina B01, reduz B02, B08, B11 |
| 5 | **Limpeza/TTL no Redis Chat Memory** | Code9 / Redis config | Médio | Elimina B02 (contaminação cross-session) |
| 6 | **Handler para branch `criar_limite`** | Fix Conflito v2 → Switch Branches1 | Baixo | Elimina B06 (branch sem saída) |

**Justificativa:** Debounce é o bug mais destrutivo, mas é o fix mais complexo. Deve ser feito com cuidado.

### WAVE 3 — Refinamento

| # | O que | Onde | Esforço | Impacto |
|---|-------|------|---------|---------|
| 7 | **Classificador — priorizar verbo sobre substantivo** | Classificador prompt | Baixo | Reduz B07 |
| 8 | **Soft delete em vez de hard delete** | Calendar WebHooks → delete_supabase | Baixo | Elimina B10 |
| 9 | **Criar/atualizar tabela `log_total`** | Supabase | Baixo | Elimina B09 |
| 10 | **Subir Gotenberg no DEV** | Docker | Baixo | Elimina B12 |

---

## 7. O QUE FUNCIONA BEM (não mexer)

É importante reconhecer o que está sólido:

| Feature | Evidência | Status |
|---------|-----------|--------|
| **Registrar gasto** | 5/5 (100%) em todas as baterias | ✅ Sólido |
| **Rename de evento** | 2/2, preservou Google ID | ✅ Sólido |
| **Edição relativa** (+30min, antecipar) | 2/2 | ✅ Sólido |
| **Clarificação por ambiguidade** | Pediu "qual reunião?" corretamente | ✅ Sólido |
| **Recusar data passada** | Rejeitou "1 de março" | ✅ Sólido |
| **Batch delete com confirmação** | Pediu confirmação antes de excluir 13 | ✅ Sólido |
| **Evento inexistente** (exclusão) | "Não encontrei" corretamente | ✅ Sólido |
| **Criar evento simples** | 78% taxa bruta, 100% quando debounce não interfere | ✅ Sólido (se debounce fixado) |

---

## 8. RELAÇÃO COM O POST-MORTEM ORIGINAL (jau.mj)

O post-mortem do trace `tr_1775066481791_5xnblyk4` identificou que a IA fez BLEFE — prometeu lembrete de 1h antes quando só suporta 30min.

Os guardrails de "Honestidade Operacional" foram adicionados aos prompts Premium e Standard. **Porém, os testes de hoje revelam que o problema é mais profundo:**

| Tipo de blefe | Post-mortem original | Testes de hoje |
|---------------|---------------------|----------------|
| Prometer o que não faz | IA prometeu lembrete 1h | IA diz "Prontinho" sem verificar (B04) |
| Confirmar ação fantasma | — | IA "editou" evento inexistente (B05) |
| Dados silenciosamente errados | — | end_event corrompido sem aviso (B03) |
| Feature sem handler | — | Branch `criar_limite` morre no vazio (B06) |

**Conclusão:** O guardrail de prompt resolve o blefe CONVERSACIONAL (quando a IA promete features). Mas existe um blefe OPERACIONAL mais grave: a IA confirma ações que falharam ou nunca aconteceram. Esse blefe só se resolve com validação pós-tool no workflow, não no prompt.

---

## 9. RESUMO EXECUTIVO

**Estado atual do sistema:** O Total Assistente funciona para o caso MAIS SIMPLES (1 mensagem isolada → 1 ação clara → criar evento ou registrar gasto). Fora desse cenário ideal, o sistema tem falhas em cascata.

**Os 3 problemas mais importantes (por ordem de impacto):**

1. **Debounce quebrado** — Cada mensagem gera pipeline independente. Redis acumula lixo entre sessões. 72.5% dos testes da bateria Prompt Padrão foram processados com a mensagem ERRADA. **Afeta TODAS as features.**

2. **IA confirma sem verificar** — O AI Agent responde "Prontinho" antes de saber se a tool executou com sucesso. Isso gera falsas confirmações de edição, edição de eventos inexistentes, e confiança zero na resposta. **Afeta toda operação de edição.**

3. **end_event não acompanha start_event** — Quando o usuário muda o horário de um evento, o end_event fica no valor antigo, gerando dados corrompidos (end antes do start). Google Calendar rejeita. **Afeta toda edição de horário.**

**Taxa de sucesso real por feature:**
- Criar evento: 78% (100% sem debounce)
- Registrar gasto: 100%
- Editar evento: 55%
- Excluir evento: 67%
- Modo padrão: ~40% (amostral)
- Limites financeiros: 0% (branch sem handler)

---

*Análise consolidada de 3 baterias de teste, 68 testes individuais, 121 execuções N8N.*
