# 05 — Analise de Seguranca: Metodologia da Aviacao

**Metodologia aplicada:** Swiss Cheese, HFACS, TEM, Just Culture, SMS, LOSA, Kaizen
**Base:** Documentacao de pesquisa em `aios-core/docs/research/aviation-safety-methodology/`
**Correlacao squad-aviacao:** `15-correlacao-squad-auditor.md`

---

## 1. Swiss Cheese — Analise de 6 Camadas

O modelo Swiss Cheese de James Reason ensina que acidentes (falhas) acontecem quando multiplas camadas de defesa falham simultaneamente. Analisamos o botao "Ver Dashboard" em cada camada do Deep-Agent:

| Camada | Funcao | Risco para o botao | Probabilidade | Mitigacao |
|--------|--------|--------------------|--------------|-----------| 
| **L1 — Recepcao Webhook** | Mensagem chega ao sistema | Nenhum — botao e outbound (sistema envia) | N/A | N/A |
| **L2 — Roteamento** | Decisao de qual workflow | CTA URL nao gera callback. Se o sistema esperar resposta do botao, dead-end | Media | Documentar que CTA URL nao retorna dados |
| **L3 — Extracao de Dados** | Parse da mensagem | Nenhum — sem dados a extrair | N/A | N/A |
| **L4 — Processamento LLM** | Decisao da IA | LLM pode incluir botao em contextos inadequados (onboarding, erro) | Baixa | Regras claras de QUANDO enviar |
| **L5 — Execucao da Acao** | Acao executada | URL errada, HTTPS expirado, site fora do ar | Baixa | Health check, URL em env var |
| **L6 — Geracao de Resposta** | Mensagem enviada | Botao aparece mas URL nao abre (dominio bloqueado) | Muito baixa | Fallback com URL em texto |

### Condicoes latentes identificadas

Seguindo o principio de Reason de investigar **condicoes organizacionais** que permitem falhas:

1. **Ausencia de monitoramento de cliques** — CTA URL nao gera callback, entao nao ha dados sobre se o botao e util. Condicao latente: pode-se manter um botao inutil por meses sem saber.
2. **URL hardcoded** — Se a URL mudar, precisa editar o workflow. Condicao latente: esquecimento em deploy futuro.
3. **Sem rate-limit para botao** — Em teoria, todo request financeiro geraria botao. Condicao latente: fadiga do usuario.

---

## 2. HFACS — Classificacao de Riscos em 4 Niveis

O HFACS (Human Factors Analysis and Classification System) de Shappell & Wiegmann classifica falhas em 4 niveis hierarquicos. Aplicando ao botao:

### Nivel 1 — Atos Inseguros (falhas diretas)

| Risco | Tipo | Severidade |
|-------|------|-----------|
| Enviar botao com URL errada | Erro de habilidade | S2 — Moderado |
| Enviar botao fora da janela 24h (erro 400) | Erro de decisao | S3 — Baixo |
| Botao com display_text > 20 chars (rejeitado) | Erro de habilidade | S3 — Baixo |

### Nivel 2 — Precondicoes para Atos Inseguros

| Risco | Tipo | Severidade |
|-------|------|-----------|
| Dashboard fora do ar quando usuario clica | Ambiente | S3 — Baixo |
| Latencia alta — botao chega antes da resposta texto | Ambiente | S3 — Baixo |
| Usuario nao entende o que o botao faz | Condicao do operador | S3 — Baixo |

### Nivel 3 — Supervisao Insegura

| Risco | Tipo | Severidade |
|-------|------|-----------|
| Nao monitorar taxa de erro 4xx/5xx no envio | Supervisao inadequada | S2 — Moderado |
| Nao revisar se o botao esta sendo util (sem metricas) | Falha em corrigir problema | S2 — Moderado |

### Nivel 4 — Influencias Organizacionais

| Risco | Tipo | Severidade |
|-------|------|-----------|
| Nao ter fallback caso Meta deprecie `cta_url` | Gestao de recursos | **S1 — Critico** |
| Depender de feature sem SLA da Meta | Processo organizacional | S2 — Moderado |

---

## 3. TEM — Ameacas, Erros e Estados Indesejados

O TEM (Threat and Error Management), desenvolvido pela Universidade do Texas, classifica riscos operacionais em tres categorias:

### Ameacas (externas, nao controlaveis)

| Ameaca | Impacto | Gestao |
|--------|---------|--------|
| Meta muda/deprecia API CTA URL | Botao para de funcionar | Monitorar changelogs da Meta; ter fallback texto |
| WhatsApp rejeita URLs especificas (politica de links) | Botao rejeitado pela API | Testar URL antes do deploy |
| Janela de 24h limita envio | Botao nao pode ser enviado proativamente | Usar template CTA URL para fora da janela |
| Mudanca de rate-limits da Meta | Throttling no envio | Implementar retry com backoff |

### Erros (internos, mitigaveis)

| Erro | Impacto | Prevencao |
|------|---------|-----------|
| Enviar botao fora da janela 24h | Erro 400, mensagem nao entregue | Verificar timestamp da ultima mensagem do usuario |
| Hardcodar URL sem env var | Dificil atualizar | Usar variavel de ambiente |
| Nao tratar erro da API | Usuario nao recebe nada, sem logging | Try-catch com logging |
| Enviar botao em TODA resposta | Fadiga do usuario | Regra de contexto (so financeiro/agenda) |

### Estados Indesejados (resultados nao planejados)

| Estado | Descricao | Recuperacao |
|--------|-----------|------------|
| Botao enviado mas dashboard nao carrega dados do usuario | Experiencia frustrante | Deep-link com user_id + loading state |
| Botao enviado em contexto errado | Confusao | Refinar regras do IF node |
| Spam de botoes | Cada mensagem gera botao | Rate-limit: max 1 botao a cada 5 minutos por usuario |

---

## 4. Just Culture — Classificacao de Possiveis Falhas

A Just Culture de David Marx classifica falhas em 3 categorias com acoes distintas:

| Categoria | Cenario no contexto do botao | Acao |
|-----------|------------------------------|------|
| **Erro honesto** (consolar) | Dev implementa botao mas esquece HTTPS na URL | Corrigir, sem culpa. Adicionar validacao automatica |
| **Comportamento de risco** (orientar) | Deploy sem testar em staging | Orientar: criar teste E2E obrigatorio antes do deploy |
| **Negligencia** (responsabilizar) | Ignorar erros 4xx/5xx retornados pela API por semanas | Flag de alta prioridade, revisar processo de monitoramento |

### Aplicacao pratica

O botao "Ver Dashboard" e uma feature de **baixo risco**. A postura Just Culture aqui e:
- **Consolar** erros de implementacao (normal em feature nova)
- **Orientar** sobre boas praticas (testes, env vars, logging)
- **Nao punir** se o botao nao tiver o engajamento esperado — aprender e iterar

---

## 5. SMS (Safety Management System) — 4 Pilares

Seguindo ICAO Doc 9859, aplicamos os 4 pilares do SMS:

### Pilar 1 — Politica e Objetivos

| Item | Aplicacao |
|------|-----------|
| Objetivo | Aumentar engajamento com dashboard via botao no WhatsApp |
| Metrica de sucesso | Aumento de acessos ao dashboard apos implementacao |
| Responsavel | Equipe de desenvolvimento |

### Pilar 2 — Gestao de Risco

| Risco | Probabilidade | Severidade | Risco Residual |
|-------|--------------|-----------|----------------|
| API CTA URL depreciada | Improvavel | Alto | **Medio** — ter fallback |
| URL incorreta | Raro | Moderado | **Baixo** — env var + teste |
| Fadiga do usuario | Possivel | Baixo | **Baixo** — regras de contexto |
| Dashboard fora do ar | Raro | Baixo | **Baixo** — monitoramento |

### Pilar 3 — Garantia de Seguranca

| Acao | Frequencia |
|------|-----------|
| Monitorar taxa de erro no envio do botao | Diaria |
| Verificar se URL responde com 200 | Semanal |
| Revisar se regras de contexto estao adequadas | Mensal |
| Verificar changelog da Meta para depreciacoes | Mensal |

### Pilar 4 — Promocao de Seguranca

| Acao | Descricao |
|------|-----------|
| Documentar a feature | Este documento |
| Registrar decisoes de design | Por que CTA URL e nao template |
| Comunicar limitacoes | Janela 24h, sem callback, 1 botao max |

---

## 6. LOSA — Auditoria Pos-Implementacao

Apos o deploy, o squad auditor-real pode auditar o botao em operacao real:

| O que auditar | Como |
|---------------|------|
| Botao esta sendo enviado nos contextos corretos? | Analisar logs de envio vs branch classificado |
| Usuarios estao clicando? | Monitorar acessos ao dashboard (analytics web) |
| Erros de API estao sendo logados? | Verificar logs do N8N |
| Frequencia de envio e adequada? | Contar botoes por usuario por dia |

---

## 7. Kaizen — Melhoria Continua (PDCA)

| Fase | Acao |
|------|------|
| **Plan** | Implementar botao CTA URL para branches financeiros |
| **Do** | Deploy em DEV, testar com usuario de teste |
| **Check** | Auditar com auditor-real apos 1 semana em producao |
| **Act** | Ajustar regras de contexto, expandir para agenda se positivo |

Ciclo seguinte:
- Criar template CTA URL (para fora da janela 24h)
- Adicionar deep-link com user_id
- Personalizar mensagem por contexto

---

## 8. Matriz de Risco Final (SMS Risk Matrix)

| | Catastrofico | Critico | Moderado | Menor |
|---|---|---|---|---|
| **Frequente** | | | | |
| **Ocasional** | | | | |
| **Remoto** | | | Depreciacao API | |
| **Improvavel** | | | | URL errada, fadiga, dashboard offline |

**Risco geral da feature: BAIXO**

A feature e aditiva (nao modifica fluxos existentes), nao envolve escrita em banco, nao envia dados sensiveis, e tem fallback natural (resposta de texto ja foi enviada).

---

## 9. Veredito

> **Implementacao SEGURA.** Seguir checklist pre-deploy (documento 06) e auditar com auditor-real apos 1 semana em producao.
