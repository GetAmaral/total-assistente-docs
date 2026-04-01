# 04 — Plano de Implementacao: Botao "Ver Dashboard" no N8N

---

## 1. Resumo

Adicionar um node HTTP Request no N8N que envia uma mensagem Interactive CTA URL com o botao "Ver Dashboard" apontando para `https://totalassistente.com.br`.

---

## 2. Node HTTP Request — Configuracao

### Payload completo para o N8N

```json
{
  "method": "POST",
  "url": "https://graph.facebook.com/v23.0/744582292082931/messages",
  "authentication": "httpHeaderAuth",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "Content-Type",
        "value": "application/json"
      }
    ]
  },
  "sendBody": true,
  "bodyParameters": {
    "parameters": []
  },
  "jsonBody": {
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "={{ $json.phone }}",
    "type": "interactive",
    "interactive": {
      "type": "cta_url",
      "body": {
        "text": "={{ $json.dashboard_message }}"
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
}
```

**Credencial:** `WhatsApp Header Auth` (mesma ja usada no sistema)

---

## 3. Quando Enviar o Botao

O botao NAO deve ser enviado em toda resposta. Cenarios recomendados:

| Cenario | Enviar botao? | Justificativa |
|---------|--------------|---------------|
| Apos registrar gasto | Sim | Usuario quer ver o impacto no dashboard |
| Apos consultar relatorio financeiro | Sim | Complementa com visao grafica |
| Apos registrar evento na agenda | Opcional | Menos urgente que financeiro |
| Saudacao / conversa casual | **Nao** | Irrelevante, causa fadiga |
| Onboarding / verificacao | **Nao** | Usuario ainda nao tem dados |
| Erro / falha do sistema | **Nao** | Nao faz sentido |
| Apos exclusao de registro | Opcional | Pode querer verificar |

### Logica de decisao no N8N

Adicionar um **IF node** antes do envio do botao:

```javascript
// Condicao: enviar botao apenas para branches financeiros e de agenda
const branch = $json.classification_branch;
const sendDashboard = [
  "registrar_gasto",
  "registrar_receita",
  "relatorio_financeiro",
  "consultar_saldo",
  "limite_gastos"
].includes(branch);

return sendDashboard;
```

---

## 4. Opcao: URL Dinamica por Usuario

Se o dashboard suportar deep-link com ID do usuario:

```json
"url": "https://totalassistente.com.br/dashboard?user={{ $json.user_id }}"
```

Isso permitiria abrir o dashboard ja com os dados do usuario carregados. Depende de implementacao no frontend.

---

## 5. Mensagens de Contexto Sugeridas

O `body.text` da mensagem CTA URL deve variar conforme o contexto:

| Contexto | Mensagem sugerida |
|----------|-------------------|
| Pos-gasto | "Gasto registrado! Veja o impacto no seu dashboard." |
| Pos-relatorio | "Quer ver o relatorio completo com graficos? Acesse o dashboard." |
| Pos-agenda | "Evento criado! Veja sua agenda completa no dashboard." |
| Pos-saldo | "Confira todos os detalhes no dashboard." |

---

## 6. Fluxo no N8N — Diagrama

```
[Resposta da IA enviada via texto]
  |
  v
[IF: branch e financeiro/agenda?]
  |
  +-- SIM --> [Wait 1s] --> [HTTP Request: CTA URL "Ver Dashboard"]
  |
  +-- NAO --> [Fim]
```

**Nota:** O `Wait 1s` e opcional mas recomendado para que o botao chegue DEPOIS da resposta de texto, nao antes.

---

## 7. Tratamento de Erro

Se a API da Meta retornar erro:

```javascript
// No node HTTP Request, configurar "On Error": "Continue"
// Logar o erro mas nao impactar o fluxo principal

if ($json.error) {
  // Logar: erro ao enviar botao dashboard
  // NAO falhar o fluxo — a resposta de texto ja foi enviada
  console.log("Dashboard button failed:", $json.error.message);
}
```

**Principio:** O botao e um **complemento**. Se falhar, o usuario ja recebeu a resposta principal. Nao deve causar falha no fluxo.

---

## 8. Testes Necessarios

| Teste | Descricao | Resultado esperado |
|-------|-----------|-------------------|
| T1 | Enviar CTA URL para usuario dentro da janela 24h | Botao aparece e abre URL |
| T2 | Enviar CTA URL para usuario FORA da janela 24h | Erro 400 da API (esperado) |
| T3 | Clicar no botao | Navegador abre em totalassistente.com.br |
| T4 | Verificar que nao gera webhook callback | Nenhuma execucao disparada ao clicar |
| T5 | Enviar resposta texto + botao em sequencia | Ambas mensagens chegam na ordem |
| T6 | Verificar display_text no celular | Texto "Ver Dashboard" visivel |
| T7 | Testar com URL invalida (proposital) | API retorna erro, fluxo nao quebra |
