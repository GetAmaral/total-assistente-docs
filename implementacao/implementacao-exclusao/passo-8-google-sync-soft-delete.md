# Passo 8 — Google Sync Soft Delete

**Onde:** Supabase Edge Function `google-calendar-webhook`
**Resolve:** ALTA-4 (exclusao silenciosa via Google Calendar sync)
**Risco:** MEDIO (altera Edge Function em producao)
**Camada Swiss Cheese:** 4 (reversibilidade) + 10 (audit log)

---

## O Que Fazer

Trocar o `.delete()` por `.update({ is_deleted: true, deleted_at: new Date() })` na Edge Function que sincroniza eventos do Google Calendar. Adicionar log de auditoria.

---

## 8.1 — Codigo Atual (linhas 178-187 do index.ts)

```typescript
// ATUAL — Hard delete silencioso
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

---

## 8.2 — Codigo Corrigido

**Acao:** Substituir o bloco acima pelo codigo abaixo no arquivo:
`/supabase/functions/google-calendar-webhook/index.ts`

```typescript
// CORRIGIDO — Soft delete com audit log
if (gEvent.status === 'cancelled') {
  console.log(`🗑️ Soft-deleting event ${googleEventId} (cancelled in Google)`);
  
  // 1. Buscar registro ANTES de marcar como excluido (para snapshot)
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
  
  // 2. Registrar no audit log
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
  
  // 3. Soft delete (marcar como excluido, NAO deletar)
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

## 8.3 — Arquivo Completo da Funcao (trecho relevante)

Para facilitar, aqui esta o trecho completo da funcao `processEventChange` com a correcao aplicada:

```typescript
async function processEventChange(userId: string, gEvent: any): Promise<void> {
  try {
    const googleEventId = gEvent.id;

    // Se evento foi deletado ou cancelado — SOFT DELETE
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

    // Validar campos obrigatorios
    if (!gEvent.start?.dateTime || !gEvent.end?.dateTime) {
      return; // Pular eventos de dia inteiro
    }

    // ... resto da funcao permanece igual ...
```

---

## 8.4 — Deploy da Edge Function

**Opcao A — Via Supabase CLI:**
```bash
cd /home/AIOS-Total/novo-site-testing
supabase functions deploy google-calendar-webhook
```

**Opcao B — Via Dashboard:**
1. Acesse o Dashboard do Supabase → Edge Functions
2. Localize `google-calendar-webhook`
3. Edite o codigo → substitua o trecho
4. Deploy

---

## Pre-requisitos

- Passo 5 (soft delete migration) DEVE ser executado ANTES deste passo
- Passo 7 (audit log migration) DEVE ser executado ANTES deste passo
- As colunas `is_deleted` e `deleted_at` devem existir na tabela `calendar`
- A tabela `deletion_log` deve existir

---

## Verificacao

1. Cancelar um evento no Google Calendar
2. Aguardar o webhook de sync disparar
3. Verificar no banco: evento deve ter `is_deleted = true` (NAO deletado permanentemente)
4. Verificar em `deletion_log`: deve existir registro com `deleted_by = 'google_sync'`
5. Verificar que o evento NAO aparece nas buscas do usuario (filtro RLS ou is_deleted)
