# Auditoria de Brechas Backend — Sistema de Exclusao

**Data:** 2026-04-04
**Escopo:** Todos os endpoints, nodes N8N, Edge Functions e politicas RLS envolvidos em exclusao de eventos e gastos
**Base:** Leitura direta dos JSONs de producao + Edge Functions + migrations SQL
**Arquivos auditados:**
- `Calendar WebHooks - Total Assistente (3).json` (exclusao de eventos)
- `Financeiro - Total (3).json` (exclusao de gastos)
- `User Premium - Total (3).json` / `User Standard - Total (3).json` (tools do AI Agent)
- `supabase/functions/google-calendar-webhook/index.ts` (sync Google → local)
- `supabase/functions/delete-account/index.ts` (exclusao de conta)
- `supabase/functions/unlink-phone/index.ts` (desvincular telefone)
- `supabase/migrations/20250905*.sql` e `20250906*.sql` (RLS policies)
- `src/utils/rateLimiter.ts` (rate limiter existente)

---

## Resumo Executivo

Foram encontradas **13 brechas** no backend do sistema de exclusao, sendo **3 criticas**, **5 altas** e **5 medias**. A mais grave permite exclusao de eventos de OUTROS usuarios (cross-user deletion) porque os nodes Supabase de DELETE nao incluem `user_id` no filtro. O sistema tambem nao possui soft delete, audit log, rate limiting nos webhooks, nem tratamento de erro pos-exclusao.

---

## Mapa Completo dos Fluxos de Exclusao

### Fluxo 1 — Exclusao de Evento da Agenda

```
Usuario envia "exclui a reuniao de amanha"
    |
[Classificador "Escolher Branch"]
    |
    v
[prompt_excluir] → AI Agent interpreta
    |
    v
[buscar_eventos tool] → GET /buscar-eventos → retorna lista com uuid
    |
    v
[excluir_evento tool] → POST /excluir-evento-total (Basic Auth)
    |
    v
[Calendar WebHooks workflow]
    |
    v
[Edit Fields4] → extrai event_id + user_id do body
    |
    v
[Get a row] → SELECT * FROM calendar WHERE id = event_id AND user_id = user_id
    |                                                          ^^^^^^^^^^^^^^^^
    |                                                    VALIDA ownership aqui
    v
[buscar_conexao_user2] → busca conexao Google Calendar
    |
    v
[If3] → tem refresh_token?
    |
    ├─ SIM: [excluir_evento_google] → DELETE no Google Calendar
    |        |
    |        v
    |        [delete_supabase] → DELETE FROM calendar
    |                            WHERE session_event_id_google = X AND id = Y
    |                            ⚠️ SEM user_id NO FILTRO
    |
    └─ NAO: [delete_supabase1] → DELETE FROM calendar WHERE id = Y
                                  ⚠️ SEM user_id NO FILTRO
```

### Fluxo 2 — Exclusao de Gasto/Entrada Financeira

```
Usuario envia "apaga o gasto do mercado"
    |
[Classificador] → roteia para branch financeiro
    |
    v
[excluir2 prompt] → AI Agent interpreta
    |
    v
[buscar tool] → busca gastos no banco
    |
    v
[excluir_financeiro tool] → POST /excluir-supabase (Basic Auth)
    |                        body: { id_gasto, id_user }
    v
[Financeiro workflow]
    |
    v
[Get a row6] → SELECT * FROM spent WHERE id_spent = id_gasto AND fk_user = id_user
    |
    v
[If7] → name_spent existe? (verifica se achou registro)
    |
    ├─ SIM: [Get a row] → busca profile do usuario
    |        |
    |        v
    |        [If] → profile.id == Get_a_row6.fk_user?
    |        |
    |        ├─ SIM: [Delete a row] → DELETE FROM spent
    |        |                         WHERE id_spent = X AND fk_user = profile.id
    |        |                         ✅ TEM fk_user no filtro
    |        |
    |        └─ NAO: fluxo para (sem resposta de erro)
    |
    └─ NAO: fluxo para (sem resposta de erro) ⚠️
```

### Fluxo 3 — Sync Google Calendar (delecao silenciosa)

```
Google Calendar marca evento como "cancelled"
    |
    v
[google-calendar-webhook Edge Function]
    |
    v
processEventChange(userId, gEvent)
    |
    v
if (gEvent.status === 'cancelled')
    → supabase.from('calendar').delete()
       .eq('user_id', userId)
       .eq('session_event_id_google', googleEventId)
    → return (sem notificacao ao usuario) ⚠️
```

---

## Brechas Encontradas

### CRITICA-1: Cross-User Event Deletion (delete_supabase / delete_supabase1)

**Severidade:** CRITICA
**Nodes afetados:** `delete_supabase` (linha 1825), `delete_supabase1` (linha 1859)
**Arquivo:** `Calendar WebHooks - Total Assistente (3).json`

**O problema:**
O node "Get a row" (linha 1434) faz a validacao correta com `WHERE id = event_id AND user_id = user_id`. Porem, os nodes de DELETE que vem DEPOIS ignoram essa validacao:

```
delete_supabase:
  DELETE FROM calendar
  WHERE session_event_id_google = $('tudo_edit1').item.json.session_event_id_google
  AND id = $('Edit Fields4').item.json.event_id

delete_supabase1:
  DELETE FROM calendar
  WHERE id = $('Edit Fields4').item.json.event_id
```

Nenhum dos dois inclui `user_id` no filtro DELETE.

**Cenario de exploracao:**
1. Atacante descobre o `event_id` (UUID) de outro usuario
2. Envia POST para `/excluir-evento-total` com Basic Auth valido
3. "Get a row" retorna vazio (ownership falha) — MAS o fluxo pode continuar dependendo da configuracao do node
4. Mesmo que "Get a row" bloqueie, o RLS do Supabase usa `service_role_key` no N8N (bypassa RLS)

**Impacto:** Exclusao de eventos de qualquer usuario do sistema.

**Correcao:**
Adicionar `user_id` como filtro em AMBOS os nodes DELETE:
```
delete_supabase:
  + AND user_id = $('Edit Fields4').item.json.user_id

delete_supabase1:
  + AND user_id = $('Edit Fields4').item.json.user_id
```

---

### CRITICA-2: Webhook Aceita Qualquer user_id no Payload

**Severidade:** CRITICA
**Endpoints afetados:** `/excluir-evento-total`, `/excluir-supabase`
**Arquivo:** Ambos os workflows

**O problema:**
Os webhooks usam Basic Auth (credencial "Avelum") que e uma credencial UNICA compartilhada. Qualquer sistema que tenha essa credencial pode enviar requests com QUALQUER `user_id` no body.

O webhook NAO verifica se o `user_id` do body corresponde ao usuario autenticado. Na pratica:
- Basic Auth = "voce tem acesso ao sistema?" (autenticacao)
- Mas NAO responde: "voce e DONO deste recurso?" (autorizacao)

**Cenario de exploracao:**
1. Qualquer servico interno com a credencial Avelum pode deletar recursos de qualquer usuario
2. Se a credencial vazar (esta hardcoded no JSON do workflow), qualquer pessoa pode deletar qualquer coisa

**Impacto:** Escalacao horizontal — acesso a recursos de todos os usuarios.

**Correcao:**
- Curto prazo: Validar que o `user_id` do body corresponde ao usuario da sessao ativa (via token JWT ou header adicional)
- Longo prazo: Substituir Basic Auth por JWT com `user_id` extraido do token (nao do body)

---

### CRITICA-3: N8N Usa Service Role Key (Bypassa RLS)

**Severidade:** CRITICA
**Nodes afetados:** Todos os nodes Supabase nos workflows N8N
**Contexto:** Credencial "Total Supabase" (ID: `kQkN5PrZm2GihQfS`)

**O problema:**
O Supabase tem RLS (Row Level Security) configurado corretamente:
```sql
CREATE POLICY "Users can delete their own calendar events" ON calendar
  FOR DELETE USING (auth.uid() = user_id);
```

Porem, o N8N se conecta com `service_role_key`, que BYPASSA todas as politicas RLS. Isso significa que:
- As RLS policies existem mas sao IRRELEVANTES para operacoes vindas do N8N
- O N8N pode deletar qualquer registro de qualquer usuario
- A unica protecao real e o filtro WHERE do node — que, como visto na CRITICA-1, esta incompleto

**Impacto:** A camada de defesa RLS do Supabase e completamente anulada.

**Correcao:**
- Adicionar filtros `user_id`/`fk_user` em TODOS os nodes DELETE (ja que RLS nao protege)
- Considerar usar `anon_key` + JWT do usuario em vez de `service_role_key` para operacoes de usuario

---

### ALTA-1: Fire-and-Forget — Sucesso Retornado Sem Verificacao

**Severidade:** ALTA
**Nodes afetados:** `sucesso_google2`, `sucesso_padrao2` (eventos), `Redis7` (financeiro)
**Arquivos:** Calendar WebHooks, Financeiro

**O problema (Eventos):**
Apos chamar `delete_supabase` ou `delete_supabase1`, o workflow retorna mensagens fixas:
- `"exclusao do evento na agenda google e padrao feito com sucesso."` (sucesso_google2)
- `"evento excluido na agenda padrao com sucesso"` (sucesso_padrao2)

Essas mensagens sao HARDCODED. Se o DELETE do Supabase falhar (timeout, constraint violation, etc), a mensagem de sucesso e retornada mesmo assim.

**O problema (Financeiro):**
O node `Redis7` grava o resultado no Redis e retorna ao webhook. Se o `Delete a row` falhar, o Redis7 ainda executa e retorna como se tivesse funcionado.

**Impacto:** Usuario acredita que o registro foi excluido quando pode nao ter sido.

**Correcao:**
- Adicionar node IF apos cada DELETE verificando `$json` de retorno
- Se vazio/erro → retornar mensagem de falha
- Se sucesso → retornar mensagem com detalhes do que foi excluido (nome, data, valor)

---

### ALTA-2: Hard Delete Sem Recuperacao

**Severidade:** ALTA
**Nodes afetados:** `delete_supabase`, `delete_supabase1`, `Delete a row`
**Tabelas:** `calendar`, `spent`

**O problema:**
Todas as exclusoes usam `operation: "delete"`, que executa `DELETE FROM` no banco. Nao existe:
- Coluna `is_deleted` ou `deleted_at` (soft delete)
- Periodo de graca para desfazer
- Backup pre-exclusao
- Lixeira do usuario

Uma vez excluido, o registro desaparece permanentemente.

**Impacto:** Qualquer erro (AI interpretou errado, usuario se arrependeu, bug no sistema) resulta em perda irreversivel de dados.

**Correcao:**
```sql
-- Migration para soft delete
ALTER TABLE calendar ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE calendar ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE spent ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE spent ADD COLUMN deleted_at TIMESTAMPTZ;

-- Trocar DELETE por UPDATE
UPDATE calendar SET is_deleted = TRUE, deleted_at = NOW()
WHERE id = X AND user_id = Y;

-- Adicionar filtro em todos os SELECTs
WHERE is_deleted = FALSE
```

---

### ALTA-3: Falha Silenciosa Quando Registro Nao Existe

**Severidade:** ALTA
**Nodes afetados:** `If7` (financeiro), fluxo geral de eventos
**Arquivos:** Financeiro - Total (3).json

**O problema (Financeiro):**
O node `If7` verifica se `name_spent` existe (ou seja, se o registro foi encontrado). Se NAO existe:
- O branch FALSE nao tem conexao com nenhum node
- O workflow simplesmente PARA
- Nenhuma resposta e enviada ao webhook
- O AI Agent fica esperando uma resposta que nunca vem (ou recebe timeout)

**O problema (Eventos):**
Similar — se "Get a row" nao encontra o evento, o fluxo pode continuar sem dados validos ou parar silenciosamente.

**Impacto:**
- Usuario nao recebe feedback
- AI Agent pode interpretar silencio como sucesso
- Timeouts no lado do chamador

**Correcao:**
- Adicionar branch FALSE em `If7` retornando `{"error": "registro_nao_encontrado"}`
- Adicionar tratamento similar no fluxo de eventos

---

### ALTA-4: Exclusao Silenciosa via Google Calendar Sync

**Severidade:** ALTA
**Arquivo:** `supabase/functions/google-calendar-webhook/index.ts` (linhas 179-186)

**O problema:**
Quando o Google Calendar marca um evento como `cancelled`, a Edge Function deleta o registro local SILENCIOSAMENTE:

```typescript
if (gEvent.status === 'cancelled') {
  await supabase
    .from('calendar')
    .delete()  // Hard delete
    .eq('user_id', userId)
    .eq('session_event_id_google', googleEventId);
  return;  // Sem notificacao
}
```

O usuario NAO e notificado de que seu evento foi removido do Total Assistente. Se alguem com acesso ao Google Calendar do usuario deletar um evento, o registro local tambem desaparece sem rastro.

**Impacto:** Perda de dados sem conhecimento do usuario.

**Correcao:**
- Implementar soft delete neste ponto tambem
- Opcionalmente: enviar notificacao WhatsApp informando "Evento X foi removido da sua agenda Google e sincronizado"

---

### ALTA-5: Sem Rate Limiting nos Webhooks de Exclusao

**Severidade:** ALTA
**Endpoints afetados:** `/excluir-evento-total`, `/excluir-supabase`

**O problema:**
O `rateLimiter.ts` existente usa `localStorage` — e um rate limiter de FRONTEND (navegador). Nao se aplica aos webhooks N8N que rodam server-side.

Os webhooks de exclusao nao tem NENHUM rate limiting:
- Um atacante com a credencial Basic Auth pode enviar milhares de requests de exclusao por segundo
- Nao ha throttling, cooldown ou bloqueio por IP

**Impacto:** Exclusao em massa de todos os registros do sistema.

**Correcao:**
- Adicionar rate limiting no nivel do N8N (node de verificacao antes do processamento)
- Ou implementar rate limiting no reverse proxy/load balancer (Nginx, Cloudflare)
- Limite sugerido: max 5 exclusoes por usuario por minuto

---

### MEDIA-1: AI Agent Pode Ser Enganado por Linguagem Natural

**Severidade:** MEDIA
**Nodes afetados:** Tools `excluir_evento`, `excluir_financeiro`

**O problema:**
O AI Agent decide QUAL registro excluir baseado em interpretacao de linguagem natural. Cenarios problematicos:

1. **Ambiguidade:** "apaga o ultimo" — ultimo de qual periodo? Ultima mensagem ou ultimo registro no banco?
2. **Homonimos:** "exclui o mercado" — pode haver gastos "Mercado Livre", "Mercado Municipal", "Supermercado"
3. **Injecao de contexto:** usuario pode manipular o agente enviando mensagens que confundem o contexto

**Impacto:** Exclusao do registro errado.

**Correcao:** Ja abordada nos prompts corrigidos (documento `2026-04-04-prompts-exclusao-corrigidos.md`) com:
- Confirmacao visual antes de excluir quando ha ambiguidade
- Regras de desempate explicitas
- "Ultimo" = buscar por data mais recente no banco, nunca pelo contexto da conversa

---

### MEDIA-2: Resposta do Webhook Nao Inclui Detalhes do Registro Excluido

**Severidade:** MEDIA
**Nodes afetados:** `sucesso_google2`, `sucesso_padrao2`

**O problema:**
As respostas de sucesso sao genericas:
- `"exclusao do evento na agenda google e padrao feito com sucesso."` — Qual evento? Que data? Que horario?
- O AI Agent recebe essa resposta e precisa "lembrar" qual evento estava excluindo

Se o AI Agent confundir o contexto, pode informar ao usuario que excluiu "Reuniao com Carlos" quando na verdade excluiu "Dentista".

**Correcao:**
Retornar os detalhes do registro excluido na resposta:
```json
{
  "success": true,
  "deleted": {
    "event_name": "Reuniao com Carlos",
    "start_event": "2026-04-05T14:00:00",
    "end_event": "2026-04-05T15:00:00"
  }
}
```

---

### MEDIA-3: delete-account Edge Function — Janela de 5 Minutos

**Severidade:** MEDIA
**Arquivo:** `supabase/functions/delete-account/index.ts` (linhas 73-79)

**O problema:**
A validacao usa `Math.abs(reqTs - userTs) > 5 * 60 * 1000`. Isso significa que qualquer request com um `created_at` dentro de 5 minutos do real e aceito.

A funcao tambem:
- Nao exige Authorization header (apenas `user_id` e `created_at` no body)
- Usa `Access-Control-Allow-Origin: '*'` (qualquer dominio pode chamar)

**Cenario de exploracao:**
1. Atacante descobre `user_id` de conta recem-criada (nao confirmada)
2. Envia POST com `created_at` aproximado (janela de 5 min)
3. Conta e deletada antes do usuario confirmar email

**Atenuante:** So funciona com contas NAO confirmadas (`email_confirmed_at` null). Contas ativas estao protegidas.

**Correcao:**
- Exigir Authorization header com token valido
- Reduzir janela para 60 segundos
- Remover `Access-Control-Allow-Origin: '*'` (restringir ao dominio do app)

---

### MEDIA-4: Credenciais Hardcoded nos JSONs de Workflow

**Severidade:** MEDIA
**Contexto:** Todos os workflows N8N

**O problema:**
Os IDs de credenciais estao nos JSONs:
- `"Avelum Credential"` (ID: `fSx1ApZPcITxgUNE`) — Basic Auth dos webhooks
- `"Total Supabase"` (ID: `kQkN5PrZm2GihQfS`) — Service Role Key
- `"Upstash Redis"` (ID: `amNI4dVfk3J8Bz0v`)

Embora os VALUES das credenciais nao estejam expostos (N8N armazena separadamente), os IDs permitem:
- Mapear quais credenciais existem
- Identificar servicos usados (Supabase, Redis, Google Calendar)
- Em caso de acesso ao painel N8N, saber exatamente quais credenciais usar

**Correcao:**
- Manter JSONs de workflow fora de repositorios publicos
- Garantir que o repositorio `totalAssistente` seja privado

---

### MEDIA-5: Sem Audit Log de Exclusoes

**Severidade:** MEDIA
**Contexto:** Sistema inteiro

**O problema:**
Nenhuma exclusao e registrada em log persistente. Nao existe:
- Tabela `audit_log` ou `deletion_log`
- Log de quem excluiu, quando, qual registro
- Capacidade de investigar exclusoes incorretas
- Near-miss tracking (tentativas de exclusao que falharam)

Sem audit log, e impossivel:
- Investigar reclamacoes de usuarios ("meu evento sumiu")
- Identificar padroes de erro do AI Agent
- Fazer LOSA (Line Operations Safety Audit) — metodologia de aviacao para auditar operacoes normais

**Correcao:**
```sql
CREATE TABLE deletion_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  table_name TEXT NOT NULL,         -- 'calendar' ou 'spent'
  record_id TEXT NOT NULL,          -- uuid do registro excluido
  record_snapshot JSONB,            -- copia completa do registro antes da exclusao
  deleted_by TEXT NOT NULL,         -- 'ai_agent', 'button', 'google_sync'
  deletion_source TEXT,             -- 'prompt_excluir', 'excluir2', 'webhook_google'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Matriz de Risco

| ID | Brecha | Severidade | Probabilidade | Impacto | Prioridade |
|----|--------|-----------|---------------|---------|------------|
| CRITICA-1 | Cross-user event deletion | CRITICA | Media | Catastrofico | P0 |
| CRITICA-2 | Webhook aceita qualquer user_id | CRITICA | Media | Catastrofico | P0 |
| CRITICA-3 | Service role bypassa RLS | CRITICA | Certa | Alto | P0 |
| ALTA-1 | Fire-and-forget (sucesso sem verificar) | ALTA | Alta | Alto | P1 |
| ALTA-2 | Hard delete sem recuperacao | ALTA | Alta | Alto | P1 |
| ALTA-3 | Falha silenciosa (sem resposta de erro) | ALTA | Media | Medio | P1 |
| ALTA-4 | Exclusao silenciosa via Google sync | ALTA | Baixa | Alto | P2 |
| ALTA-5 | Sem rate limiting nos webhooks | ALTA | Baixa | Catastrofico | P2 |
| MEDIA-1 | AI Agent enganado por linguagem | MEDIA | Media | Medio | P2 |
| MEDIA-2 | Resposta sem detalhes do excluido | MEDIA | Alta | Baixo | P3 |
| MEDIA-3 | delete-account janela 5 min | MEDIA | Baixa | Medio | P3 |
| MEDIA-4 | Credenciais IDs nos JSONs | MEDIA | Baixa | Medio | P3 |
| MEDIA-5 | Sem audit log | MEDIA | Certa | Medio | P2 |

---

## BowTie — Visao Geral das Brechas

```
                    CAUSAS                              CONSEQUENCIAS
                    ======                              =============

[AI interpreta errado]──┐                        ┌──[Usuario perde evento]
[Atacante com cred]─────┤                        ├──[Usuario perde gasto]
[Google sync cancel]────┤     ┌─────────┐        ├──[Dados irrecuperaveis]
[User_id forjado]───────┼────>│ EXCLUSAO │───────>├──[Evento de outro user excluido]
[Race condition]────────┤     │ INDEVIDA │        ├──[Confianca perdida]
[Registro errado]───────┤     └─────────┘        ├──[Sem evidencia forense]
[Timeout/erro DB]───────┘                        └──[Falso positivo de sucesso]
                    
         BARREIRAS DE PREVENCAO          BARREIRAS DE MITIGACAO
         (entre causas e hazard)         (entre hazard e consequencias)
         
         ❌ user_id no DELETE            ❌ Soft delete
         ❌ JWT no webhook               ❌ Audit log
         ❌ Rate limiting                ❌ Notificacao ao usuario
         ⚠️ Get a row valida            ❌ Lixeira com grace period
            (mas DELETE ignora)          ❌ Undo button
         ✅ RLS no Supabase             ⚠️ Resposta de sucesso
            (mas bypassed por              (mas sem detalhes)
             service_role_key)
         ✅ Basic Auth
            (mas credencial unica)

Legenda: ✅ existe | ⚠️ existe parcialmente | ❌ nao existe
```

---

## Plano de Correcao por Prioridade

### P0 — Corrigir AGORA (CRITICAS)

**1. Adicionar user_id nos nodes DELETE do Calendar WebHooks:**
- Node `delete_supabase`: adicionar filtro `user_id = $('Edit Fields4').item.json.user_id`
- Node `delete_supabase1`: adicionar filtro `user_id = $('Edit Fields4').item.json.user_id`
- Tempo estimado: 5 minutos no editor N8N

**2. Validar ownership no webhook:**
- Adicionar node IF apos "Edit Fields4" comparando `user_id` do body com o `user_id` retornado por "Get a row"
- Se nao bater → retornar erro 403
- Tempo estimado: 10 minutos

### P1 — Corrigir esta semana (ALTAS)

**3. Implementar verificacao pos-DELETE:**
- Adicionar node IF apos cada DELETE verificando se retornou registros afetados
- Se 0 registros → retornar erro
- Se 1+ registros → retornar detalhes do excluido

**4. Implementar soft delete:**
- Rodar migration ALTER TABLE (calendar + spent)
- Trocar operation:"delete" por operation:"update" em todos os nodes
- Adicionar WHERE is_deleted = FALSE em todos os SELECTs

**5. Adicionar branch de erro no If7 (financeiro):**
- Conectar saida FALSE do If7 a um node Set retornando `{"error": "not_found"}`

### P2 — Corrigir em 2 semanas (MEDIAS prioritarias)

**6. Implementar audit_log:**
- Criar tabela deletion_log
- Adicionar node INSERT antes de cada DELETE gravando snapshot do registro

**7. Adicionar rate limiting:**
- Node Function no inicio de cada webhook contando requests por user_id
- Ou configurar no reverse proxy (Cloudflare/Nginx)

**8. Soft delete no Google sync:**
- Trocar `.delete()` por `.update({ is_deleted: true, deleted_at: new Date() })`

### P3 — Backlog

**9. Respostas detalhadas dos webhooks**
**10. Restringir CORS do delete-account**
**11. Reduzir janela de 5 min para 60 seg**

---

## Conexao com Documentos Anteriores

| Documento | O que cobriu | O que este documento adiciona |
|-----------|-------------|-------------------------------|
| `2026-04-03-estudo-exclusao-profundo.md` | Fluxo completo node-a-node, 10 problemas (PF-1 a PF-10) | Vulnerabilidades de SEGURANCA (cross-user, auth bypass, RLS bypass) |
| `2026-04-04-exclusao-bbbk-aviacao.md` | 10 camadas de defesa inspiradas em aviacao | Mapeamento de quais camadas NAO existem no backend atual |
| `2026-04-04-prompts-exclusao-corrigidos.md` | Prompts corrigidos com 5 etapas | Brechas que prompts NAO resolvem (precisam de mudanca no backend/banco) |

**Conclusao:** Os prompts corrigidos resolvem problemas na CAMADA DO AI AGENT (classificacao, confirmacao, verificacao). Porem, existem brechas ABAIXO dessa camada (webhooks, nodes DELETE, banco de dados) que nenhum prompt pode corrigir. Este documento mapeia essas brechas e propoe correcoes especificas.
