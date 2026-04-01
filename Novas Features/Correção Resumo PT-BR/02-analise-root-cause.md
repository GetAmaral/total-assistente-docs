# 02 — Analise Root Cause: Code-Switching em LLM

**Metodologia:** RCA (5-Why + Fishbone/Ishikawa), HFACS, Swiss Cheese
**Base:** Documentacao de pesquisa em `aios-core/docs/research/aviation-safety-methodology/`
**Incidente:** Execution ID `c9469280-a76d-4b2b-b661-30d6e10dfef7`

---

## 1. Analise 5-Why (Root Cause Analysis)

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Por que o usuario recebeu uma palavra em arabe? | Porque o modelo GPT-5.4-mini gerou o token `التواصل` em vez de `comunicacao` |
| 2 | Por que o modelo gerou um token arabe? | Porque em modelos multilíngues, tokens semanticamente equivalentes em idiomas diferentes competem durante a geracao — e o arabe "venceu" neste caso |
| 3 | Por que o token arabe venceu? | Porque o system prompt nao tem uma instrucao explicita e forte de "responder EXCLUSIVAMENTE em portugues" — apenas diz "resuma em portugues brasileiro" de forma passiva |
| 4 | Por que o system prompt e fraco nesse ponto? | Porque foi escrito com foco na tarefa (resumir) e nao na restricao de idioma. Nao havia historico de falhas de idioma para motivar a restricao |
| 5 | Por que nao havia barreira de seguranca apos a geracao? | Porque o fluxo envia a resposta da IA diretamente ao usuario sem nenhuma validacao intermediaria |

**Root cause identificada:** Ausencia de defesa em profundidade — unica camada (prompt) sem barreira de validacao.

---

## 2. Fishbone / Ishikawa — 6 Categorias

```
                            FALHA DE IDIOMA
                                  |
    ┌─────────┬─────────┬────────┼────────┬──────────┬──────────┐
    |         |         |        |        |          |
  MODELO   PROMPT   PROCESSO  DADOS   AMBIENTE  MONITORAMENTO
    |         |         |        |        |          |
    |         |         |        |        |          +-- Sem deteccao
    |         |         |        |        |              de anomalia
    |         |         |        |        |              pos-geracao
    |         |         |        |        |
    |         |         |        |        +-- GPT-5.4-mini e
    |         |         |        |            multilíngue por design
    |         |         |        |
    |         |         |        +-- Transcricao continha
    |         |         |            termos tecnicos (VBMAP,
    |         |         |            PEI, ABA) que podem
    |         |         |            ter reduzido a confianca
    |         |         |            do detector de idioma
    |         |         |
    |         |         +-- Fluxo webhook → IA → WhatsApp
    |         |             sem etapa de validacao
    |         |
    |         +-- System prompt: "Voce e um assistente que
    |             resume textos de forma clara e concisa em
    |             portugues brasileiro. Resuma o texto mantendo
    |             os pontos principais. Apenas resuma. Apenas isso."
    |             FRACO: nao proibe outros idiomas explicitamente
    |
    +-- GPT-5.4-mini tem embeddings compartilhados
        entre idiomas. "comunicacao" (pt) e "التواصل" (ar)
        ocupam regioes proximas no espaco vetorial.
        Temperature 0.3 reduz mas nao elimina variacao.
```

---

## 3. HFACS — Classificacao em 4 Niveis

### Nivel 1 — Atos Inseguros (falha direta)

| Falha | Tipo | Descricao |
|-------|------|-----------|
| Token arabe gerado | Erro baseado em habilidade | Modelo selecionou token incorreto por proximidade vetorial |

### Nivel 2 — Precondicoes para Atos Inseguros

| Fator | Tipo | Descricao |
|-------|------|-----------|
| Modelo multilíngue | Condicao do operador | GPT-5.4-mini foi treinado em 100+ idiomas simultaneamente |
| Termos tecnicos no input | Estado mental | Vocabulario tecnico (VBMAP, PEI, ABA) pode ter "confundido" o detector de lingua interno |
| Temperature 0.3 | Ambiente | Conservador mas nao deterministico |

### Nivel 3 — Supervisao Insegura

| Fator | Tipo | Descricao |
|-------|------|-----------|
| Sem validacao pos-IA | Supervisao inadequada | Resposta vai direto para o usuario |
| Sem monitoramento de anomalias | Falha em corrigir problema | Nenhum alerta automatico para caracteres inesperados |

### Nivel 4 — Influencias Organizacionais

| Fator | Tipo | Descricao |
|-------|------|-----------|
| Confianca excessiva no modelo | Processo organizacional | Premissa de que o modelo sempre responde no idioma correto |
| Ausencia de defense-in-depth | Gestao de recursos | Unica camada de defesa (prompt) |

---

## 4. Swiss Cheese — Analise de Camadas

O incidente atravessou **todas as camadas** porque nenhuma tinha defesa contra code-switching:

| Camada | Defesa existente | Buraco |
|--------|-----------------|--------|
| **L1 — Recepcao** | Webhook recebe mensagem | N/A (inbound ok) |
| **L2 — Roteamento** | Switch3 roteia para audio_resume | N/A (rota correta) |
| **L3 — Dados** | Redis retorna transcricao | Transcricao ok, sem problema |
| **L4 — LLM** | System prompt diz "em portugues brasileiro" | **BURACO: instrucao passiva, nao proibitiva** |
| **L5 — Execucao** | Nenhuma validacao pos-LLM | **BURACO: saida vai direto ao usuario** |
| **L6 — Resposta** | Send message5 envia ao WhatsApp | **BURACO: sem filtro final** |

**Alinhamento de buracos:** L4 + L5 + L6 alinharam. A falha no LLM passou direto.

**Correcao proposta:** Fechar buracos em L4 (prompt reforccado) e L5 (node de validacao).

---

## 5. Correlacao com Caso BBBK

| Principio BBBK | Aplicacao aqui |
|-----------------|---------------|
| "A garantia forca a excelencia" | Se prometemos resumo em PT-BR, devemos ter mecanismos que forcam esse resultado |
| "Pagamento da garantia = dados" | Esta falha e um data point. Nao e vergonha — e informacao para melhorar |
| "Design backwards from the promise" | A promessa e "resumo claro em portugues". O sistema precisa ser desenhado para GARANTIR isso, nao apenas pedir educadamente |
| "2-4 contas por noite, nao dezenas" | Foco na qualidade de cada resumo individual, nao na velocidade de processamento |
| "6 meses de treinamento" | O prompt precisa ser robusto e testado antes de ir para producao |

---

## 6. Conclusao

**Tipo de erro:** Erro honesto (Just Culture — console, nao puna)

O modelo nao "errou" propositalmente. Ele foi colocado em uma situacao onde a barreira era fraca demais. A correcao deve:

1. **Fortalecer a barreira L4** — System prompt explicito e proibitivo
2. **Adicionar barreira L5** — Validacao pos-geracao com regex
3. **Monitorar** — Log de anomalias para detectar recorrencia (LOSA)
4. **Iterar** — Kaizen: revisar periodicamente se o prompt continua eficaz

Implementacao completa em `04-implementacao.md`.
