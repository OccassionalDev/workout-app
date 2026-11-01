'use strict';
const KEY = 'liftlog.v1', REST_KEY = 'liftlog.restEnd';
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Safe argument for an inline handler inside a double-quoted HTML attribute: JS-quote first, then HTML-escape.
const js = v => esc(JSON.stringify(v));

const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const MUSCLES = ['Chest','Back','Shoulders','Biceps','Triceps','Legs','Glutes','Core','Cardio','Other'];
const DEFAULTS = () => ({ exercises: [], templates: [], workouts: [], measurements: [], active: null, settings: { unit: 'kg', rest: 90 } });

/* Coerce stored / restored data into the shape the app expects (also neutralises odd types from backups). */
function normState(d) {
  const s = Object.assign(DEFAULTS(), d && typeof d === 'object' && !Array.isArray(d) ? d : {});
  s.settings = Object.assign(DEFAULTS().settings, s.settings && typeof s.settings === 'object' ? s.settings : {});
  if (!['kg', 'lb'].includes(s.settings.unit)) s.settings.unit = 'kg';
  s.settings.rest = Math.max(0, Math.round(num(s.settings.rest)));
  ['exercises', 'templates', 'workouts', 'measurements'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
  const str = v => v == null ? '' : String(v);
  const set = x => ({ type: x?.type === 'W' ? 'W' : 'N', w: Math.max(0, num(x?.w)), r: Math.max(0, Math.round(num(x?.r))), done: !!x?.done });
  const ex = e => ({ name: str(e.name).trim(), note: str(e.note), sets: (Array.isArray(e.sets) ? e.sets : []).map(set), ...(e.target ? { target: str(e.target) } : {}) });
  const exs = list => (Array.isArray(list) ? list : []).filter(e => e && typeof e === 'object' && str(e.name).trim()).map(ex);
  s.workouts = s.workouts.filter(w => w && typeof w === 'object').map(w => {
    const start = num(w.start) || Date.now();
    return { id: str(w.id) || uid(), name: str(w.name) || 'Workout', notes: str(w.notes), start, end: num(w.end) || start, exercises: exs(w.exercises) };
  });
  const a = s.active;
  s.active = a && typeof a === 'object' ? { name: str(a.name), notes: str(a.notes), start: num(a.start) || Date.now(), exercises: exs(a.exercises) } : null;
  s.templates = s.templates.filter(t => t && typeof t === 'object').map(t => ({ id: str(t.id) || uid(), name: str(t.name), notes: str(t.notes),
    exercises: (Array.isArray(t.exercises) ? t.exercises : []).filter(e => e && str(e.name).trim()).map(e => ({ name: str(e.name).trim(), sets: Math.min(50, Math.max(1, Math.round(num(e.sets)) || 1)), reps: str(e.reps), note: str(e.note) })) }));
  s.exercises = s.exercises.filter(e => e && str(e.name).trim()).map(e => ({ id: str(e.id) || uid(), name: str(e.name).trim(), muscle: MUSCLES.includes(e.muscle) ? e.muscle : 'Other' }));
  s.measurements = s.measurements.filter(x => x && typeof x === 'object').map(x => ({ date: num(x.date), weight: Math.max(0, num(x.weight)), bf: Math.max(0, num(x.bf)) }));
  return s;
}
let S = (() => { try { return normState(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return DEFAULTS(); } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { alert('Could not save: ' + e.message); } };

const BASE_EXERCISES = ['Bench Press (Barbell)','Incline Bench Press (Barbell)','Bench Press (Dumbbell)','Incline Bench Press (Dumbbell)','Chest Fly (Dumbbell)','Push Up','Overhead Press (Barbell)','Overhead Press (Dumbbell)','Lateral Raise (Dumbbell)','Triceps Pushdown (Cable)','Skullcrusher (Barbell)','Dip','Deadlift (Barbell)','Romanian Deadlift (Barbell)','Bent Over Row (Barbell)','Seated Row (Cable)','Lat Pulldown (Cable)','Pull Up','Chin Up','Face Pull (Cable)','Bicep Curl (Dumbbell)','Hammer Curl (Dumbbell)','Bicep Curl (Barbell)','Squat (Barbell)','Front Squat (Barbell)','Leg Press','Leg Extension (Machine)','Leg Curl (Machine)','Lunge (Dumbbell)','Bulgarian Split Squat','Hip Thrust (Barbell)','Calf Raise (Machine)','Plank','Crunch','Hanging Leg Raise','Cable Crossover'];
const allExercises = () => [...new Set([...BASE_EXERCISES, ...S.exercises.map(e => e.name), ...S.workouts.flatMap(w => w.exercises.map(e => e.name)), ...S.templates.flatMap(t => t.exercises.map(e => e.name))].filter(Boolean))].sort((a, b) => a.localeCompare(b));
const canonical = n => allExercises().find(x => x.toLowerCase() === n.toLowerCase()) || n;

const unit = () => S.settings.unit;
const fmt = n => (Math.round(num(n) * 10) / 10).toString();
const e1rm = (w, r) => !w || !r ? 0 : r === 1 ? w : w * (1 + r / 30);
const dt = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const dur = ms => { const m = Math.max(0, Math.floor(num(ms) / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const doneSets = e => e.sets.filter(s => s.done && s.type !== 'W');
const volume = w => w.exercises.reduce((a, e) => a + doneSets(e).reduce((b, s) => b + s.w * s.r, 0), 0);

/* ---------- routing (with Android back-button support) ---------- */
let route = { tab: 'workout' };
const go = (tab, extra = {}) => {
  const next = { tab, ...extra };
  if (JSON.stringify(next) !== JSON.stringify(route)) try { history.pushState({ r: next }, ''); } catch {}
  route = next; render(); window.scrollTo(0, 0);
};
window.go = go;
window.addEventListener('popstate', e => { route = e.state?.r || { tab: 'workout' }; render(); });

/* ---------- history helpers ---------- */
// Done sets (working and warm-up, split by type) from the most recent workout that has this exercise.
function prevSets(name) {
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const sets = S.workouts[i].exercises.filter(x => x.name === name).flatMap(x => x.sets.filter(s => s.done));
    if (sets.some(s => s.type !== 'W')) return { N: sets.filter(s => s.type !== 'W'), W: sets.filter(s => s.type === 'W') };
  }
  return { N: [], W: [] };
}
// Previous-session set matching set `si` (n-th working set ↔ n-th working set, warm-up ↔ warm-up).
const hintFor = (prev, sets, si) => { const t = sets[si].type === 'W' ? 'W' : 'N'; return prev[t][sets.slice(0, si).filter(x => (x.type === 'W' ? 'W' : 'N') === t).length]; };
function exerciseHistory(name) {
  return S.workouts.map(w => {
    const es = w.exercises.filter(x => x.name === name), sets = es.flatMap(doneSets);
    return sets.length ? { date: w.start, sets, note: es.map(e => e.note).filter(Boolean).join(' · ') } : null;
  }).filter(Boolean);
}
function records(name) {
  const h = exerciseHistory(name);
  let maxW = 0, best1 = 0, bestSet = null, bestSession = 0;
  h.forEach(x => {
    let vol = 0;
    x.sets.forEach(s => { maxW = Math.max(maxW, s.w); best1 = Math.max(best1, e1rm(s.w, s.r)); if (!bestSet || s.w * s.r > bestSet.w * bestSet.r) bestSet = s; vol += s.w * s.r; });
    bestSession = Math.max(bestSession, vol);
  });
  return { maxW, best1, bestSet, bestSession, sessions: h.length };
}

/* ---------- templates ---------- */
function normTemplate(t, i) {
  const where = `Template ${i + 1}`;
  if (!t || typeof t !== 'object' || Array.isArray(t)) throw new Error(`${where} is not an object.`);
  const name = String(t.name ?? '').trim();
  if (!name || !Array.isArray(t.exercises)) throw new Error(`${where}: each template needs a "name" and an "exercises" array.`);
  if (!t.exercises.length) throw new Error(`${where} ("${name}") has no exercises.`);
  return { id: uid(), name, notes: String(t.notes ?? ''), exercises: t.exercises.map((e, j) => {
    if (typeof e === 'string') e = { name: e };
    const ename = String(e?.name ?? '').trim();
    if (!ename) throw new Error(`${where} ("${name}"), exercise ${j + 1}: every exercise needs a "name".`);
    const sets = Math.min(50, Math.max(1, Array.isArray(e.sets) ? e.sets.length : parseInt(e.sets) || 3));
    const reps = e.reps != null && e.reps !== '' ? String(e.reps) : Array.isArray(e.sets) && e.sets.some(s => s?.reps != null) ? e.sets.map(s => s?.reps ?? '').join('/') : '10';
    return { name: canonical(ename), sets, reps, note: String(e.note ?? e.notes ?? '') };
  }) };
}
function parseTemplates(text) {
  let t = String(text ?? '').trim();
  if (!t) throw new Error('Paste the JSON first.');
  const fence = t.match(/```[\w-]*[^\S\r\n]*\r?\n?([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  else if (!/^[[{]/.test(t)) { // prose around the JSON, or an unterminated ``` fence
    const a = t.search(/[[{]/), b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
  }
  let data;
  try { data = JSON.parse(t); } catch {
    try { data = JSON.parse(t.replace(/[“”]/g, '"')); } // "smart quotes" from some editors
    catch { throw new Error('That is not valid JSON. Copy the whole code block from Claude\'s reply.'); }
  }
  let list = null;
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object') list = Array.isArray(data.templates) ? data.templates : data.templates && typeof data.templates === 'object' ? [data.templates] : data.template ? [data.template] : [data];
  if (!list || !list.length) throw new Error('No templates found in the JSON.');
  return list.map(normTemplate);
}
function importTemplates(text) { const out = parseTemplates(text); S.templates.push(...out); save(); return out.length; }
const CLAUDE_PROMPT = `Create workout templates for my workout tracking app. Ask me about my goals, split, equipment and days per week if you need to. When ready, reply with ONLY a JSON code block in exactly this format (one object per workout, "reps" can be a number or a range like "8-10"):

{"templates":[{"name":"Push Day","notes":"optional","exercises":[{"name":"Bench Press (Barbell)","sets":4,"reps":"6-8","note":"optional"}]}]}`;

let draft = null;
function viewTemplates() {
  if (route.sub === 'edit' && draft) return viewTemplateEdit();
  if (route.sub === 'import') return `
    <div class="card"><h2>Import from Claude</h2>
      <p class="muted">1. Copy this prompt and paste it into a chat with Claude.<br>2. Describe the workout you want.<br>3. Paste Claude's JSON reply below.</p>
      <pre>${esc(CLAUDE_PROMPT)}</pre>
      <button class="btn sec" onclick="copyPrompt()">Copy prompt</button></div>
    <div class="card"><textarea id="imp" placeholder="Paste JSON here" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea><p id="imperr" class="error"></p>
      <div class="row"><button class="btn grow" onclick="doImport()">Import</button><button class="btn sec" onclick="go('templates')">Cancel</button></div></div>`;
  return `<div class="row" style="margin-bottom:12px"><button class="btn grow" onclick="editTemplate()">+ New template</button><button class="btn sec" onclick="go('templates',{sub:'import'})">Import from Claude</button></div>` +
    (S.templates.map(t => `<div class="card"><div class="row"><h2 class="grow">${esc(t.name)}</h2>
      <button class="btn" onclick="startFromTemplate(${js(t.id)})">Start</button></div>
      ${t.notes ? `<p class="muted">${esc(t.notes)}</p>` : ''}
      <p class="muted">${t.exercises.map(e => `${esc(e.name)} ${esc(e.sets)}×${esc(e.reps)}`).join('<br>')}</p>
      <div class="row"><button class="link" onclick="editTemplate(${js(t.id)})">Edit</button><button class="link" onclick="dupTemplate(${js(t.id)})">Duplicate</button><button class="link" style="color:var(--danger)" onclick="delTemplate(${js(t.id)})">Delete</button></div></div>`).join('') ||
      '<p class="muted">No templates yet. Create one, or import one from a Claude chat. There is no limit.</p>');
}
function viewTemplateEdit() {
  return `<div class="card"><input id="tn" placeholder="Template name" value="${esc(draft.name)}" oninput="draft.name=this.value">
    <textarea placeholder="Template notes (optional)" style="min-height:50px;margin-top:6px" oninput="draft.notes=this.value">${esc(draft.notes)}</textarea>
    <p class="hdr" style="margin-bottom:0">Exercise · Sets · Reps</p>
    ${draft.exercises.map((e, i) => `<div class="tpl-ex"><input list="exlist" value="${esc(e.name)}" placeholder="Exercise" oninput="draft.exercises[${i}].name=this.value">
      <input type="number" inputmode="numeric" min="1" value="${esc(e.sets)}" aria-label="Sets" oninput="draft.exercises[${i}].sets=Math.min(50,Math.max(1,parseInt(this.value)||1))">
      <input value="${esc(e.reps)}" placeholder="Reps" aria-label="Reps" oninput="draft.exercises[${i}].reps=this.value">
      <button class="link" aria-label="Remove exercise" onclick="draft.exercises.splice(${i},1);render()">✕</button></div>`).join('')}
    <button class="btn sec" style="margin-top:10px" onclick="draft.exercises.push({name:'',sets:3,reps:'10',note:''});render()">+ Exercise</button></div>
    <div class="row"><button class="btn grow ok" onclick="saveTemplate()">Save</button><button class="btn sec" onclick="draft=null;go('templates')">Cancel</button></div>`;
}
window.editTemplate = id => { const t = S.templates.find(x => x.id === id); draft = t ? JSON.parse(JSON.stringify(t)) : { id: uid(), name: '', notes: '', exercises: [{ name: '', sets: 3, reps: '10', note: '' }] }; go('templates', { sub: 'edit' }); };
window.saveTemplate = () => {
  const t = JSON.parse(JSON.stringify(draft));
  t.name = t.name.trim();
  t.exercises = t.exercises.map(e => ({ ...e, name: canonical(e.name.trim()), reps: String(e.reps).trim() })).filter(e => e.name);
  if (!t.name || !t.exercises.length) return alert('Add a name and at least one exercise.');
  const i = S.templates.findIndex(x => x.id === t.id);
  i >= 0 ? S.templates[i] = t : S.templates.push(t); draft = null; save(); go('templates');
};
window.delTemplate = id => { if (confirm('Delete this template?')) { S.templates = S.templates.filter(t => t.id !== id); save(); render(); } };
window.dupTemplate = id => { const o = S.templates.find(x => x.id === id); if (!o) return; const t = JSON.parse(JSON.stringify(o)); t.id = uid(); t.name += ' (copy)'; S.templates.push(t); save(); render(); };
window.copyPrompt = () => (navigator.clipboard ? navigator.clipboard.writeText(CLAUDE_PROMPT) : Promise.reject()).then(() => alert('Copied. Paste it into Claude.'), () => alert('Copy failed. Select the text manually.'));
window.doImport = () => { try { const n = importTemplates($('#imp').value); alert(`Imported ${n} template${n === 1 ? '' : 's'}.`); go('templates'); } catch (e) { $('#imperr').textContent = 'Could not import: ' + e.message; } };

/* ---------- workout ---------- */
window.startFromTemplate = id => {
  const t = S.templates.find(x => x.id === id); if (!t) return render();
  startWorkout(t.name, t.exercises.map(e => {
    const prev = prevSets(e.name).N;
    return { name: e.name, note: e.note || '', sets: Array.from({ length: e.sets }, (_, i) => ({ type: 'N', w: prev[i]?.w || prev[prev.length - 1]?.w || 0, r: 0, done: false })), target: e.reps };
  }));
};
function startWorkout(name, exercises) {
  if (S.active && !confirm('Replace the workout in progress?')) return;
  S.active = { name: name || 'Workout', start: Date.now(), exercises, notes: '' }; stopRest(); save(); go('workout');
}
window.startEmpty = () => startWorkout('Quick Workout', []);
window.cancelWorkout = () => { if (confirm('Discard this workout?')) { S.active = null; save(); stopRest(); render(); } };
window.finishWorkout = () => {
  const a = S.active;
  // Work on a copy: the in-progress workout must stay intact if the user backs out.
  const exercises = a.exercises.map(e => ({ name: e.name, note: e.note, sets: e.sets.filter(s => s.done).map(s => ({ ...s })) })).filter(e => e.sets.length);
  if (!exercises.length) return alert('Complete at least one set first (tap ✓ next to a set).');
  const pending = a.exercises.reduce((n, e) => n + e.sets.filter(s => !s.done).length, 0);
  if (!confirm(pending ? `Finish workout? ${pending} unfinished set${pending === 1 ? '' : 's'} will be discarded.` : 'Finish workout?')) return;
  const before = {}; exercises.forEach(e => before[e.name] = records(e.name));
  const w = { id: uid(), name: a.name.trim() || 'Workout', notes: a.notes || '', start: a.start, end: Date.now(), exercises };
  S.workouts.push(w); S.active = null; save(); stopRest();
  const prs = [...new Set(exercises.map(e => e.name))].filter(n => { const r = records(n), b = before[n]; return b.sessions && (r.maxW > b.maxW || r.best1 > b.best1); });
  alert(`Workout saved! ${dur(w.end - w.start)} · ${fmt(volume(w))} ${unit()} volume` + (prs.length ? `\n\n🏆 New PRs: ${prs.join(', ')}` : ''));
  go('history');
};
function viewWorkout() {
  const a = S.active;
  if (!a) return `<div class="card"><h2>Start a workout</h2><p class="muted">Pick a template or start empty.</p><button class="btn" onclick="startEmpty()">Start empty workout</button></div>` +
    S.templates.map(t => `<div class="card row"><div class="grow"><h2>${esc(t.name)}</h2><span class="muted">${t.exercises.length} exercises</span></div><button class="btn" onclick="startFromTemplate(${js(t.id)})">Start</button></div>`).join('') +
    (S.templates.length ? '' : '<p class="muted">No templates yet. Add them in the Templates tab.</p>');
  return `<div class="card"><input value="${esc(a.name)}" placeholder="Workout name" oninput="S.active.name=this.value;save()"><p class="muted">⏱ <span id="elapsed">${clock(Date.now() - a.start)}</span></p>
    <textarea placeholder="Workout notes" style="min-height:50px" oninput="S.active.notes=this.value;save()">${esc(a.notes)}</textarea></div>` +
    a.exercises.map((e, ei) => {
      const prev = prevSets(e.name), pr = records(e.name);
      let n = 0;
      return `<div class="card"><div class="row"><h2 class="grow"><a href="#" style="color:var(--accent);text-decoration:none" onclick="event.preventDefault();go('exercises',{name:${js(e.name)}})">${esc(e.name)}</a></h2>
        <button class="link" aria-label="Remove exercise" onclick="removeExercise(${ei})">✕</button></div>
        ${e.target ? `<span class="muted">Target: ${esc(e.target)} reps</span>` : ''}
        <input placeholder="Notes" style="margin:6px 0" value="${esc(e.note)}" oninput="S.active.exercises[${ei}].note=this.value;save()">
        <div class="set hdr"><span>SET</span><span>${unit().toUpperCase()}</span><span>REPS</span><span></span></div>
        ${e.sets.map((s, si) => {
          const p = hintFor(prev, e.sets, si); if (s.type !== 'W') n++;
          return `<div class="set ${s.done ? 'done' : ''}"><button class="link setno" title="Tap to toggle warm-up" onclick="cycleType(${ei},${si})">${s.type === 'W' ? 'W' : n}</button>
          <input type="number" inputmode="decimal" min="0" step="any" aria-label="Weight" placeholder="${p ? fmt(p.w) : ''}" value="${s.w || ''}" oninput="setVal(${ei},${si},'w',this.value)">
          <input type="number" inputmode="numeric" min="0" step="1" aria-label="Reps" id="r-${ei}-${si}" placeholder="${p ? p.r : ''}" value="${s.r || ''}" oninput="setVal(${ei},${si},'r',this.value)">
          <button class="chk" aria-label="Complete set" onclick="toggleSet(${ei},${si})">✓</button></div>`; }).join('')}
        <div class="row" style="margin-top:8px"><button class="btn sec grow" onclick="addSet(${ei})">+ Add set</button>${e.sets.length ? `<button class="btn sec" onclick="removeSet(${ei})">− Set</button>` : ''}</div>
        ${pr.sessions ? `<p class="muted">Best: ${fmt(pr.maxW)} ${unit()} · est. 1RM ${fmt(pr.best1)}</p>` : ''}</div>`;
    }).join('') +
    `<div class="card"><input list="exlist" id="addex" placeholder="Add exercise…" enterkeyhint="done" onkeydown="if(event.key==='Enter')addExercise()"><button class="btn sec" style="margin-top:8px" onclick="addExercise()">+ Add exercise</button></div>
    <div class="row"><button class="btn ok grow" onclick="finishWorkout()">Finish</button><button class="btn danger" onclick="cancelWorkout()">Cancel</button></div>`;
}
window.cycleType = (ei, si) => { const s = S.active.exercises[ei].sets[si]; s.type = s.type === 'W' ? 'N' : 'W'; save(); render(); };
window.setVal = (ei, si, k, v) => { const x = Math.max(0, num(v)); S.active.exercises[ei].sets[si][k] = k === 'r' ? Math.round(x) : x; save(); };
window.addSet = ei => { const e = S.active.exercises[ei], l = e.sets[e.sets.length - 1]; e.sets.push({ type: 'N', w: l?.w || 0, r: 0, done: false }); save(); render(); };
window.removeSet = ei => { const e = S.active.exercises[ei], l = e.sets[e.sets.length - 1]; if (!l || (l.done && !confirm('Remove this completed set?'))) return; e.sets.pop(); save(); render(); };
window.removeExercise = ei => { const e = S.active.exercises[ei]; if (e.sets.some(s => s.done || s.r) && !confirm(`Remove ${e.name} and its sets?`)) return; S.active.exercises.splice(ei, 1); save(); render(); };
window.addExercise = () => {
  let n = $('#addex').value.trim(); if (!n) return;
  n = canonical(n);
  if (!allExercises().includes(n)) S.exercises.push({ id: uid(), name: n, muscle: 'Other' });
  S.active.exercises.push({ name: n, note: '', sets: [{ type: 'N', w: prevSets(n).N[0]?.w || 0, r: 0, done: false }] }); save(); render();
};
window.toggleSet = (ei, si) => {
  const e = S.active.exercises[ei], s = e.sets[si];
  if (!s.done) { // like Strong: completing a blank set copies last session's values shown as hints
    const p = hintFor(prevSets(e.name), e.sets, si);
    if (p) { if (!s.w) s.w = p.w; if (!s.r) s.r = p.r; }
    if (!s.r) { save(); render(); const el = $(`#r-${ei}-${si}`); el && el.focus(); return; }
  }
  s.done = !s.done; save(); render();
  s.done ? startRest(S.settings.rest) : stopRest();
};

/* rest timer (persisted so it survives reload) + elapsed clock */
let restEnd = (() => { try { return num(localStorage.getItem(REST_KEY)); } catch { return 0; } })();
function setRest(t) { restEnd = t; try { t ? localStorage.setItem(REST_KEY, String(t)) : localStorage.removeItem(REST_KEY); } catch {} drawRest(); }
function startRest(sec) { sec > 0 ? setRest(Date.now() + sec * 1000) : stopRest(); }
function stopRest() { setRest(0); }
window.addRest = d => { const t = restEnd + d; t > Date.now() ? setRest(t) : stopRest(); };
function drawRest() {
  let bar = $('#rest');
  if (!restEnd || restEnd <= Date.now()) { bar && bar.remove(); document.body.classList.remove('resting'); return; }
  if (!bar) { // build once, then only update the text so taps on the buttons are not lost to re-renders
    bar = document.createElement('div'); bar.id = 'rest'; bar.className = 'restbar';
    bar.innerHTML = `<span>Rest <b id="restt"></b></span><span class="row"><button onclick="addRest(-15000)">−15s</button><button onclick="addRest(15000)">+15s</button><button onclick="stopRest()">Skip</button></span>`;
    document.body.append(bar); document.body.classList.add('resting');
  }
  bar.querySelector('#restt').textContent = clock(restEnd - Date.now());
}
window.stopRest = stopRest; window.drawRest = drawRest;
setInterval(() => {
  if (restEnd) { if (Date.now() >= restEnd) { navigator.vibrate?.([200, 100, 200]); stopRest(); } else drawRest(); }
  const el = $('#elapsed'); if (el && S.active) el.textContent = clock(Date.now() - S.active.start);
}, 1000);

/* ---------- charts ---------- */
function chart(points, label) {
  if (points.length < 2) return `<p class="muted">Log at least 2 entries to see a chart.</p>`;
  const W = 320, H = 160, p = 24, xs = points.map(x => x.x), ys = points.map(x => x.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = v => p + (x1 === x0 ? 0.5 : (v - x0) / (x1 - x0)) * (W - 2 * p), Y = v => H - p - (y1 === y0 ? 0.5 : (v - y0) / (y1 - y0)) * (H - 2 * p);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><polyline fill="none" stroke="#4f8cff" stroke-width="2" points="${points.map(q => `${X(q.x)},${Y(q.y)}`).join(' ')}"/>
    ${points.map(q => `<circle cx="${X(q.x)}" cy="${Y(q.y)}" r="3" fill="#4f8cff"/>`).join('')}
    <text x="4" y="14" fill="#8a94a3" font-size="11">${fmt(y1)}</text><text x="4" y="${H - 6}" fill="#8a94a3" font-size="11">${fmt(y0)}</text>
    <text x="${W - 4}" y="14" fill="#8a94a3" font-size="11" text-anchor="end">${esc(label)}</text></svg>`;
}

/* ---------- exercises (history, records, charts, custom exercises) ---------- */
let metric = 'e1rm';
function viewExercises() {
  if (route.name != null) {
    const name = route.name, h = exerciseHistory(name), r = records(name);
    const val = { e1rm: x => Math.max(...x.sets.map(s => e1rm(s.w, s.r))), weight: x => Math.max(...x.sets.map(s => s.w)), volume: x => x.sets.reduce((a, s) => a + s.w * s.r, 0), reps: x => Math.max(...x.sets.map(s => s.r)) }[metric];
    // PR badge: the first set that beat the previous heaviest weight, in the session where it happened.
    let best = 0;
    const rows = h.map(x => { const top = Math.max(...x.sets.map(s => s.w)), prIdx = top > best ? x.sets.findIndex(s => s.w === top) : -1; best = Math.max(best, top); return { ...x, prIdx }; });
    return `<button class="link" onclick="go('exercises')">← All exercises</button><h2 style="margin:8px 0">${esc(name)}</h2>${S.exercises.some(e => e.name === name) ? `<div class="row"><button class="link" onclick="go('exercises',{sub:'new',edit:${js(name)}})">Edit</button><button class="link" style="color:var(--danger)" onclick="deleteExercise(${js(name)})">Delete</button></div>` : ''}
      <div class="card"><div class="stat"><div><span class="muted">Heaviest</span><b>${fmt(r.maxW)} ${unit()}</b></div><div><span class="muted">Est. 1RM</span><b>${fmt(r.best1)} ${unit()}</b></div>
      <div><span class="muted">Best set</span><b>${r.bestSet ? `${fmt(r.bestSet.w)} × ${r.bestSet.r}` : '—'}</b></div><div><span class="muted">Best session vol.</span><b>${fmt(r.bestSession)} ${unit()}</b></div></div></div>
      <div class="card"><select onchange="metric=this.value;render()">${[['e1rm','Estimated 1RM'],['weight','Heaviest weight'],['volume','Session volume'],['reps','Max reps']].map(([k, l]) => `<option value="${k}" ${metric === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div style="margin-top:8px">${chart(h.map(x => ({ x: x.date, y: val(x) })), metric === 'reps' ? 'reps' : unit())}</div></div>
      <h2 style="margin:8px 0">History</h2>` +
      (rows.reverse().map(x => `<div class="card"><b>${dt(x.date)}</b>${x.note ? `<div class="muted">${esc(x.note)}</div>` : ''}<br>${x.sets.map((s, i) => `${fmt(s.w)} ${unit()} × ${s.r}${i === x.prIdx ? ' <span class="pr">PR</span>' : ''}`).join('<br>')}</div>`).join('') || '<p class="muted">No history yet.</p>');
  }
  if (route.sub === 'new') return `<button class="link" onclick="go('exercises')">← Back</button><div class="card"><h2>${route.edit != null ? 'Edit' : 'New'} exercise</h2>
    <input id="xn" placeholder="Exercise name" value="${esc(route.edit ?? '')}" style="margin:8px 0" enterkeyhint="done">
    <select id="xm" aria-label="Muscle group">${MUSCLES.map(m => `<option ${(S.exercises.find(e => e.name === route.edit)?.muscle || 'Other') === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
    <div class="row" style="margin-top:10px"><button class="btn ok grow" onclick="saveExercise()">Save</button><button class="btn sec" onclick="go('exercises',${route.edit != null ? `{name:${js(route.edit)}}` : '{}'})">Cancel</button></div></div>`;
  return `<div class="row" style="margin-bottom:10px"><input id="exq" type="search" placeholder="Search" oninput="filterEx(this.value)"><button class="btn" onclick="go('exercises',{sub:'new'})">+ New</button></div><div id="exl">${exList('')}</div>`;
}
const exList = q => allExercises().filter(n => n.toLowerCase().includes(q.toLowerCase())).map(n => { const r = records(n), c = S.exercises.find(e => e.name === n);
  return `<div class="card row tap" onclick="go('exercises',{name:${js(n)}})"><div class="grow"><b>${esc(n)}</b><div class="muted">${c ? esc(c.muscle) + ' · custom · ' : ''}${r.sessions} session${r.sessions === 1 ? '' : 's'}</div></div><div class="muted">${r.maxW ? fmt(r.maxW) + ' ' + unit() : ''}</div></div>`; }).join('') || '<p class="muted">No exercises found.</p>';
window.filterEx = q => { $('#exl').innerHTML = exList(q); };
window.saveExercise = () => {
  const n = $('#xn').value.trim(); if (!n) return alert('Enter a name.');
  const old = route.edit, dup = allExercises().some(x => x.toLowerCase() === n.toLowerCase() && x !== old);
  if (dup) return alert('That exercise already exists.');
  const c = old != null && S.exercises.find(e => e.name === old);
  if (c) { c.name = n; c.muscle = $('#xm').value; renameEverywhere(old, n); }
  else S.exercises.push({ id: uid(), name: n, muscle: $('#xm').value });
  save(); go('exercises', { name: n });
};
function renameEverywhere(a, b) {
  const fix = e => { if (e.name === a) e.name = b; };
  S.workouts.forEach(w => w.exercises.forEach(fix)); S.templates.forEach(t => t.exercises.forEach(fix)); S.active?.exercises.forEach(fix);
  draft?.exercises.forEach(fix);
}
window.deleteExercise = name => { if (confirm(`Delete the custom exercise "${name}"? Past workouts and templates keep it.`)) { S.exercises = S.exercises.filter(e => e.name !== name); save(); go('exercises'); } };

/* ---------- history ---------- */
function viewHistory() {
  const byMonth = {};
  S.workouts.slice().sort((a, b) => b.start - a.start).forEach(w => (byMonth[new Date(w.start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })] ??= []).push(w));
  const weekAgo = Date.now() - 7 * 864e5;
  const wk = S.workouts.filter(w => w.start > weekAgo);
  return `<div class="card"><div class="stat"><div><span class="muted">Total workouts</span><b>${S.workouts.length}</b></div><div><span class="muted">Last 7 days</span><b>${wk.length}</b></div></div></div>` +
    (Object.entries(byMonth).map(([m, ws]) => `<h2 style="margin:12px 0 8px">${esc(m)}</h2>` + ws.map(w => `<div class="card"><div class="row"><b class="grow">${esc(w.name)}</b><span class="muted">${dt(w.start)}</span></div>
      <div class="muted">${dur(w.end - w.start)} · ${fmt(volume(w))} ${unit()}</div>
      ${w.notes ? `<div class="muted">${esc(w.notes)}</div>` : ''}
      <div style="margin-top:6px">${w.exercises.map(e => `<div>${esc(e.name)} <span class="muted">${e.sets.filter(s => s.done).map(s => `${s.type === 'W' ? 'W ' : ''}${fmt(s.w)}×${s.r}`).join(', ')}</span>${e.note ? `<div class="muted">${esc(e.note)}</div>` : ''}</div>`).join('')}</div>
      <div class="row"><button class="link" onclick="saveAsTemplate(${js(w.id)})">Save as template</button><button class="link" onclick="repeatWorkout(${js(w.id)})">Repeat</button><button class="link" style="color:var(--danger)" onclick="delWorkout(${js(w.id)})">Delete</button></div></div>`).join('')).join('') || '<p class="muted">No workouts yet.</p>');
}
window.delWorkout = id => { if (confirm('Delete this workout?')) { S.workouts = S.workouts.filter(w => w.id !== id); save(); render(); } };
const repsRange = sets => { const r = sets.map(s => s.r).filter(Boolean); if (!r.length) return '10'; const a = Math.min(...r), b = Math.max(...r); return a === b ? String(a) : `${a}-${b}`; };
window.saveAsTemplate = id => {
  const w = S.workouts.find(x => x.id === id); if (!w) return;
  S.templates.push({ id: uid(), name: w.name, notes: '', exercises: w.exercises.map(e => ({ name: e.name, sets: doneSets(e).length || 1, reps: repsRange(doneSets(e)), note: e.note || '' })) });
  save(); alert('Saved to Templates.');
};
window.repeatWorkout = id => { const w = S.workouts.find(x => x.id === id); if (!w) return; startWorkout(w.name, w.exercises.map(e => ({ name: e.name, note: e.note || '', sets: e.sets.map(s => ({ type: s.type, w: s.w, r: 0, done: false })) }))); };

/* ---------- settings / measurements / data ---------- */
function viewSettings() {
  const m = S.measurements.slice().sort((a, b) => a.date - b.date);
  return `<div class="card"><h2>Preferences</h2><p class="muted">Units</p>
    <select onchange="setUnit(this.value)"><option value="kg" ${unit() === 'kg' ? 'selected' : ''}>kg</option><option value="lb" ${unit() === 'lb' ? 'selected' : ''}>lb</option></select>
    <p class="muted">Rest timer (seconds, 0 = off)</p><input type="number" inputmode="numeric" min="0" value="${S.settings.rest}" oninput="S.settings.rest=Math.max(0,Math.round(+this.value||0));save()"></div>
    <div class="card"><h2>Body weight</h2>${chart(m.filter(x => x.weight).map(x => ({ x: x.date, y: x.weight })), unit())}
      <div class="row" style="margin-top:8px"><input id="bw" type="number" inputmode="decimal" min="0" step="any" placeholder="Weight (${unit()})"><input id="bf" type="number" inputmode="decimal" min="0" step="any" placeholder="Body fat %"><button class="btn" onclick="addMeasure()">Add</button></div>
      ${m.slice().reverse().slice(0, 8).map(x => `<div class="row muted" style="margin-top:6px"><span class="grow">${dt(x.date)}</span><span>${x.weight ? fmt(x.weight) + ' ' + unit() : ''} ${x.bf ? fmt(x.bf) + '%' : ''}</span><button class="link" aria-label="Delete entry" onclick="delMeasure(${js(x.date)})">✕</button></div>`).join('')}</div>
    <div class="card"><h2>Plate calculator</h2><div class="row"><input id="pt" type="number" inputmode="decimal" min="0" step="any" placeholder="Target (${unit()})" oninput="plates()"><input id="pb" type="number" inputmode="decimal" min="0" step="any" placeholder="Bar" value="${unit() === 'kg' ? 20 : 45}" oninput="plates()"></div><p id="pout" class="muted"></p></div>
    <div class="card"><h2>Data</h2><p class="muted">Everything is stored on this device. Back it up regularly.</p>
      <div class="row" style="flex-wrap:wrap"><button class="btn sec" onclick="exportJSON()">Export backup</button><button class="btn sec" onclick="$('#file').click()">Restore backup</button><button class="btn sec" onclick="exportCSV()">Export CSV</button></div>
      <input type="file" id="file" accept=".json,application/json" hidden onchange="importBackup(this.files[0]);this.value=''"></div>`;
}
const LB = 2.20462262;
window.setUnit = u => {
  const from = unit(); if (u === from || !['kg', 'lb'].includes(u)) return;
  const has = S.workouts.length || S.measurements.some(x => x.weight) || S.active?.exercises.some(e => e.sets.some(s => s.w));
  if (has && confirm(`Convert all saved weights from ${from} to ${u}? (e.g. 100 ${from} → ${fmt(u === 'lb' ? 100 * LB : 100 / LB)} ${u})\n\nOK = convert. Cancel = keep the numbers and only change the label.`)) {
    const f = u === 'lb' ? LB : 1 / LB, cv = v => Math.round(v * f * 100) / 100;
    [...S.workouts, ...(S.active ? [S.active] : [])].forEach(w => w.exercises.forEach(e => e.sets.forEach(s => s.w = cv(s.w))));
    S.measurements.forEach(x => x.weight = cv(x.weight));
  }
  S.settings.unit = u; save(); render();
};
window.addMeasure = () => { const w = Math.max(0, num($('#bw').value)), bf = Math.max(0, num($('#bf').value)); if (!w && !bf) return; S.measurements.push({ date: Date.now(), weight: w, bf }); save(); render(); };
window.delMeasure = d => { S.measurements = S.measurements.filter(x => x.date !== d); save(); render(); };
window.plates = () => {
  let side = (num($('#pt').value) - num($('#pb').value)) / 2; if (side <= 0) return $('#pout').textContent = '';
  const set = unit() === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5], out = [];
  set.forEach(p => { while (side >= p - 1e-9) { out.push(p); side -= p; } });
  $('#pout').textContent = 'Per side: ' + (out.join(' + ') || '—') + (side > 0.01 ? ` (${fmt(side)} left over)` : '');
};
const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); };
window.exportJSON = () => download(`liftlog-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(S, null, 2), 'application/json');
// Leading = + - @ are prefixed with ' so spreadsheets do not treat names as formulas.
const csvCell = v => { let s = String(v); if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
window.exportCSV = () => download('liftlog-workouts.csv', [`Date,Workout,Exercise,Set,Weight (${unit()}),Reps,Type`].concat(S.workouts.flatMap(w => w.exercises.flatMap(e => e.sets.map((s, i) => [new Date(w.start).toISOString(), w.name, e.name, i + 1, s.w, s.r, s.type].map(csvCell).join(','))))).join('\n'), 'text/csv');
window.importBackup = f => {
  if (!f) return;
  f.text().then(t => {
    let d; try { d = JSON.parse(t); if (!d || !Array.isArray(d.workouts)) throw 0; } catch { return alert('Not a valid backup file.'); }
    if (!confirm('Replace all current data with this backup?')) return;
    S = normState(d); draft = null; save(); stopRest(); go('settings'); alert(`Restored ${S.workouts.length} workouts and ${S.templates.length} templates.`);
  });
};

/* ---------- shell ---------- */
const TITLES = { workout: 'Workout', templates: 'Templates', exercises: 'Exercises', history: 'History', settings: 'Settings' };
const VIEWS = { workout: viewWorkout, templates: viewTemplates, exercises: viewExercises, history: viewHistory, settings: viewSettings };
function render() {
  if (!VIEWS[route.tab]) route = { tab: 'workout' };
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === route.tab));
  $('#title').textContent = TITLES[route.tab];
  $('#view').innerHTML = `<datalist id="exlist">${allExercises().map(n => `<option value="${esc(n)}">`).join('')}</datalist>` + VIEWS[route.tab]();
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => go(b.dataset.tab));
try { history.replaceState({ r: route }, ''); } catch {}
render(); drawRest();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').then(reg => {
  // An installed PWA can stay open for days: look for a new version whenever it comes back to the foreground.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
}).catch(() => {});
