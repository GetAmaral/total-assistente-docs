# 01 — Visao Geral: Correcao Resumo PT-BR

**Feature:** Correcao de code-switching involuntario no resumo de audio — modelo LLM inserindo palavras em arabe no meio de texto portugues.

**Data do estudo:** 2026-04-01

**Severidade:** S2 — Moderado (conteudo semanticamente correto, idioma errado)

**Execution ID do incidente:** `c9469280-a76d-4b2b-b661-30d6e10dfef7`

---

## O que aconteceu

Em 01/04/2026 as 11:34:58 BRT, o usuario **Luan** (554398459145, premium) recebeu um resumo de audio encaminhado contendo a palavra arabe **التواصل** (al-tawasul = "comunicacao") no meio de um texto 100% em portugues.

**Transcricao original (100% portugues):**
> "...Tem o **chat** tambem, que e direto com o profissional e tambem, obviamente, o progresso."

**Resumo gerado pela IA (com falha):**
> "...usar o chat para **التواصل** direto com o profissional."

**Deveria ser:**
> "...usar o chat para **comunicacao direta** com o profissional."

---

## Por que isso e um problema

1. **Experiencia do usuario** — O usuario ve caracteres arabes no meio do texto e pensa que o sistema bugou
2. **Confianca no produto** — Qualquer anomalia visual mina a percepcao de qualidade
3. **Principio BBBK** — "Se o cliente viu o inseto, a garantia ja falhou." O usuario ja viu a falha. Precisamos garantir que nunca mais veja

---

## Causa raiz (resumo)

O node "Message a model" usa GPT-5.4-mini com um system prompt **minimalista** que nao forcca idioma de forma explicita. O modelo, ao reescrever "chat direto com o profissional" para uma forma mais formal, selecionou o token arabe equivalente a "comunicacao" em vez do portugues. Isso e um fenomeno conhecido como **code-switching de token** em LLMs multilíngues.

Analise completa em `02-analise-root-cause.md`.

---

## Escopo da correcao

| Componente | Acao |
|-----------|------|
| System prompt do node "Message a model" | Reforcar idioma PT-BR com regra explicita |
| Node de validacao pos-resposta | Novo node para detectar caracteres nao-latinos |
| Log de anomalia | Registrar ocorrencias para monitoramento |

---

## Impacto

- **Usuarios afetados:** Todos que usam o botao "Resuma para mim" (audio encaminhado)
- **Fluxo afetado:** Resumo de audio no Main Workflow
- **Risco de regressao:** Baixo — alteracoes sao aditivas (prompt + validacao), nao destrutivas
- **Tempo estimado de implementacao:** ~15 minutos no N8N

---

## Filosofia aplicada

### Da Aviacao
- **Swiss Cheese:** Uma unica camada de defesa (system prompt) nao foi suficiente. Adicionamos uma segunda camada (validacao pos-resposta) para que o "buraco" no prompt nao alcance o usuario
- **Just Culture:** Erro honesto do modelo (console, nao puna). O problema esta na **ausencia de barreira**, nao no modelo em si

### Da BBBK
- **Design backwards from the promise:** A promessa e "resumo claro em portugues". Toda engenharia deve garantir esse resultado
- **O pagamento da garantia e dados:** Esta falha e um "pagamento de garantia" — nao e vergonha, e informacao que melhora o sistema
