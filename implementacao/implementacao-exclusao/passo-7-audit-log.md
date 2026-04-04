# Passo 7 — Audit Log

**Onde:** Supabase (banco) + Calendar WebHooks + Financeiro
**Resolve:** MEDIA-5 (sem audit log de exclusoes)

---

## O Que Fazer

1. Rodar migration SQL criando tabela `deletion_log`
2. Adicionar nodes Supabase INSERT antes de cada soft delete

---

## 7.1 — Migration SQL

**Onde executar:** Supabase Dashboard → SQL Editor → New Query

```sql
-- MIGRATION: Audit Log de Exclusoes

CREATE TABLE IF NOT EXISTS deletion_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_snapshot JSONB,
  deleted_by TEXT NOT NULL DEFAULT 'ai_agent',
  deletion_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deletion_log_user ON deletion_log (user_id, created_at DESC);

ALTER TABLE deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deletion logs" ON deletion_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert deletion logs" ON deletion_log
  FOR INSERT WITH CHECK (TRUE);
```

---

## 7.2 — Calendar: log ANTES do delete_supabase

**Acao:**
1. Adicione um novo node **Supabase** (Insert)
2. Nomeie como: `log_exclusao_evento`
3. Posicao sugerida: [2550, 1440] (antes do delete_supabase)
4. Desconecte `limpar_tokens_e_reduzir_saida2` de `delete_supabase`
5. Conecte: `limpar_tokens_e_reduzir_saida2` → `log_exclusao_evento` → `delete_supabase`

**Configuracao do node Supabase:**

| Configuracao | Valor |
|-------------|-------|
| Operation | Insert |
| Table | `deletion_log` |

**Campos (Columns):**

| Campo | Tipo | Valor |
|-------|------|-------|
| `user_id` | String | `={{ $('Edit Fields4').item.json.user_id }}` |
| `table_name` | String | `calendar` |
| `record_id` | String | `={{ $('Get a row').item.json.id }}` |
| `record_snapshot` | String | `={{ JSON.stringify($('Get a row').item.json) }}` |
| `deleted_by` | String | `ai_agent` |
| `deletion_source` | String | `prompt_excluir_google` |

**Credenciais:** Total Supabase (mesma dos outros nodes)

---

## 7.3 — Calendar: log ANTES do delete_supabase1

**Acao:**
1. Adicione um novo node **Supabase** (Insert)
2. Nomeie como: `log_exclusao_evento_padrao`
3. Posicao sugerida: [1340, 1632] (antes do delete_supabase1)
4. Desconecte `If3` (output FALSE) de `delete_supabase1`
5. Conecte: `If3` (FALSE) → `log_exclusao_evento_padrao` → `delete_supabase1`

**Configuracao do node Supabase:**

| Configuracao | Valor |
|-------------|-------|
| Operation | Insert |
| Table | `deletion_log` |

**Campos (Columns):**

| Campo | Tipo | Valor |
|-------|------|-------|
| `user_id` | String | `={{ $('Edit Fields4').item.json.user_id }}` |
| `table_name` | String | `calendar` |
| `record_id` | String | `={{ $('Get a row').item.json.id }}` |
| `record_snapshot` | String | `={{ JSON.stringify($('Get a row').item.json) }}` |
| `deleted_by` | String | `ai_agent` |
| `deletion_source` | String | `prompt_excluir_padrao` |

**Credenciais:** Total Supabase

---

## 7.4 — Financeiro: log ANTES do Soft Delete (antigo Delete a row)

**Acao:**
1. Adicione um novo node **Supabase** (Insert)
2. Nomeie como: `log_exclusao_gasto`
3. Posicao sugerida: [-900, 1088] (antes do Soft Delete / Delete a row)
4. Desconecte `If` (TRUE) de `Delete a row`
5. Conecte: `If` (TRUE) → `log_exclusao_gasto` → `Soft Delete`

**Configuracao do node Supabase:**

| Configuracao | Valor |
|-------------|-------|
| Operation | Insert |
| Table | `deletion_log` |

**Campos (Columns):**

| Campo | Tipo | Valor |
|-------|------|-------|
| `user_id` | String | `={{ $json.id }}` |
| `table_name` | String | `spent` |
| `record_id` | String | `={{ $('Get a row6').item.json.id_spent }}` |
| `record_snapshot` | String | `={{ JSON.stringify($('Get a row6').item.json) }}` |
| `deleted_by` | String | `ai_agent` |
| `deletion_source` | String | `excluir2` |

**Credenciais:** Total Supabase

---

## Resultado Visual

**Calendar (caminho Google):**
```
ANTES:
... → limpar_tokens2 → delete_supabase → sucesso_google2

DEPOIS:
... → limpar_tokens2 → [log_exclusao_evento] → delete_supabase → verificar → sucesso_google2
```

**Financeiro:**
```
ANTES:
If (TRUE) → Delete a row → Redis7

DEPOIS:
If (TRUE) → [log_exclusao_gasto] → Soft Delete → Redis7
```

---

## Consultas uteis (colar no SQL Editor)

```sql
-- Ultimas exclusoes (verificar se esta funcionando)
SELECT * FROM deletion_log ORDER BY created_at DESC LIMIT 10;

-- Exclusoes de um usuario especifico
SELECT created_at, table_name, record_snapshot->>'event_name' as evento,
       record_snapshot->>'name_spent' as gasto, deleted_by
FROM deletion_log WHERE user_id = 'UUID_AQUI' ORDER BY created_at DESC;

-- Quantidade por dia (tendencia)
SELECT DATE(created_at) as dia, table_name, COUNT(*) as total
FROM deletion_log GROUP BY dia, table_name ORDER BY dia DESC;
```

---

## Verificacao apos Passo 7

1. Excluir um evento → `SELECT * FROM deletion_log ORDER BY created_at DESC LIMIT 1` → deve mostrar o registro com snapshot
2. Excluir um gasto → mesmo teste
3. Verificar que `record_snapshot` contem todos os dados do registro original
