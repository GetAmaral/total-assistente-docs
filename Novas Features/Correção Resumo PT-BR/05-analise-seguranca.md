# 05 — Analise de Seguranca: Metodologia da Aviacao

**Metodologia aplicada:** Swiss Cheese, HFACS, TEM, Just Culture, SMS, LOSA, Kaizen
**Base:** Documentacao de pesquisa em `aios-core/docs/research/aviation-safety-methodology/`
**Correlacao squad-aviacao:** `15-correlacao-squad-auditor.md`
**Caso de estudo complementar:** BBBK (Bugs Burger Bug Killers)

---

## 1. Swiss Cheese — Defense-in-Depth Pos-Correcao

Aplicando o modelo de James Reason: cada camada deve ter sua propria defesa independente. Se uma falha, a proxima captura.

### Estado ANTES da correcao (vulneravel)

| Camada | Defesa | Status |
|--------|--------|--------|
| L4 — LLM | Prompt diz "em portugues brasileiro" | FRACO — instrucao passiva |
| L5 — Validacao | Nenhuma | AUSENTE |
| L6 — Resposta | Nenhum filtro | AUSENTE |

**Resultado:** 3 buracos alinhados. Falha atravessou todas as camadas.

### Estado DEPOIS da correcao (reforccado)

| Camada | Defesa | Status | Mecanismo |
|--------|--------|--------|-----------|
| L4 — LLM | Prompt com regra explicita "NUNCA use outros idiomas" | FORTE | Instrucao proibitiva no system prompt |
| L5 — Validacao | Node "Validar PT-BR" com regex | FORTE | Deteccao e remocao de caracteres nao-latinos |
| L6 — Resposta | Log de anomalia + texto limpo | MODERADO | Flag no execution_log para monitoramento |

**Resultado:** Para a falha atingir o usuario, TODAS as 3 camadas precisariam falhar simultaneamente:
1. O prompt precisaria ser ignorado pelo modelo (improvavel com instrucao explicita)
2. O regex precisaria nao detectar os caracteres (improvavel — cobertura Unicode ampla)
3. O log precisaria nao registrar (nao impede o envio, mas permite deteccao)

**Probabilidade de recorrencia:** Muito baixa.

---

## 2. HFACS — Classificacao da Correcao

A correcao atua em TODOS os 4 niveis do HFACS:

### Nivel 1 — Atos Inseguros (mitigacao direta)

| Risco original | Mitigacao | Eficacia |
|---------------|-----------|----------|
| Modelo gera token em outro idioma | Prompt proibitivo + validacao regex | Alta |

### Nivel 2 — Precondicoes (reducao de risco)

| Fator | Mitigacao | Eficacia |
|-------|-----------|----------|
| Modelo multilíngue | Prompt reforccado compensa a natureza multilíngue | Alta |
| Termos tecnicos no input | "exceto nomes proprios e siglas tecnicas" no prompt previne confusao | Media |

### Nivel 3 — Supervisao (melhoria de processo)

| Fator | Mitigacao | Eficacia |
|-------|-----------|----------|
| Sem validacao pos-IA | Node "Validar PT-BR" adicionado | Alta |
| Sem monitoramento de anomalias | Flag `_ptbr_anomaly` + campo `error_message` | Alta |

### Nivel 4 — Influencias Organizacionais (mudanca de cultura)

| Fator | Mitigacao | Eficacia |
|-------|-----------|----------|
| Confianca excessiva no modelo | Documentacao deste incidente como referencia | Media |
| Ausencia de defense-in-depth | Padrao estabelecido: prompt + validacao + log para todos os nodes de IA | Alta |

---

## 3. TEM — Ameacas, Erros e Estados Indesejados

### Ameacas remanescentes (pos-correcao)

| Ameaca | Probabilidade | Gestao |
|--------|--------------|--------|
| OpenAI muda comportamento do modelo em update futuro | Baixa | Monitorar logs de anomalia semanalmente |
| Novo idioma nao coberto pelo regex | Muito baixa | Regex cobre: arabe, cirílico, CJK, devanagari, hangul. Expandir se necessario |
| Modelo ignora instrucao do system prompt | Muito baixa | Temperature 0.3 + instrucao proibitiva + validacao regex como backup |

### Contramedidas TEM aplicadas

| Tipo | Contramedida | Camada |
|------|-------------|--------|
| Evitar | Prompt proibitivo previne a geracao | L4 |
| Capturar | Regex detecta anomalia se ocorrer | L5 |
| Mitigar | Texto limpo enviado, anomalia logada | L5 + L6 |

---

## 4. Just Culture — Classificacao do Incidente

Seguindo a matriz de David Marx:

| Comportamento | Classificacao | Resposta |
|--------------|---------------|----------|
| Modelo gerou token errado | **Erro honesto** | Console (melhore o sistema, nao puna o agente) |
| Prompt original era fraco | **Comportamento de risco** | Coach (melhore o processo de criacao de prompts) |
| Ausencia de validacao | **Condicao latente** | Corrija (adicione a camada de defesa) |

**Nenhum componente merece "punicao".** O incidente revela gaps no processo, nao negligencia.

---

## 5. SMS — Safety Management System

### Pilar 1 — Politica e Objetivos

| Item | Status |
|------|--------|
| Objetivo de seguranca | Resumos devem ser 100% em PT-BR |
| Politica | Defesa em profundidade para todos os outputs de IA |

### Pilar 2 — Gestao de Risco

| Risco | Probabilidade (pos-fix) | Severidade | Aceitabilidade |
|-------|------------------------|-----------|----------------|
| Code-switching em resumo | Muito baixa | S2 — Moderado | Aceitavel com mitigacoes |
| Regex remove palavra necessaria | Muito baixa | S3 — Baixo | Aceitavel (texto fica levemente incompleto mas correto) |

### Pilar 3 — Garantia de Seguranca

| Acao | Frequencia | Responsavel |
|------|-----------|-------------|
| Monitorar flag `_ptbr_anomaly` no execution_log | Semanal | Squad auditor-real |
| Revisar regex se novos idiomas forem detectados | Sob demanda | Dev |
| Auditar prompts de IA periodicamente | Mensal | Squad auditor-real |

### Pilar 4 — Promocao de Seguranca

Este documento serve como registro do incidente e da correcao. Licoes aprendidas:

1. **Todo output de IA para o usuario deve ter validacao intermediaria**
2. **Prompts devem conter restricoes explicitas, nao apenas instrucoes positivas**
3. **Monitoramento proativo (LOSA) e mais eficaz que esperar o usuario reportar**

---

## 6. LOSA — Line Operations Safety Audit

### Indicadores para monitoramento continuo

| Indicador | Query | Frequencia | Threshold |
|-----------|-------|-----------|-----------|
| Anomalias de idioma | `SELECT COUNT(*) FROM execution_log WHERE error_message LIKE '%non-latin%'` | Semanal | > 0 = investigar |
| Total de resumos | `SELECT COUNT(*) FROM execution_log WHERE event_type = 'audio_summary'` | Semanal | Baseline |
| Taxa de anomalia | anomalias / total | Semanal | > 1% = revisar prompt |

---

## 7. Kaizen — Melhoria Continua

### PDCA para esta correcao

| Fase | Acao |
|------|------|
| **Plan** | Identificar root cause (code-switching), desenhar 3 correcoes (prompt, validacao, log) |
| **Do** | Implementar as 3 correcoes no N8N |
| **Check** | Monitorar via LOSA por 30 dias |
| **Act** | Se anomalias persistirem, expandir regex ou testar outro modelo |

### Ciclo futuro (pos-30-dias)

- Se zero anomalias: documentar como padrao para outros nodes de IA
- Se anomalias persistirem: investigar se o modelo precisa ser trocado ou se fine-tuning e viavel
- Se falsos positivos no regex: ajustar pattern para permitir caracteres especificos

---

## 8. Correlacao BBBK

| Principio BBBK | Aplicacao na correcao |
|-----------------|----------------------|
| **Garantia extraordinaria** | Prometemos resumo em PT-BR. Se falhar, o sistema deve detectar e corrigir antes do usuario ver |
| **2-4 contas por noite** | Foco na qualidade de cada resumo individual. Melhor um resumo perfeito que dezenas com falhas |
| **6 meses de treinamento** | O prompt foi re-escrito com cuidado. Nao e um patch — e uma melhoria estrutural |
| **O cliente nunca ve o inseto** | O node "Validar PT-BR" e a ultima barreira antes do usuario. Se o LLM falhar, o regex limpa |
| **Pagamento = dados** | Cada anomalia logada e um "pagamento de garantia" — dados para melhorar o sistema |
| **Design backwards** | Partimos do resultado desejado (resumo 100% PT-BR) e construimos as barreiras de tras pra frente |

---

## Conclusao

A correcao implementa o principio fundamental da aviacao: **nenhuma camada unica de defesa e suficiente**. O incidente ocorreu porque havia apenas 1 camada (prompt fraco). Apos a correcao, ha 3 camadas independentes.

Na linguagem da BBBK: "Se Al Burger prometesse que o hotel nao teria insetos, ele nao confiaria apenas na boa vontade dos insetos de irem embora. Ele construiria multiplas barreiras — e e exatamente isso que estamos fazendo aqui."
