# Passo 5 — Soft Delete + Migration SQL

**Onde:** Supabase (banco de dados) + Calendar WebHooks + Financeiro
**Resolve:** ALTA-2 (hard delete sem recuperacao)
**Risco:** MEDIO (altera estrutura do banco e logica de exclusao)
**Camada Swiss Cheese:** 4 (reversibilidade — barreira de mitigacao)

---

## O Que Fazer

1. Adicionar colunas `is_deleted` e `deleted_at` nas tabelas `calendar` e `spent`
2. Trocar operacao `delete` por `update` nos nodes Supabase
3. Adicionar filtro `is_deleted = FALSE` em todos os SELECTs relevantes

---

## 5.1 — Migration SQL

**Onde executar:** Supabase SQL Editor (Dashboard → SQL Editor → New Query)

**IMPORTANTE:** Executar PRIMEIRO no ambiente DEV. So rodar em producao apos todos os testes passarem.

```sql
-- ============================================
-- MIGRATION: Soft Delete para Calendar e Spent
-- Data: 2026-04-04
-- Resolve: ALTA-2 (hard delete sem recuperacao)
-- ============================================

-- 1. Adicionar colunas na tabela calendar
ALTER TABLE calendar
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Adicionar colunas na tabela spent
ALTER TABLE spent
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Indice para performance (SELECTs filtrados por is_deleted)
CREATE INDEX IF NOT EXISTS idx_calendar_is_deleted ON calendar (is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_spent_is_deleted ON spent (is_deleted) WHERE is_deleted = FALSE;

-- 4. Atualizar RLS policy de SELECT para ignorar soft-deleted
-- Calendar
DROP POLICY IF EXISTS "Users can view their own calendar events" ON calendar;
CREATE POLICY "Users can view their own calendar events" ON calendar
  FOR SELECT USING (auth.uid() = user_id AND is_deleted = FALSE);

-- Spent
DROP POLICY IF EXISTS "Users can view their own expenses" ON spent;
CREATE POLICY "Users can view their own expenses" ON spent
  FOR SELECT USING (auth.uid() = fk_user AND is_deleted = FALSE);

-- 5. Manter policies de DELETE para compatibilidade
-- (caso algum processo ainda use DELETE direto)
-- As policies existentes de DELETE permanecem inalteradas.

-- 6. Funcao de limpeza automatica (purge apos 30 dias)
CREATE OR REPLACE FUNCTION purge_soft_deleted()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM calendar
  WHERE is_deleted = TRUE
  AND deleted_at < NOW() - INTERVAL '30 days';

  DELETE FROM spent
  WHERE is_deleted = TRUE
  AND deleted_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Para agendar a limpeza, usar pg_cron (se disponivel):
-- SELECT cron.schedule('purge-soft-deleted', '0 3 * * *', 'SELECT purge_soft_deleted()');
-- Isso roda todo dia as 3h da manha.
```

---

## 5.2 — Node: delete_supabase (TROCAR para UPDATE)

**Como encontrar:** No workflow "Calendar WebHooks", o mesmo node `delete_supabase` do Passo 2.
**Acao:** Trocar a operacao de `delete` para `update`.

**Node corrigido completo (ctrl+c ctrl+v):**

```json
{
  "parameters": {
    "operation": "update",
    "tableId": "calendar",
    "filters": {
      "conditions": [
        {
          "keyName": "session_event_id_google",
          "condition": "eq",
          "keyValue": "={{ $('tudo_edit1').item.json.session_event_id_google }}"
        },
        {
          "keyName": "id",
          "condition": "eq",
          "keyValue": "={{ $('Edit Fields4').item.json.event_id }}"
        },
        {
          "keyName": "user_id",
          "condition": "eq",
          "keyValue": "={{ $('Edit Fields4').item.json.user_id }}"
        }
      ]
    },
    "columns": {
      "mappingMode": "defineBelow",
      "value": {
        "is_deleted": true,
        "deleted_at": "={{ $now.toISO() }}"
      }
    }
  },
  "type": "n8n-nodes-base.supabase",
  "typeVersion": 1,
  "position": [2656, 1440],
  "id": "a4697511-af21-4689-a105-6bd21ee1b35e",
  "name": "delete_supabase",
  "credentials": {
    "supabaseApi": {
      "id": "kQkN5PrZm2GihQfS",
      "name": "Total Supabase"
    }
  }
}
```

**NOTA:** O node Supabase do N8N nao suporta `update` com `filters` no modo visual da mesma forma que o `delete`. Se o typeVersion 1 nao suportar essa sintaxe, use a alternativa abaixo com um **Code node**.

---

## 5.3 — Alternativa: Code Node para Soft Delete (Calendar)

Se o node Supabase nao suportar update com filtro na versao instalada, substitua `delete_supabase` por um **Code node**:

**Nome:** `soft_delete_calendar`
**Recebe de:** mesmo node que conectava ao `delete_supabase`
**Envia para:** mesmo node que `delete_supabase` conectava (`sucesso_google2`)

```javascript
// Soft Delete Calendar — Substitui delete_supabase
// Resolve: ALTA-2 (hard delete), CRITICA-1 (user_id no filtro)

const eventId = $('Edit Fields4').item.json.event_id;
const userId = $('Edit Fields4').item.json.user_id;
const googleEventId = $('tudo_edit1').item.json.session_event_id_google;

// Chamar Supabase REST API diretamente
const supabaseUrl = 'SEU_SUPABASE_URL'; // Trocar pela URL real
const supabaseKey = 'SEU_SERVICE_ROLE_KEY'; // Trocar pela key real

const response = await fetch(
  `${supabaseUrl}/rest/v1/calendar?id=eq.${eventId}&user_id=eq.${userId}&session_event_id_google=eq.${googleEventId}`,
  {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      is_deleted: true,
      deleted_at: new Date().toISOString()
    })
  }
);

const result = await response.json();

return [{
  json: {
    status: response.ok ? 'sucesso' : 'erro',
    registros_afetados: Array.isArray(result) ? result.length : 0,
    detalhes: result
  }
}];
```

**IMPORTANTE:** Trocar `SEU_SUPABASE_URL` e `SEU_SERVICE_ROLE_KEY` pelas variaveis reais. No N8N, usar credenciais do ambiente. Se quiser evitar hardcode, use Expression: `{{ $credentials.supabaseApi.host }}`.

---

## 5.4 — Node: delete_supabase1 (TROCAR para Code node)

**Mesmo padrao do 5.3, mas sem o filtro de `session_event_id_google`:**

**Nome:** `soft_delete_calendar_padrao`

```javascript
// Soft Delete Calendar (sem Google) — Substitui delete_supabase1
const eventId = $('Edit Fields4').item.json.event_id;
const userId = $('Edit Fields4').item.json.user_id;

const supabaseUrl = 'SEU_SUPABASE_URL';
const supabaseKey = 'SEU_SERVICE_ROLE_KEY';

const response = await fetch(
  `${supabaseUrl}/rest/v1/calendar?id=eq.${eventId}&user_id=eq.${userId}`,
  {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      is_deleted: true,
      deleted_at: new Date().toISOString()
    })
  }
);

const result = await response.json();

return [{
  json: {
    status: response.ok ? 'sucesso' : 'erro',
    registros_afetados: Array.isArray(result) ? result.length : 0,
    detalhes: result
  }
}];
```

---

## 5.5 — Financeiro: Delete a row → Soft Delete

**Como encontrar:** No workflow "Financeiro - Total", o node `Delete a row`.
**Acao:** Substituir por Code node `soft_delete_spent`.

**Nome:** `soft_delete_spent`

```javascript
// Soft Delete Spent — Substitui Delete a row
// Resolve: ALTA-2 (hard delete)
const idSpent = $('Get a row6').item.json.id_spent;
const fkUser = $json.id; // profile.id do usuario validado

const supabaseUrl = 'SEU_SUPABASE_URL';
const supabaseKey = 'SEU_SERVICE_ROLE_KEY';

const response = await fetch(
  `${supabaseUrl}/rest/v1/spent?id_spent=eq.${idSpent}&fk_user=eq.${fkUser}`,
  {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      is_deleted: true,
      deleted_at: new Date().toISOString()
    })
  }
);

const result = await response.json();

// Retornar dados do registro para o Redis7
return [{
  json: Array.isArray(result) && result.length > 0
    ? { ...result[0], status: 'sucesso' }
    : { status: 'erro', mensagem: 'nenhum registro afetado' }
}];
```

---

## 5.6 — Atualizar SELECTs que buscam eventos/gastos

Todos os nodes Supabase que fazem SELECT nas tabelas `calendar` e `spent` precisam do filtro `is_deleted = FALSE`. Isso inclui:

**Calendar (buscar eventos):**
- Qualquer node que busca eventos para listar ao usuario
- Adicionar filtro: `is_deleted` eq `false`

**Spent (buscar gastos):**
- Node `Get a row6` no Financeiro: adicionar filtro `is_deleted` eq `false`
- Qualquer node que busca gastos para exibir

**NOTA:** Se as RLS policies foram atualizadas (item 5.1), os SELECTs via `anon_key` ja filtram automaticamente. Porem, como o N8N usa `service_role_key` (que bypassa RLS), e necessario adicionar o filtro manualmente nos nodes.

---

## Verificacao

1. Executar migration SQL no DEV
2. Excluir um evento → verificar que `is_deleted = true` e `deleted_at` foram preenchidos
3. Verificar que o evento NAO aparece mais nas buscas
4. Verificar diretamente no banco que o registro ainda existe (SELECT sem filtro)
5. Excluir um gasto → mesmo teste
