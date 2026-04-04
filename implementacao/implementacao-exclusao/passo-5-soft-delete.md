# Passo 5 — Soft Delete

**Onde:** Supabase (banco) + Calendar WebHooks + Financeiro
**Resolve:** ALTA-2 (hard delete sem recuperacao)

---

## O Que Fazer

1. Rodar migration SQL no Supabase
2. Trocar operacao dos nodes DELETE para UPDATE (marcar como excluido em vez de apagar)
3. Adicionar filtro `is_deleted` nos nodes de busca

---

## 5.1 — Migration SQL

**Onde executar:** Supabase Dashboard → SQL Editor → New Query → colar e executar

```sql
-- MIGRATION: Soft Delete para Calendar e Spent
-- Rodar PRIMEIRO no DEV, depois em producao apos testes

-- 1. Colunas novas
ALTER TABLE calendar
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE spent
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Indice para performance
CREATE INDEX IF NOT EXISTS idx_calendar_active ON calendar (is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_spent_active ON spent (is_deleted) WHERE is_deleted = FALSE;

-- 3. Atualizar RLS de SELECT (filtrar soft-deleted)
DROP POLICY IF EXISTS "Users can view their own calendar events" ON calendar;
CREATE POLICY "Users can view their own calendar events" ON calendar
  FOR SELECT USING (auth.uid() = user_id AND is_deleted = FALSE);

DROP POLICY IF EXISTS "Users can view their own expenses" ON spent;
CREATE POLICY "Users can view their own expenses" ON spent
  FOR SELECT USING (auth.uid() = fk_user AND is_deleted = FALSE);

-- 4. Limpeza automatica apos 30 dias
CREATE OR REPLACE FUNCTION purge_soft_deleted()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM calendar WHERE is_deleted = TRUE AND deleted_at < NOW() - INTERVAL '30 days';
  DELETE FROM spent WHERE is_deleted = TRUE AND deleted_at < NOW() - INTERVAL '30 days';
END;
$$;
```

---

## 5.2 — Calendar: delete_supabase → UPDATE

**Como encontrar:** Node Supabase `delete_supabase` na posicao [2656, 1440].

**Acao:**
1. Abra o node `delete_supabase`
2. Mude **Operation** de `Delete` para `Update`
3. Mantenha os **3 filtros** do Passo 2 (session_event_id_google + id + user_id)
4. Na secao **Columns**, adicione:

| Campo | Tipo | Valor |
|-------|------|-------|
| `is_deleted` | Boolean | `true` |
| `deleted_at` | String | `={{ $now.toISO() }}` |

5. Salve o node

---

## 5.3 — Calendar: delete_supabase1 → UPDATE

**Como encontrar:** Node Supabase `delete_supabase1` na posicao [1440, 1632].

**Acao:**
1. Abra o node `delete_supabase1`
2. Mude **Operation** de `Delete` para `Update`
3. Mantenha os **2 filtros** do Passo 2 (id + user_id)
4. Na secao **Columns**, adicione:

| Campo | Tipo | Valor |
|-------|------|-------|
| `is_deleted` | Boolean | `true` |
| `deleted_at` | String | `={{ $now.toISO() }}` |

5. Salve o node

---

## 5.4 — Financeiro: Delete a row → UPDATE

**Como encontrar:** Node Supabase `Delete a row` na posicao [-800, 1088].

**Acao:**
1. Abra o node `Delete a row`
2. Mude **Operation** de `Delete` para `Update`
3. Mantenha os **2 filtros** existentes (id_spent + fk_user)
4. Na secao **Columns**, adicione:

| Campo | Tipo | Valor |
|-------|------|-------|
| `is_deleted` | Boolean | `true` |
| `deleted_at` | String | `={{ $now.toISO() }}` |

5. Renomeie o node para `Soft Delete` (opcional mas recomendado)
6. Salve o node

---

## 5.5 — Adicionar filtro is_deleted nos SELECTs

Como o N8N usa `service_role_key` (bypassa RLS), e preciso adicionar o filtro manualmente nos nodes que buscam registros.

**Calendar — qualquer node Supabase que faz SELECT na tabela `calendar`:**
- Adicione filtro: `is_deleted` eq `false`

**Spent — node `Get a row6` (posicao [-1728, 1168]):**
1. Abra o node `Get a row6`
2. Nos filtros existentes (id_spent + fk_user), adicione um terceiro:

| Campo | Valor |
|-------|-------|
| Key Name | `is_deleted` |
| Key Value | `={{ false }}` (usar como expressao, nao texto) |

3. Salve

**Outros nodes de busca (buscar_eventos, buscar_financeiro tools):**
Se esses tools chamam webhooks que fazem SELECT internamente, os mesmos webhooks precisam do filtro `is_deleted = false`. Verifique cada webhook de busca e adicione o filtro.

---

## Resultado Visual

```
ANTES:
Delete a row: DELETE FROM spent WHERE id_spent = X AND fk_user = Y
→ Registro SUMIU para sempre

DEPOIS:
Soft Delete: UPDATE spent SET is_deleted = true, deleted_at = NOW() WHERE id_spent = X AND fk_user = Y
→ Registro marcado como excluido, recuperavel por 30 dias
```

---

## Verificacao apos Passo 5

1. Excluir um evento → SQL: `SELECT is_deleted, deleted_at FROM calendar WHERE id = X` → deve mostrar `true` e timestamp
2. O evento NAO deve aparecer em buscas do usuario
3. O registro DEVE existir no banco (SELECT sem filtro de is_deleted)
4. Mesmo teste para gastos
