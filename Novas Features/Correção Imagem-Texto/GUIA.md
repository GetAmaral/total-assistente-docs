# Correcao Imagem-Texto — Guia

**Problema:** Quando o usuario envia uma imagem com legenda (caption), a legenda e ignorada. O sistema usa apenas o texto extraido pelo OCR da imagem.
**Exemplo:** Foto de boleto Sicredi + legenda "pizza com amigos" → registra "Sicredi R$300" em vez de "pizza com amigos R$300"
**Solucao:** 2 nodes alterados. Zero nodes novos. Zero fios novos.

---

## Arquivos

| Arquivo | Workflow | Node |
|---------|----------|------|
| `passo1-edit-fields-main.json` | Main - Total Assistente | Edit Fields |
| `passo2-information-extractor2-premium.json` | User Premium - Total | Information Extractor2 |

---

## Passo 1 — Substituir "Edit Fields" no Main

**Workflow:** Main - Total Assistente
**Node:** Edit Fields (o que define `messageSet`)

1. Localizar o node `Edit Fields` no canvas do Main
   - Fica ANTES dos nodes `Premium User` / `Standard User`
   - Position aprox: [-10176, -256]
2. Clicar no node → abrir parametros
3. No campo `messageSet`, substituir a expressao:

**ANTES:**
```
{{ $json.messages[0].button?.text || $json.messages[0].text?.body }}
```

**DEPOIS:**
```
{{ $json.messages[0].button?.text || $json.messages[0].text?.body || $json.messages[0].image?.caption || $json.messages[0].document?.caption }}
```

**Alternativa rapida:** Deletar o node Edit Fields → Ctrl+V com o conteudo de `passo1-edit-fields-main.json` → reconectar os mesmos fios (entrada e saida).

> **O que muda:** Agora, quando o usuario envia imagem/documento com legenda, o campo `conversation` que chega no Premium workflow tera o texto da legenda. Para texto e botao, nada muda.

---

## Passo 2 — Substituir "Information Extractor2" no Premium

**Workflow:** User Premium - Total (Fix Conflito v2)
**Node:** Information Extractor2

1. Localizar o node `Information Extractor2` no canvas do Premium
   - Fica DEPOIS de `Aggregate4`
   - Fica ANTES de `Edit Fields` (o que extrai `mensagem`)
   - Position aprox: [-10976, -816]
2. Clicar no node → abrir o prompt (campo "Text")
3. O prompt INTEIRO ja esta pronto no arquivo `passo2-information-extractor2-premium.json`

**O que foi adicionado no prompt (logo no inicio, antes de "DATA ATUAL"):**

```
LEGENDA DO USUARIO (caption enviada junto com a imagem/documento):
{{ $('Evolution API- Take all').item.json.conversation }}

========================
REGRA DE PRIORIDADE PARA NOME DO GASTO
========================
- Se o usuario enviou uma LEGENDA (campo acima NAO vazio), o NOME DO GASTO deve ser a legenda do usuario, NAO o texto extraido pelo OCR.
- O OCR serve para extrair VALORES (R$), DATAS e HORARIOS.
- A legenda do usuario define o NOME/DESCRICAO do gasto ou evento.
- Exemplo: OCR diz "Sicredi R$300,00", legenda diz "pizza com amigos" → gasto = "pizza com amigos, R$300,00"
- Exemplo: OCR diz "Vivo R$89,90", legenda diz "internet casa" → gasto = "internet casa, R$89,90"
- Se NAO houver legenda (campo vazio), use o texto do OCR normalmente como faz hoje.
```

**Alternativa rapida:** Deletar o node Information Extractor2 → Ctrl+V com o conteudo de `passo2-information-extractor2-premium.json` → reconectar:
- Entrada: vem de `Aggregate4`
- Saida cima: vai para `Edit Fields` (o que extrai `mensagem`)
- Saida baixo: vem de `OpenAI Chat Model6` (sub-node, ja conecta automaticamente)

---

## Passo 3 — Salvar e Testar

Salvar ambos os workflows.

### Testes obrigatorios

| # | Cenario | O que enviar | Resultado esperado |
|---|---------|-------------|-------------------|
| 1 | Imagem SEM caption | Foto de recibo "Mercado R$150" | Gasto: "Mercado, R$150,00" (sem mudanca) |
| 2 | Imagem COM caption | Foto de boleto "Sicredi R$300" + legenda "pizza com amigos" | Gasto: "pizza com amigos, R$300,00" |
| 3 | Imagem COM caption descritiva | Foto de nota fiscal + legenda "almoco equipe" | Gasto: "almoco equipe" + valor do OCR |
| 4 | PDF COM caption | PDF de conta + legenda "conta de luz" | Gasto: "conta de luz" + valor do OCR |
| 5 | Texto normal | "gastei 50 em cafe" | Sem mudanca |
| 6 | Botao | Clique em botao | Sem mudanca |
| 7 | Audio | Audio qualquer | Sem mudanca |
| 8 | Imagem sem texto | Foto de paisagem sem caption | OCR vazio, nenhum gasto (sem mudanca) |

---

## Resumo tecnico

### Por que funciona

1. **Passo 1** faz a caption chegar como `conversation` no Premium workflow (antes chegava vazio)
2. **Passo 2** faz o GPT ver a caption E dar prioridade a ela sobre o OCR para o nome do gasto

### Por que e seguro

- Para imagens/documentos SEM caption: `image?.caption` retorna `undefined`, o `||` continua, `messageSet` fica vazio como hoje
- Para texto: `text?.body` ja captura antes de chegar em `image?.caption`
- Para botao: `button?.text` ja captura primeiro
- No prompt: quando `conversation` e vazio, o GPT ve campo vazio e ignora a regra de prioridade

### Prova de que o path esta correto

O node `BotGuard Normalize` (Main workflow) ja usa `msg.image?.caption` em producao com sucesso:
```javascript
if (msg.text?.body) body = msg.text.body;
else if (msg.image?.caption) body = msg.image.caption;
else if (msg.document?.caption) body = msg.document.caption;
```

Documentacao oficial Meta confirma: `messages[0].image.caption` e o path correto.

---

## Checklist

- [ ] Passo 1: expressao do Edit Fields atualizada no Main
- [ ] Passo 2: prompt do Information Extractor2 atualizado no Premium
- [ ] Salvar Main workflow
- [ ] Salvar Premium workflow
- [ ] Teste 1: imagem sem caption (comportamento igual)
- [ ] Teste 2: imagem com caption (caption vira nome do gasto)
- [ ] Teste 5: texto normal (sem mudanca)
