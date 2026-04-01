# 02 — Analise Tecnica: WhatsApp Cloud API — Botoes

**Fonte UNICA:** Documentacao oficial Meta (developers.facebook.com)

---

## 1. Tipos de Botao na WhatsApp Cloud API

A WhatsApp Cloud API possui **dois sistemas distintos** para botoes:

### Sistema 1 — Interactive Messages (sem aprovacao)

Mensagens enviadas **dentro da janela de 24h** (session messages). Nao precisam de aprovacao.

| Tipo | `interactive.type` | Max Botoes | Abre URL? | Retorna payload? |
|------|-------------------|------------|-----------|-----------------|
| **Reply Button** | `button` | 3 | Nao | Sim (id + title) |
| **CTA URL** | `cta_url` | 1 | **Sim** | Nao |

### Sistema 2 — Message Templates (com aprovacao)

Mensagens pre-aprovadas pela Meta. Podem ser enviadas **a qualquer momento** (fora da janela de 24h).

| Tipo | `sub_type` | Max Botoes | Abre URL? | Retorna payload? |
|------|-----------|------------|-----------|-----------------|
| **Quick Reply** | `quick_reply` | 3 | Nao | Sim |
| **CTA URL** | `url` | 2 | **Sim** | Nao |

---

## 2. Interactive Reply Buttons — Referencia

**Fonte:** developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages/

### Limites

| Campo | Limite |
|-------|--------|
| Body text | 1.024 caracteres |
| Header text | 60 caracteres (opcional) |
| Footer text | 60 caracteres (opcional) |
| Titulo do botao | 20 caracteres |
| ID do botao | String unica |
| Quantidade de botoes | 3 |

### Payload JSON

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "{{phone}}",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": {
      "type": "text",
      "text": "Cabecalho opcional"
    },
    "body": {
      "text": "Texto principal da mensagem (ate 1024 chars)"
    },
    "footer": {
      "text": "Rodape opcional"
    },
    "action": {
      "buttons": [
        {
          "type": "reply",
          "reply": {
            "id": "btn-sim",
            "title": "Sim"
          }
        },
        {
          "type": "reply",
          "reply": {
            "id": "btn-nao",
            "title": "Nao"
          }
        }
      ]
    }
  }
}
```

### Webhook de resposta (quando usuario clica)

```json
{
  "messages": [{
    "type": "button",
    "button": {
      "payload": "btn-sim",
      "text": "Sim"
    }
  }]
}
```

---

## 3. Interactive CTA URL — Referencia (USADO PARA "VER DASHBOARD")

**Fonte:** developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-cta-url-messages/

### Limites

| Campo | Limite |
|-------|--------|
| Body text | 1.024 caracteres (obrigatorio) |
| Header text | 60 caracteres (opcional, somente texto) |
| Footer text | 60 caracteres (opcional) |
| display_text | 20 caracteres |
| URL | HTTPS valida (obrigatorio) |
| Quantidade de botoes | **1** |

### Payload JSON

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "{{phone}}",
  "type": "interactive",
  "interactive": {
    "type": "cta_url",
    "header": {
      "type": "text",
      "text": "Total Assistente"
    },
    "body": {
      "text": "Acesse seu dashboard para ver gastos, agenda e relatorios completos."
    },
    "footer": {
      "text": "totalassistente.com.br"
    },
    "action": {
      "name": "cta_url",
      "parameters": {
        "display_text": "Ver Dashboard",
        "url": "https://totalassistente.com.br"
      }
    }
  }
}
```

### Comportamento

- Usuario ve botao "Ver Dashboard" na conversa
- Ao tocar, abre o navegador em `https://totalassistente.com.br`
- **Nao gera webhook callback** — o sistema nao sabe se o usuario clicou
- Botao fica visivel permanentemente na mensagem

---

## 4. Template CTA URL — Referencia (para uso fora da janela 24h)

**Fonte:** developers.facebook.com/docs/whatsapp/api/messages/message-templates/interactive-message-templates/

### Criacao do template

O template precisa ser criado no Meta Business Manager e aprovado (24-48h).

**Exemplo de template a criar:**

| Campo | Valor |
|-------|-------|
| Nome | `acesso_dashboard` |
| Categoria | UTILITY |
| Idioma | pt_BR |
| Body | "Ola {{1}}! Acesse seu dashboard para ver seus dados completos." |
| Botao tipo | URL |
| Botao texto | "Ver Dashboard" |
| Botao URL base | `https://totalassistente.com.br` |
| Sufixo dinamico | Opcional: `/dashboard?user={{1}}` |

### Payload de envio

```json
{
  "messaging_product": "whatsapp",
  "to": "{{phone}}",
  "type": "template",
  "template": {
    "name": "acesso_dashboard",
    "language": { "code": "pt_BR" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Luiz Felipe" }
        ]
      },
      {
        "type": "button",
        "sub_type": "url",
        "index": "0",
        "parameters": [
          { "type": "text", "text": "/dashboard?user=abc123" }
        ]
      }
    ]
  }
}
```

### Diferencas vs Interactive CTA URL

| Aspecto | Interactive CTA URL | Template CTA URL |
|---------|--------------------|--------------------|
| Aprovacao | Nao | Sim (Meta review) |
| Fora da janela 24h | Nao | **Sim** |
| URL dinamica | **Totalmente livre** | Base fixa + sufixo dinamico |
| Max botoes URL | 1 | 2 |
| Tempo para funcionar | Imediato | 24-48h (aprovacao) |

---

## 5. Regras Importantes (Oficial Meta)

1. **Nao misturar tipos:** Uma mensagem `interactive.type = "cta_url"` nao pode ter reply buttons. Sao tipos mutuamente exclusivos.

2. **Janela de 24h:** Interactive messages (reply e CTA URL) so podem ser enviadas se o usuario mandou mensagem nas ultimas 24 horas.

3. **CTA URL nao gera callback:** Diferente de reply buttons, o CTA URL nao envia nenhum dado ao webhook quando o usuario clica. O sistema nao tem como saber se o usuario abriu o dashboard.

4. **HTTPS obrigatorio:** A URL no CTA URL deve ser HTTPS. HTTP nao e aceito.

5. **Sem preview de link:** O botao CTA URL nao gera preview de link (OG tags). E apenas um botao com texto.

---

## Fontes Oficiais

- developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages/
- developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-cta-url-messages/
- developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/
- developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/
- developers.facebook.com/docs/whatsapp/api/messages/message-templates/interactive-message-templates/
- developers.facebook.com/docs/whatsapp/guides/interactive-messages/
