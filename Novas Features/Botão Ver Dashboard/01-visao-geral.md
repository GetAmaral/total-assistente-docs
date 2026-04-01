# 01 — Visao Geral: Botao "Ver Dashboard"

**Feature:** Adicionar um botao interativo nas mensagens do WhatsApp que leva o usuario direto ao dashboard web do Total Assistente.

**Data do estudo:** 2026-04-01

---

## O que e

Um botao clicavel dentro da conversa do WhatsApp que, ao ser tocado, abre o navegador do usuario diretamente em `https://totalassistente.com.br`.

**Nome do botao:** "Ver Dashboard"

**Comportamento esperado:**
1. Usuario cria/registra algo (gasto, receita, evento, lembrete)
2. Sistema envia a resposta normal de confirmacao (mensagem de texto)
3. Sistema envia uma **segunda mensagem separada** com o botao "Ver Dashboard"
4. Usuario toca no botao
5. Navegador abre em `https://totalassistente.com.br`

**Por que uma segunda mensagem?**
A API da Meta **nao permite misturar** reply buttons (Sim/Nao) com CTA URL na mesma mensagem. Sao tipos mutuamente exclusivos (`interactive.type = "button"` vs `"cta_url"`). Alem disso, separar garante que a confirmacao chegue primeiro e o botao seja um complemento opcional.

---

## Por que

- Usuarios criam registros pelo WhatsApp mas nao tem acesso facil a visao consolidada
- O dashboard web oferece graficos, relatorios e visao geral que o WhatsApp nao comporta
- Reduz fricao: usuario nao precisa digitar URL ou buscar o site manualmente
- Aumenta engajamento com a plataforma web
- Momento ideal: logo apos criar algo, o usuario tem curiosidade de ver o resultado completo

---

## Para quem

Todos os usuarios ativos do Total Assistente que estejam dentro da janela de conversa de 24h.

---

## Tipo de mensagem WhatsApp

**Interactive CTA URL** — tipo nativo da WhatsApp Cloud API que exibe um botao que abre URL externa.

| Caracteristica | Valor |
|---------------|-------|
| Tipo da mensagem | `interactive` |
| Subtipo | `cta_url` |
| Texto do botao | "Ver Dashboard" (14 caracteres) |
| URL destino | `https://totalassistente.com.br` |
| Precisa aprovacao da Meta? | Nao (mensagem interativa, nao template) |
| Funciona fora da janela 24h? | Nao |

---

## Restricoes conhecidas

1. **Maximo 1 botao CTA URL por mensagem** — nao pode ter "Ver Dashboard" + outro botao URL
2. **Nao pode misturar com reply buttons** — se quiser Sim/Nao + Ver Dashboard, precisam ser mensagens separadas
3. **So funciona dentro da janela de 24h** — usuario precisa ter mandado mensagem antes
4. **display_text max 20 caracteres** — "Ver Dashboard" tem 14, cabe com folga
5. **URL deve ser HTTPS** — `https://totalassistente.com.br` atende
