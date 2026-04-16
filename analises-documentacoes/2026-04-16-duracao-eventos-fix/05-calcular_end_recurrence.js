// ────────────────────────────────────────
// Node: "Calcular end & Recurrence"
// Workflow: Lembretes Total Assistente
// Localização: linha ≈ 1082 do JSON do workflow
// Atualizado: 2026-04-16
// Mudança: aceitar campo `duracao_minutos` vindo do body, com fallback 15.
// ────────────────────────────────────────

const inp = $json;

function toGoogleDateLocal(dt){
  // dt vem como 'YYYY-MM-DDTHH:mm:ss-03:00'. Precisamos formatar EXDATE em 'YYYYMMDDTHHmmss'
  // sem separadores. Usaremos a parte local sem offset.
  const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if(!m) return null;
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}`;
}

function addMinutes(dtIso, minutes){
  // Opera em string ISO com offset -03:00 preservando o offset
  const ms = new Date(dtIso).getTime() + minutes*60*1000;
  const z = new Date(ms);
  const pad = n => String(n).padStart(2,'0');
  const y = z.getUTCFullYear();
  const mo = pad(z.getUTCMonth()+1);
  const da = pad(z.getUTCDate());
  const hh = pad(z.getUTCHours());
  const mm = pad(z.getUTCMinutes());
  const ss = pad(z.getUTCSeconds());
  // Reconstrói mantendo offset -03:00 (UTC -> BRT = UTC-3h)
  let H = parseInt(hh,10) - 3;
  let carryDate = 0;
  if (H < 0) { H += 24; carryDate = -1; }
  if (H > 23) { H -= 24; carryDate = 1; }
  const dateObj = new Date(`${y}-${mo}-${da}T00:00:00Z`);
  dateObj.setUTCDate(dateObj.getUTCDate()+carryDate);
  const Y = dateObj.getUTCFullYear();
  const M = pad(dateObj.getUTCMonth()+1);
  const D = pad(dateObj.getUTCDate());
  const HH = pad(H);
  return `${Y}-${M}-${D}T${HH}:${mm}:${ss}-03:00`;
}

const nome = String(inp.nome_lembrete||'').trim() || 'Lembrete sem descrição';
let rrule = String(inp.rrule_raw||'').trim();
const dtstart = String(inp.dtstart_raw||'').trim();
const timezone = String(inp.timezone_raw||'America/Sao_Paulo').trim();
const until = String(inp.until_raw||'').trim();
const exdates = String(inp.exdates_raw||'').trim();
const description = String(inp.description||'').trim();
const user_id = String(inp.user_id||'').trim();

// NOVO (2026-04-16): duração customizada, fallback 15 min.
// Sanitiza: só aceita número inteiro > 0. Limite de segurança: no máximo 24h (1440 min).
function sanitizeDuracao(raw){
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 15;
  const inteiro = Math.floor(n);
  if (inteiro < 1) return 15;
  if (inteiro > 1440) return 1440; // teto de 24h
  return inteiro;
}
const duracao = sanitizeDuracao(inp.duracao_minutos);

if(!rrule) throw new Error('RRULE é obrigatório');
if(!dtstart) throw new Error('dtstart é obrigatório');
if(!user_id) throw new Error('user_id é obrigatório');

// injeta UNTIL na RRULE se provided (em UTC com Z). Converter -03:00 -> Z
function toUntilZ(iso){
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const pad = n=> String(n).padStart(2,'0');
  const M = pad(d.getUTCMonth()+1);
  const D = pad(d.getUTCDate());
  const H = pad(d.getUTCHours());
  const m = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `${y}${M}${D}T${H}${m}${s}Z`;
}

let rruleFinal = rrule;
if(until){
  const untilZ = toUntilZ(until);
  if(rruleFinal.includes('UNTIL=')){
    rruleFinal = rruleFinal.replace(/UNTIL=[^;]+/, `UNTIL=${untilZ}`);
  } else {
    rruleFinal += `;UNTIL=${untilZ}`;
  }
}

// calcula end = dtstart + duracao_minutos (fallback 15)
const end = addMinutes(dtstart, duracao);

// monta recurrence array
const recurrence = [];
recurrence.push(`RRULE:${rruleFinal}`);
if(exdates){
  const parts = exdates.split(',').map(s=>s.trim()).filter(Boolean);
  const list = parts.map(toGoogleDateLocal).filter(Boolean).join(',');
  if(list){
    recurrence.push(`EXDATE;TZID=${timezone}:${list}`);
  }
}

return {
  summary: nome,
  description,
  start: dtstart,
  end,
  timezone,
  user_id,
  rrule: rruleFinal,
  duracao_minutos: duracao,
  recurrence
};
