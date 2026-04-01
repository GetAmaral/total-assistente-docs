# 03 — Sistema Atual: Como Botoes Funcionam Hoje

**Baseline do sistema antes da implementacao do botao "Ver Dashboard".**

---

## 1. Arquitetura de Mensagens WhatsApp no Total Assistente

O sistema envia mensagens via **WhatsApp Cloud API v23.0** usando dois metodos:

| Metodo | Node N8N | Uso |
|--------|----------|-----|
| HTTP Request (Generic) | `n8n-nodes-base.httpRequest` | Maioria das respostas (texto, templates) |
| WhatsApp Node (Nativo) | `n8n-nodes-base.whatsApp` | Algumas respostas simples |

**Phone Number ID:** `744582292082931`
**Credenciais:** `WhatsApp account 2` / `WhatsApp Header Auth`

### Endpoint

```
POST https://graph.facebook.com/v23.0/744582292082931/messages
```

---

## 2. Tipos de Mensagem Enviados Hoje

### 2.1 Texto Simples (maioria das respostas)

```json
{
  "messaging_product": "whatsapp",
  "to": "554391936205",
  "type": "text",
  "text": {
    "body": "Gasto de R$50,00 registrado com sucesso!"
  }
}
```

**Usado em:** Respostas da IA, confirmacoes, relatorios.

### 2.2 Template Messages (lembretes, onboarding)

```json
{
  "messaging_product": "whatsapp",
  "to": "554391936205",
  "type": "template",
  "template": {
    "name": "lembretes_diarios",
    "language": { "code": "pt_BR" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Luiz Felipe" },
          { "type": "text", "text": "3" }
        ]
      }
    ]
  }
}
```

**Usado em:** Lembretes diarios, notificacoes fora da janela 24h.

### 2.3 Interactive Messages — NAO USADO ATUALMENTE

O sistema **nao envia** mensagens do tipo `interactive` (nem reply buttons, nem CTA URL) como mensagem avulsa. Os botoes existentes (Sim/Nao) sao parte de **templates aprovados**.

---

## 3. Fluxo do Botao "Excluir" (Atual)

O "excluir" nao e um botao visual no WhatsApp. E um **intent de texto** processado pelo LLM:

```
Usuario: "Excluir gasto de 50 no mercado"
  |
  v
[Main Workflow] -> LLM classifica intent = "excluir_gasto"
  |
  v
[Financeiro Workflow] -> Webhook POST "excluir-supabase"
  |
  v
[Supabase] -> SELECT spent WHERE id_spent + fk_user (valida ownership)
  |
  v
[Supabase] -> DELETE spent WHERE id_spent AND fk_user
  |
  v
[WhatsApp] -> Texto: "Exclusao concluida! Registro: Mercado, Valor: R$50,00"
```

### Arquivos-chave

| Componente | Arquivo |
|-----------|---------|
| Webhook excluir | `jsonsProd/Financeiro - Total (3).json` (linhas 588-610) |
| Query SELECT | `jsonsProd/Financeiro - Total (3).json` (linhas 487-516) |
| Query DELETE | `jsonsProd/Financeiro - Total (3).json` (linhas 552-585) |
| Seguranca | Requer `id_spent` + `fk_user` (dupla validacao) |

---

## 4. Fluxo dos Botoes "Sim/Nao" (Confirmacao)

Quando o sistema precisa de confirmacao, envia template com botoes quick_reply:

```
[Sistema envia template com botoes "Sim" / "Nao"]
  |
  v
[Usuario clica "Sim"]
  |
  v
[Webhook recebe]:
  messages[0].type = "button"
  messages[0].button.text = "Sim"
  |
  v
[Main Workflow] -> Normaliza button.text como texto
  |
  v
[Switch1 node] -> Roteia: "Sim" ou "Nao"
```

### Deteccao de botao no Main Workflow

```javascript
// Linha 743-746 do Main Workflow
"messageType": "={{
  $('trigger-whatsapp').item.json.messages[0].type === 'button'
    ? 'text'
    : $('trigger-whatsapp').item.json.messages[0].type
}}"
```

**Ponto critico:** Botoes sao normalizados para `text`. O sistema trata click de botao como se fosse mensagem de texto.

### Extracao do texto do botao

```javascript
// Linhas 1229-1236
$json.messages[0].button?.text
||
$json.messages[0].text?.body
```

### Switch de roteamento

```javascript
// Switch1 node — Linhas 1217-1284
Condicoes:
  - messageSet === "Sim"  -> output "Sim"
  - messageSet === "Nao"  -> output "Nao"
  - default              -> output "extra"
```

---

## 5. O Que Muda com o Botao "Ver Dashboard"

| Aspecto | Hoje | Com "Ver Dashboard" |
|---------|------|---------------------|
| Tipo de mensagem | `text` ou `template` | `interactive` (cta_url) |
| Botao abre URL | Nao existe | Sim (`totalassistente.com.br`) |
| Webhook callback | Sim (para Sim/Nao) | **Nao** (CTA URL nao gera callback) |
| Impacto no fluxo | Nenhum | Nenhum (nao gera mensagem de volta) |
| Compatibilidade | N/A | Nao conflita com fluxos existentes |

**Conclusao:** O botao "Ver Dashboard" e **aditivo** — nao modifica nenhum fluxo existente. E uma mensagem nova, enviada em momentos especificos, sem impacto nos botoes Sim/Nao ou no fluxo de exclusao.
