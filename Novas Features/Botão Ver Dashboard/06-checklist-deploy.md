# 06 — Checklist Pre-Deploy: Botao "Ver Dashboard"

**Metodologia:** Aviation Checklists (origem: Boeing B-17, 1935)
**Tipo:** Do-Confirm (executa a acao, depois confirma no checklist)

---

## Pre-Implementacao

- [ ] URL `https://totalassistente.com.br` responde com HTTP 200
- [ ] URL usa HTTPS (obrigatorio pela Meta)
- [ ] `display_text` "Ver Dashboard" tem <= 20 caracteres (14 chars)
- [ ] Credencial `WhatsApp Header Auth` esta ativa e valida
- [ ] Phone Number ID `744582292082931` esta correto

## Implementacao no N8N

- [ ] Node HTTP Request criado com payload CTA URL correto
- [ ] Campo `to` usa expressao dinamica (`={{ $json.phone }}`)
- [ ] URL esta em variavel/expressao (nao hardcoded no JSON)
- [ ] Node configurado com "On Error: Continue" (nao quebra o fluxo)
- [ ] IF node criado para filtrar branches adequados
- [ ] Wait node (1s) entre resposta de texto e botao (opcional)
- [ ] Logging de erro configurado (captura status != 200)

## Regras de Negocio

- [ ] Botao APENAS apos criacoes: `registrar_gasto`, `registrar_receita`, `criar_evento`, `criar_lembrete`
- [ ] Botao NAO e enviado apos consultas (saldo, relatorio, agenda)
- [ ] Botao NAO e enviado apos exclusoes
- [ ] Botao NAO e enviado durante onboarding
- [ ] Botao NAO e enviado em respostas de erro
- [ ] Botao NAO e enviado em saudacoes/conversas casuais
- [ ] Botao chega como **segunda mensagem separada** (apos a confirmacao de texto)

## Testes em DEV

- [ ] T1: Enviar CTA URL dentro da janela 24h — botao aparece
- [ ] T2: Enviar CTA URL fora da janela 24h — erro 400 tratado
- [ ] T3: Clicar no botao — navegador abre totalassistente.com.br
- [ ] T4: Verificar que clique NAO gera webhook callback
- [ ] T5: Resposta texto + botao chegam na ordem correta
- [ ] T6: display_text "Ver Dashboard" visivel no celular
- [ ] T7: URL invalida proposital — fluxo nao quebra
- [ ] T8: Verificar que branches de consulta/exclusao NAO recebem botao
- [ ] T9: Verificar que as duas mensagens (texto + botao) chegam na ordem correta

## Pos-Deploy (Producao)

- [ ] Monitoramento de taxa de erro ativo
- [ ] Analytics do dashboard configurado para medir acessos via botao
- [ ] Auditoria com squad auditor-real agendada para D+7
- [ ] Changelog da Meta adicionado ao monitoramento mensal

---

## Criterios de Rollback

Reverter a feature se:

| Condicao | Acao |
|----------|------|
| Taxa de erro > 10% nos envios | Desativar node, investigar |
| Usuarios reportam confusao/spam | Ajustar regras de contexto |
| Meta deprecia `cta_url` | Migrar para template CTA URL |
| Dashboard fica instavel | Desativar temporariamente |

---

*Checklist baseado em metodologia de aviacao — "Complexo demais para a memoria" (Boeing B-17, 1935)*
