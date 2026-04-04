# Passo 7 — Audit Log (Tabela + Nodes INSERT)

**Onde:** Supabase (banco) + Calendar WebHooks + Financeiro
**Resolve:** MEDIA-5 (sem audit log de exclusoes)
**Risco:** BAIXO (apenas adiciona tabela e nodes INSERT, nao altera fluxo existente)
**Camada Swiss Cheese:** 10 (LOSA — auditoria continua de operacoes)

---

## O Que Fazer

1. Criar tabela `deletion_log` no Supabase
2. Adicionar nodes INSERT ANTES de cada operacao de exclusao
3. Registrar: quem excluiu, quando, o que, e um snapshot do registro

---

## 7.1 — Migration SQL: Criar tabela deletion_log

**Onde executar:** Supabase SQL Editor

```sql
-- ============================================
-- MIGRATION: Audit Log de Exclusoes
-- Data: 2026-04-04
-- Resolve: MEDIA-5 (sem audit log)
-- Camada: LOSA (Line Operations Safety Audit)
-- ============================================

CREATE TABLE IF NOT EXISTS deletion_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Quem
  user_id UUID NOT NULL,
  
  -- O que
  table_name TEXT NOT NULL,              -- 'calendar' ou 'spent'
  record_id TEXT NOT NULL,               -- uuid/id_spent do registro
  record_snapshot JSONB,                 -- copia COMPLETA do registro antes da exclusao
  
  -- Como
  deleted_by TEXT NOT NULL DEFAULT 'ai_agent',  -- 'ai_agent', 'button', 'google_sync', 'manual'
  deletion_source TEXT,                          -- 'prompt_excluir', 'excluir2', 'webhook_google', 'botao_whatsapp'
  
  -- Quando
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indice por usuario (para consultas de historico)
CREATE INDEX IF NOT EXISTS idx_deletion_log_user ON deletion_log (user_id, created_at DESC);

-- Indice por tabela (para analise de padroes)
CREATE INDEX IF NOT EXISTS idx_deletion_log_table ON deletion_log (table_name, created_at DESC);

-- RLS: usuario so ve seus proprios logs
ALTER TABLE deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deletion logs" ON deletion_log
  FOR SELECT USING (auth.uid() = user_id);

-- Apenas service_role pode inserir (N8N e Edge Functions)
CREATE POLICY "Service role can insert deletion logs" ON deletion_log
  FOR INSERT WITH CHECK (TRUE);

-- Ninguem pode deletar logs (imutavel)
-- Nenhuma policy de DELETE = bloqueado por padrao com RLS habilitado
```

---

## 7.2 — Node: log_exclusao_evento (Calendar WebHooks)

**Onde adicionar:** ANTES do node `delete_supabase` (ou `soft_delete_calendar`)
**Conexao:** Inserir ENTRE o node anterior e o DELETE. O log deve rodar ANTES da exclusao.

**Acao:**
1. No workflow "Calendar WebHooks", localize o ponto ANTES do DELETE
2. Adicione um node **Code** chamado `log_exclusao_evento`
3. Conecte: [node anterior] → `log_exclusao_evento` → `delete_supabase`

**Node Code para colar:**

```javascript
// Audit Log — Registrar exclusao de evento ANTES de executar
// Camada LOSA: captura snapshot completo para investigacao futura

const evento = $('Get a row').item.json;
const userId = $('Edit Fields4').item.json.user_id;

const supabaseUrl = 'SEU_SUPABASE_URL';
const supabaseKey = 'SEU_SERVICE_ROLE_KEY';

const logEntry = {
  user_id: userId,
  table_name: 'calendar',
  record_id: evento.id?.toString() || evento.uuid || 'unknown',
  record_snapshot: evento,
  deleted_by: 'ai_agent',
  deletion_source: 'prompt_excluir'
};

try {
  await fetch(`${supabaseUrl}/rest/v1/deletion_log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(logEntry)
  });
} catch (err) {
  // Log falhou — NAO bloquear a exclusao por causa disso
  console.error('Audit log insert failed:', err.message);
}

// Passar dados adiante sem modificar
return [$input.item];
```

---

## 7.3 — Node: log_exclusao_evento_padrao (caminho sem Google)

**Mesmo node, mas para o caminho `delete_supabase1`:**

```javascript
// Audit Log — Exclusao de evento (sem Google Calendar)
const evento = $('Get a row').item.json;
const userId = $('Edit Fields4').item.json.user_id;

const supabaseUrl = 'SEU_SUPABASE_URL';
const supabaseKey = 'SEU_SERVICE_ROLE_KEY';

const logEntry = {
  user_id: userId,
  table_name: 'calendar',
  record_id: evento.id?.toString() || evento.uuid || 'unknown',
  record_snapshot: evento,
  deleted_by: 'ai_agent',
  deletion_source: 'prompt_excluir_padrao'
};

try {
  await fetch(`${supabaseUrl}/rest/v1/deletion_log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(logEntry)
  });
} catch (err) {
  console.error('Audit log insert failed:', err.message);
}

return [$input.item];
```

---

## 7.4 — Node: log_exclusao_gasto (Financeiro)

**Onde adicionar:** ANTES do node `Delete a row` (ou `soft_delete_spent`) no workflow "Financeiro - Total"
**Conexao:** [If TRUE] → `log_exclusao_gasto` → `soft_delete_spent` → Redis7

```javascript
// Audit Log — Registrar exclusao de gasto ANTES de executar
const gasto = $('Get a row6').item.json;
const userId = $json.id; // profile.id do usuario validado

const supabaseUrl = 'SEU_SUPABASE_URL';
const supabaseKey = 'SEU_SERVICE_ROLE_KEY';

const logEntry = {
  user_id: userId,
  table_name: 'spent',
  record_id: gasto.id_spent || 'unknown',
  record_snapshot: {
    id_spent: gasto.id_spent,
    name_spent: gasto.name_spent,
    value_spent: gasto.value_spent,
    date_spent: gasto.date_spent,
    category_spent: gasto.category_spent,
    type_spent: gasto.type_spent,
    entra_sai_spent: gasto.entra_sai_spent
  },
  deleted_by: 'ai_agent',
  deletion_source: 'excluir2'
};

try {
  await fetch(`${supabaseUrl}/rest/v1/deletion_log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(logEntry)
  });
} catch (err) {
  console.error('Audit log insert failed:', err.message);
}

return [$input.item];
```

---

## 7.5 — Consultas Uteis para Analise (LOSA)

Copiar e colar no SQL Editor do Supabase para investigar padroes:

```sql
-- Todas as exclusoes das ultimas 24h
SELECT * FROM deletion_log
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Exclusoes por usuario especifico
SELECT * FROM deletion_log
WHERE user_id = 'UUID_DO_USUARIO'
ORDER BY created_at DESC
LIMIT 20;

-- Quantidade de exclusoes por dia (tendencia)
SELECT
  DATE(created_at) as dia,
  table_name,
  COUNT(*) as total
FROM deletion_log
GROUP BY dia, table_name
ORDER BY dia DESC;

-- Registros excluidos que podem ser restaurados (soft delete ativo)
SELECT
  dl.created_at as excluido_em,
  dl.table_name,
  dl.record_snapshot->>'event_name' as evento,
  dl.record_snapshot->>'name_spent' as gasto,
  dl.deleted_by,
  dl.deletion_source
FROM deletion_log dl
WHERE dl.created_at > NOW() - INTERVAL '30 days'
ORDER BY dl.created_at DESC;
```

---

## Verificacao

1. Excluir um evento → verificar que apareceu registro em `deletion_log`
2. Verificar que `record_snapshot` contem todos os dados do evento
3. Excluir um gasto → verificar que apareceu em `deletion_log`
4. Rodar consulta de ultimas 24h → deve mostrar as exclusoes feitas
