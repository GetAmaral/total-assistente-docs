# Passo 8 — Google Sync Soft Delete

**Onde:** Supabase Edge Function `google-calendar-webhook`
**Resolve:** ALTA-4 (exclusao silenciosa via Google Calendar sync)

---

## O Que Fazer

Na Edge Function que recebe webhooks do Google Calendar, trocar `.delete()` por `.update()` e adicionar audit log.

---

## 8.1 — Trecho a substituir

**Arquivo:** `/supabase/functions/google-calendar-webhook/index.ts`
**Funcao:** `processEventChange` (por volta da linha 178)

**APAGAR este trecho:**

```typescript
    if (gEvent.status === 'cancelled') {
      console.log(`🗑️ Deleting event ${googleEventId} (cancelled in Google)`);
      await supabase
        .from('calendar')
        .delete()
        .eq('user_id', userId)
        .eq('session_event_id_google', googleEventId);
      return;
    }
```

**COLAR este trecho no lugar:**

```typescript
    if (gEvent.status === 'cancelled') {
      console.log(`🗑️ Soft-deleting event ${googleEventId} (cancelled in Google)`);

      // Buscar registro para snapshot
      const { data: eventData } = await supabase
        .from('calendar')
        .select('*')
        .eq('user_id', userId)
        .eq('session_event_id_google', googleEventId)
        .single();

      if (!eventData) {
        console.log(`Event ${googleEventId} not found in local DB, skipping`);
        return;
      }

      // Audit log
      await supabase
        .from('deletion_log')
        .insert({
          user_id: userId,
          table_name: 'calendar',
          record_id: eventData.id?.toString() || eventData.uuid || googleEventId,
          record_snapshot: eventData,
          deleted_by: 'google_sync',
          deletion_source: 'google-calendar-webhook'
        });

      // Soft delete
      await supabase
        .from('calendar')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('session_event_id_google', googleEventId);

      return;
    }
```

---

## 8.2 — Deploy

```bash
cd /caminho/do/projeto
supabase functions deploy google-calendar-webhook
```

Ou via Dashboard: Edge Functions → google-calendar-webhook → editar → salvar.

---

## Pre-requisitos

- Passo 5 (colunas is_deleted e deleted_at) JA executado
- Passo 7 (tabela deletion_log) JA executada

---

## Verificacao apos Passo 8

1. Cancelar um evento no Google Calendar
2. Aguardar sync
3. SQL: `SELECT is_deleted, deleted_at FROM calendar WHERE session_event_id_google = 'ID_GOOGLE'` → `true`
4. SQL: `SELECT * FROM deletion_log WHERE deletion_source = 'google-calendar-webhook' ORDER BY created_at DESC LIMIT 1` → registro com snapshot
