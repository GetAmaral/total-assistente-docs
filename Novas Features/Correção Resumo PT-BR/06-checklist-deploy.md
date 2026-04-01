# 06 — Checklist Pre-Deploy: Correcao Resumo PT-BR

**Metodologia:** Aviation Checklists (origem: Boeing B-17, 1935)
**Tipo:** Do-Confirm (executa a acao, depois confirma no checklist)

---

## Pre-Implementacao

- [ ] Backup: anotar o system prompt ATUAL antes de alterar (copiado em `03-sistema-atual.md`)
- [ ] Confirmar que o node "Message a model" tem ID `9edf93b2-6287-44ce-b73d-752af1a1ade6`
- [ ] Confirmar que o modelo e `gpt-5.4-mini`
- [ ] Confirmar que a temperature e `0.3`
- [ ] Confirmar que max tokens e `500`

## Implementacao — Correcao 1 (System Prompt)

- [ ] Abrir workflow **Main - Total Assistente** no editor N8N
- [ ] Abrir node **"Message a model"**
- [ ] Apagar o system prompt atual
- [ ] Colar o novo prompt (de `04-implementacao.md`, secao "Prompt NOVO")
- [ ] Confirmar que o campo User Message continua `={{ $json.data }}`
- [ ] Confirmar que model, temperature e max tokens NAO foram alterados
- [ ] Salvar o node

## Implementacao — Correcao 2 (Node Validar PT-BR)

- [ ] Criar node **Code** no canvas
- [ ] Renomear para **"Validar PT-BR"**
- [ ] Configurar Mode: **Run Once for All Items**
- [ ] Configurar Language: **JavaScript**
- [ ] Colar o codigo JavaScript (de `04-implementacao.md`, secao "Codigo")
- [ ] Desconectar saida do "Message a model" do "Send message5"
- [ ] Conectar: Message a model → Validar PT-BR
- [ ] Conectar: Validar PT-BR → Send message5
- [ ] Conectar: Validar PT-BR → Log: audio_summary
- [ ] Confirmar que o fluxo visual esta: `Message a model → Validar PT-BR → Send message5 / Log`

## Implementacao — Correcao 3 (Log de Anomalia)

- [ ] Abrir node **"Log: audio_summary"**
- [ ] Se possivel, adicionar expressao no campo `error_message`:
      `={{ $json._ptbr_anomaly ? 'ANOMALY: non-latin chars detected and removed: ' + $json._ptbr_removed_chars : null }}`
- [ ] Se nao for possivel alterar schema, pular este passo (o texto ja chega limpo)

## Salvar e Ativar

- [ ] Salvar workflow (Ctrl+S ou botao "Save")
- [ ] Confirmar que o workflow esta **ativo** (toggle ON no canto superior)

## Testes

- [ ] **T1 — Teste basico:** Encaminhar um audio curto em portugues → clicar "Resuma para mim" → resumo chega 100% em PT-BR
- [ ] **T2 — Teste de regressao:** Confirmar que o formato da mensagem esta correto (`*Resumo do audio:*` + texto + assinatura)
- [ ] **T3 — Teste de fluxo completo:** Audio → transcricao chega → botao "Resuma para mim" aparece → clicar → resumo chega
- [ ] **T4 — Verificar log:** Consultar `execution_log` para o resumo recem-gerado → campo `summary_text` deve estar em PT-BR
- [ ] **T5 — Verificar Redis:** Confirmar que a transcricao continua sendo armazenada corretamente (nao afetada pela mudanca)

**IMPORTANTE:** NAO testar com payload de audio diretamente no webhook. Usar o fluxo natural (enviar audio pelo WhatsApp).

## Pos-Deploy

- [ ] Monitorar primeiros 10 resumos gerados apos o deploy
- [ ] Verificar se algum contem caracteres nao-latinos
- [ ] Agendar auditoria com squad auditor-real para D+7
- [ ] Adicionar query LOSA ao monitoramento semanal:
      `SELECT * FROM execution_log WHERE error_message LIKE '%non-latin%'`

---

## Criterios de Rollback

Reverter a feature se:

| Condicao | Acao |
|----------|------|
| Resumos param de funcionar apos a mudanca de prompt | Reverter para prompt original (backup em `03-sistema-atual.md`) |
| Node "Validar PT-BR" causa erro no fluxo | Desconectar node, reconectar "Message a model" direto ao "Send message5" |
| Falsos positivos: regex remove texto valido em PT-BR | Ajustar regex no node Code (caracteres latinos acentuados NAO sao afetados pelo regex atual) |
| Resumos ficam significativamente piores em qualidade | Ajustar prompt, reduzindo restricoes se necessario |

### Como reverter rapidamente

1. Abrir workflow Main - Total Assistente
2. Abrir node "Message a model"
3. Substituir o system prompt pelo original:
```
Voce e um assistente que resume textos de forma clara e concisa em portugues brasileiro. Resuma o texto mantendo os pontos principais. Apenas resuma. Apenas isso.
```
4. Se necessario, desconectar "Validar PT-BR" e reconectar "Message a model" → "Send message5" diretamente
5. Salvar workflow

---

*Checklist baseado em metodologia de aviacao — "Complexo demais para a memoria" (Boeing B-17, 1935)*
*Filosofia BBBK aplicada — "O cliente nunca pode ver o inseto" (Al Burger, Miami, 1960)*
