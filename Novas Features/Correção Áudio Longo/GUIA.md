# Correcao Audio Longo — Guia

**Arquivo:** `audio-longo-3nodes.json`
**Workflow:** Main - Total Assistente
**Problema:** Transcricao de audio > 4.096 chars faz a API do WhatsApp rejeitar a mensagem. Usuario nao recebe nada.
**Solucao:** Checar tamanho da transcricao. Se > 4.000 chars, resumir automaticamente antes de enviar.

---

## Fluxo atual

```
Log: transcription → Redis SET (guarda transcricao) → Send message2 (envia transcricao inteira)
  → Resumir (pergunta "quer resumo?")
```

Se a transcricao tiver > 4.096 chars, `Send message2` falha silenciosamente.

## Fluxo corrigido

```
Log: transcription → Redis SET → Audio Longo?
  ├ TRUE (> 4000 chars): Resumir Audio Longo → Enviar Resumo Longo → Resumir
  └ FALSE (≤ 4000 chars): Send message2 (envia transcricao normal) → Resumir
```

---

## Passo 1 — Colar os 3 nodes

1. Copiar conteudo de `audio-longo-3nodes.json`
2. Ctrl+V no canvas do Main
3. Os 3 nodes aparecem:

```
Audio Longo? → Resumir Audio Longo → Enviar Resumo Longo
```

---

## Passo 2 — Cortar 1 fio

```
Redis SET (o node "Redis" que guarda transcricao) ──✂──→ Send message2
```

---

## Passo 3 — Conectar 3 fios

```
1. Redis SET                      → Audio Longo?
2. Audio Longo? (FALSE, saida 2)  → Send message2  (fluxo normal, audio curto)
3. Enviar Resumo Longo            → Resumir         (continua pro botao "quer resumo?")
```

> O `Audio Longo? (TRUE, saida 1)` ja esta conectado ao `Resumir Audio Longo` pelo JSON.
> O `Resumir Audio Longo` ja esta conectado ao `Enviar Resumo Longo` pelo JSON.

---

## Resultado

| Cenario | O que acontece |
|---------|---------------|
| Audio curto (≤ 4000 chars) | Envia transcricao completa (Send message2) → pergunta se quer resumo |
| Audio longo (> 4000 chars) | Resume automaticamente → envia resumo (Enviar Resumo Longo) → pergunta se quer resumo |

---

## O que cada node faz

**Audio Longo?** (If)
- Checa: `transcription_text.length > 4000`
- TRUE → vai pro resumo
- FALSE → envia transcricao normal

**Resumir Audio Longo** (OpenAI)
- Model: gpt-5.4-mini
- Prompt: "Resume mantendo pontos principais. Max 3000 caracteres."
- maxTokens: 800, temperature: 0.3

**Enviar Resumo Longo** (WhatsApp Send)
- Envia: "*Resumo do audio:*\n\n{resumo}\n\n_O audio era muito longo para transcricao completa._"
- Cabe nos 4.096 chars com folga

---

## Checklist

- [ ] 3 nodes colados no canvas
- [ ] Fio cortado: Redis SET → Send message2
- [ ] Conectado: Redis SET → Audio Longo?
- [ ] Conectado: Audio Longo? FALSE → Send message2
- [ ] Conectado: Enviar Resumo Longo → Resumir
- [ ] Resumir Audio Longo tem credential OpenAI configurada
- [ ] Enviar Resumo Longo tem credential WhatsApp account 2
- [ ] Salvar
