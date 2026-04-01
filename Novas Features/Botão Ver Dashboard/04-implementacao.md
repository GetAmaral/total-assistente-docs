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

O botao so deve ser enviado **apos criacoes/registros**. A logica e simples: o usuario acabou de criar algo e pode querer ver o resultado completo no dashboard.

### Regra: APENAS apos criacoes

| Cenario | Enviar botao? | Justificativa |
|---------|--------------|---------------|
| Registrou gasto | **Sim** | Quer ver impacto no dashboard |
| Registrou receita | **Sim** | Quer ver saldo atualizado |
| Criou evento na agenda | **Sim** | Quer ver agenda completa |
| Criou lembrete | **Sim** | Quer ver lembretes ativos |
| Consultou saldo/relatorio | **Nao** | Ja recebeu a info pelo WhatsApp |
| Saudacao / conversa casual | **Nao** | Irrelevante, vira spam |
| Onboarding / verificacao | **Nao** | Usuario ainda nao tem dados |
| Erro / falha do sistema | **Nao** | Nao faz sentido |
| Excluiu registro | **Nao** | Registro ja foi deletado |
| Pergunta generica | **Nao** | Sem relacao com dashboard |

### Por que so apos criacoes?

1. **Momento de curiosidade:** usuario acabou de criar algo e quer ver o resultado
2. **Evita fadiga:** se enviar em toda resposta, o usuario ignora o botao
3. **Contexto claro:** "voce criou X, veja no dashboard" faz sentido; "oi, veja o dashboard" nao faz
4. **Frequencia natural:** criacoes sao menos frequentes que consultas, entao o botao nao vira spam

### Logica de decisao no N8N

Adicionar um **IF node** antes do envio do botao:

```javascript
// Condicao: enviar botao APENAS apos criacoes/registros
const branch = $json.classification_branch;
const sendDashboard = [
  "registrar_gasto",
  "registrar_receita",
  "criar_evento",
  "criar_lembrete"
].includes(branch);

return sendDashboard;
```

**Nota:** Removidos `relatorio_financeiro`, `consultar_saldo` e `limite_gastos` da lista. Nesses casos o usuario ja recebeu a informacao via texto — o botao seria redundante.

---

## 4. Opcao: URL Dinamica por Usuario

Se o dashboard suportar deep-link com ID do usuario:

```json
"url": "https://totalassistente.com.br/dashboard?user={{ $json.user_id }}"
```

Isso permitiria abrir o dashboard ja com os dados do usuario carregados. Depende de implementacao no frontend.

---

## 5. Mensagens de Contexto Sugeridas

O `body.text` da mensagem CTA URL deve variar conforme o tipo de criacao:

| Criacao | Mensagem sugerida |
|---------|-------------------|
| Gasto registrado | "Gasto registrado! Veja o impacto no seu dashboard." |
| Receita registrada | "Receita registrada! Confira seu saldo atualizado no dashboard." |
| Evento criado | "Evento criado! Veja sua agenda completa no dashboard." |
| Lembrete criado | "Lembrete criado! Veja todos os seus lembretes no dashboard." |

---

## 6. Fluxo no N8N — Diagrama

```
[Resposta da IA enviada via texto (confirmacao da criacao)]
  |
  v
[IF: branch e de criacao? (registrar_gasto, registrar_receita, criar_evento, criar_lembrete)]
  |
  +-- SIM --> [Wait 1s] --> [HTTP Request: CTA URL "Ver Dashboard"]
  |
  +-- NAO --> [Fim — so a resposta de texto]
```

**O fluxo gera DUAS mensagens separadas no WhatsApp:**
1. Mensagem de texto: "Gasto de R$50,00 registrado com sucesso!"
2. Mensagem interativa (CTA URL): corpo contextual + botao "Ver Dashboard"

**Nota:** O `Wait 1s` e recomendado para garantir que o botao chegue DEPOIS da resposta de texto, nao antes. A ordem importa para a experiencia do usuario.

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
