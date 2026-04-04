# Passo 9 — Bateria de Testes de Exclusao

**Quando executar:** Apos implementar TODOS os passos anteriores no ambiente DEV
**Objetivo:** Validar cada camada de defesa individualmente e em conjunto
**Principio:** LOSA (Line Operations Safety Audit) — testar operacoes normais, nao apenas cenarios de erro

---

## Setup

1. Criar 5 eventos de teste no calendario do usuario DEV:
   - "Reuniao com Carlos" — amanha 14:00-15:00
   - "Consulta Dentista" — amanha 15:00-16:00
   - "Standup Daily" — amanha 09:00-09:30 (recorrente)
   - "Academia" — amanha 18:00-19:00
   - "Reuniao excluir teste" — amanha 11:00-12:00

2. Criar 5 gastos de teste:
   - "Mercado" — R$50,00 — hoje — saida
   - "Uber" — R$27,90 — ontem — saida
   - "Mercado" — R$73,00 — anteontem — saida (homonimo proposital)
   - "Pix Recebido" — R$200,00 — hoje — entrada
   - "Farmacia" — R$45,50 — hoje — saida

---

## CAMADA 1 — Classificador (Passo 1.3)

| ID | Input | Esperado | Verifica |
|----|-------|----------|----------|
| C1 | "marca reuniao excluir teste amanha as 11h" | criar_evento_agenda | Verbo principal = "marca" |
| C2 | "cria evento deletar planilha 9h" | criar_evento_agenda | Verbo principal = "cria" |
| C3 | "exclui a reuniao de teste" | excluir_evento_agenda | Verbo principal = "exclui" |
| C4 | "cancela o compromisso das 14h" | excluir_evento_agenda | Verbo principal = "cancela" |
| C5 | "quero que apague a consulta" | excluir_evento_agenda | Verbo principal = "apague" |
| C6 | "agenda compromisso apagar dados dia 5" | criar_evento_agenda | Verbo principal = "agenda" |

---

## CAMADA 2 — Confirmacao Visual (Passo 1.1 e 1.2)

| ID | Input | Esperado | Verifica |
|----|-------|----------|----------|
| V1 | "exclui a consulta dentista de amanha as 15h" | Excluir DIRETO (match exato: nome+data+hora) | Nao pede confirmacao |
| V2 | "cancela a reuniao" | Pede confirmacao (nome parcial, sem data) | Mostra evento + "Confirma?" |
| V3 | "apaga a reuniao de amanha" | Lista 2 resultados (Carlos + excluir teste) | Lista numerada |
| V4 | "apaga o gasto de mercado de 50 reais de hoje" | Excluir DIRETO (nome+valor+data) | Nao pede confirmacao |
| V5 | "remove o uber" | Pede confirmacao (so nome) | Mostra valor + data |
| V6 | "exclui o gasto de mercado" | Lista 2 resultados (50 e 73) | Lista numerada com valores |

---

## CAMADA 3 — Verificacao Pos-Exclusao (Passo 1 Etapa 5)

| ID | Input | Cenario | Esperado | Verifica |
|----|-------|---------|----------|----------|
| P1 | "exclui a academia de amanha" | Exclusao funciona | "🗑️ Evento excluido!" com detalhes | AI verificou resposta da tool |
| P2 | "exclui a academia de amanha" | Webhook retorna erro | "🗑️ Nao consegui concluir a exclusao" | AI NAO diz "excluido" |
| P3 | "apaga o gasto de farmacia" | Exclusao funciona | "🗑️ Exclusao concluida!" com valor | AI verificou resposta |

---

## CAMADA 4 — Soft Delete (Passo 5)

| ID | Acao | Esperado | Como verificar |
|----|------|----------|----------------|
| S1 | Excluir evento via prompt | `is_deleted = true`, `deleted_at` preenchido | SQL: `SELECT * FROM calendar WHERE id = X` |
| S2 | Excluir gasto via prompt | `is_deleted = true`, `deleted_at` preenchido | SQL: `SELECT * FROM spent WHERE id_spent = X` |
| S3 | Buscar eventos apos exclusao | Evento excluido NAO aparece | Enviar "meus compromissos de amanha" |
| S4 | Buscar gastos apos exclusao | Gasto excluido NAO aparece | Enviar "meus gastos de hoje" |

---

## CAMADA 5 — Respostas Detalhadas (Passo 3)

| ID | Acao | Esperado | Verifica |
|----|------|----------|----------|
| R1 | Excluir evento | Webhook retorna nome+inicio+fim+descricao | Log do AI Agent mostra dados |
| R2 | AI Agent exibe detalhes | Mensagem ao usuario tem nome real do evento | Nao diz "evento generico" |

---

## CAMADA 6 — Verificacao Pos-DELETE (Passo 6)

| ID | Cenario | Esperado | Verifica |
|----|---------|----------|----------|
| G1 | UPDATE no Supabase funciona | `verificar_delete_google` → TRUE → `sucesso_google2` com detalhes | AI recebe status="sucesso" + evento_nome |
| G2 | UPDATE no Supabase falha (event_id invalido) | `verificar_delete_google` → FALSE → `erro_delete_google` | AI recebe status="erro" e NAO diz "excluido" |

---

## CAMADA 7 — user_id no DELETE (Passo 2)

| ID | Cenario | Esperado | Como testar |
|----|---------|----------|-------------|
| U1 | Webhook com user_id correto | Exclusao funciona | Fluxo normal |
| U2 | Webhook com user_id de OUTRO usuario | Nenhum registro afetado | Chamar webhook via Postman com user_id diferente |

**Teste U2 — Como executar:**
```bash
curl -X POST https://SEU_DOMINIO/webhook/excluir-evento-total \
  -u "usuario:senha" \
  -H "Content-Type: application/json" \
  -d '{"event_id": "UUID_DE_EVENTO_EXISTENTE", "user_id": "UUID_DE_OUTRO_USUARIO"}'
```
Resultado esperado: resposta de erro ou "nenhum registro encontrado".

---

## CAMADA 8 — Branches de Erro (Passo 4)

| ID | Cenario | Esperado | Verifica |
|----|---------|----------|----------|
| E1 | Excluir evento que nao existe | Retorna `{"status":"erro","mensagem":"evento nao encontrado..."}` | AI responde "nao encontrei" |
| E2 | Excluir gasto que nao existe | Retorna `{"status":"erro","mensagem":"registro nao encontrado..."}` | AI responde "nao encontrei" |
| E3 | Excluir gasto de outro usuario | Retorna `{"status":"erro","mensagem":"permissao negada..."}` | Nao deleta |

---

## CAMADA 10 — Audit Log (Passo 7)

| ID | Acao | Esperado | Como verificar |
|----|------|----------|----------------|
| L1 | Excluir evento | Registro em deletion_log | SQL: `SELECT * FROM deletion_log ORDER BY created_at DESC LIMIT 1` |
| L2 | Verificar snapshot | record_snapshot contem dados completos | Campo JSON tem event_name, start_event, etc |
| L3 | Excluir gasto | Registro em deletion_log | SQL: mesma query |
| L4 | Google sync cancela evento | Registro em deletion_log com deleted_by='google_sync' | SQL com filtro |

---

## CAMADA GOOGLE SYNC (Passo 8)

| ID | Acao | Esperado | Como verificar |
|----|------|----------|----------------|
| GS1 | Cancelar evento no Google Calendar | Evento local marcado is_deleted=true | SQL: `SELECT is_deleted, deleted_at FROM calendar WHERE session_event_id_google = X` |
| GS2 | Verificar que nao sumiu | Registro ainda existe no banco | SELECT retorna resultado |
| GS3 | Verificar audit log | deletion_log tem entry com deleted_by='google_sync' | SQL |

---

## Checklist Final

Execute TODOS os testes acima. Marque como PASS ou FAIL:

| Camada | Testes | Status |
|--------|--------|--------|
| 1. Classificador | C1-C6 | [ ] |
| 2. Confirmacao | V1-V6 | [ ] |
| 3. Verificacao pos-exclusao | P1-P3 | [ ] |
| 4. Soft delete | S1-S4 | [ ] |
| 5. Respostas detalhadas | R1-R2 | [ ] |
| 6. Verificacao pos-DELETE | G1-G2 | [ ] |
| 7. user_id no DELETE | U1-U2 | [ ] |
| 8. Branches de erro | E1-E3 | [ ] |
| 10. Audit log | L1-L4 | [ ] |
| Google sync | GS1-GS3 | [ ] |

**Criterio de aprovacao:** 100% PASS. Qualquer FAIL bloqueia deploy para producao.

---

## Apos Todos os Testes Passarem

1. Exportar workflow DEV como JSON
2. Comparar com producao (diff visual)
3. Executar migration SQL em producao
4. Importar workflow corrigido em producao
5. Deploy Edge Function em producao
6. Rodar testes C1, V1, S1, U1, L1 em producao como smoke test
