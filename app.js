'use strict';
const KEY = 'liftlog.v1';
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc = encodeURIComponent, dec = decodeURIComponent;

const DEFAULTS = () => ({ exercises: [], templates: [], workouts: [], measurements: [], active: null, settings: { unit: 'kg', rest: 90 } });
let S = (() => { try { return Object.assign(DEFAULTS(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return DEFAULTS(); } })();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

const BASE_EXERCISES = ['Bench Press (Barbell)','Incline Bench Press (Barbell)','Bench Press (Dumbbell)','Incline Bench Press (Dumbbell)','Chest Fly (Dumbbell)','Push Up','Overhead Press (Barbell)','Overhead Press (Dumbbell)','Lateral Raise (Dumbbell)','Triceps Pushdown (Cable)','Skullcrusher (Barbell)','Dip','Deadlift (Barbell)','Romanian Deadlift (Barbell)','Bent Over Row (Barbell)','Seated Row (Cable)','Lat Pulldown (Cable)','Pull Up','Chin Up','Face Pull (Cable)','Bicep Curl (Dumbbell)','Hammer Curl (Dumbbell)','Bicep Curl (Barbell)','Squat (Barbell)','Front Squat (Barbell)','Leg Press','Leg Extension (Machine)','Leg Curl (Machine)','Lunge (Dumbbell)','Bulgarian Split Squat','Hip Thrust (Barbell)','Calf Raise (Machine)','Plank','Crunch','Hanging Leg Raise','Cable Crossover'];
const MUSCLES = ['Chest','Back','Shoulders','Biceps','Triceps','Legs','Glutes','Core','Cardio','Other'];
const allExercises = () => [...new Set([...BASE_EXERCISES, ...S.exercises.map(e => e.name), ...S.workouts.flatMap(w => w.exercises.map(e => e.name)), ...S.templates.flatMap(t => t.exercises.map(e => e.name))])].sort();

const unit = () => S.settings.unit;
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const fmt = n => (Math.round(n * 10) / 10).toString();
const e1rm = (w, r) => !w || !r ? 0 : r === 1 ? w : w * (1 + r / 30);
const dt = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const dur = ms => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const doneSets = e => e.sets.filter(s => s.done && s.type !== 'W');
const volume = w => w.exercises.reduce((a, e) => a + doneSets(e).reduce((b, s) => b + s.w * s.r, 0), 0);

let route = { tab: 'workout' };
const go = (tab, extra = {}) => { route = { tab, ...extra }; render(); window.scrollTo(0, 0); };

/* ---------- history helpers ---------- */
function lastSets(name) {
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const e = S.workouts[i].exercises.find(x => x.name === name);
    if (e && doneSets(e).length) return doneSets(e);
  }
  return [];
}
function exerciseHistory(name) {
  return S.workouts.map(w => {
    const e = w.exercises.find(x => x.name === name);
    return e && doneSets(e).length ? { date: w.start, sets: doneSets(e), note: e.note } : null;
  }).filter(Boolean);
}
function records(name) {
  const h = exerciseHistory(name);
  let maxW = 0, best1 = 0, bestSet = 0, bestSession = 0;
  h.forEach(x => {
    let vol = 0;
    x.sets.forEach(s => { maxW = Math.max(maxW, s.w); best1 = Math.max(best1, e1rm(s.w, s.r)); bestSet = Math.max(bestSet, s.w * s.r); vol += s.w * s.r; });
    bestSession = Math.max(bestSession, vol);
  });
  return { maxW, best1, bestSet, bestSession, sessions: h.length };
}

/* ---------- templates ---------- */
function normTemplate(t) {
  if (!t || !t.name || !Array.isArray(t.exercises)) throw new Error('Each template needs a "name" and an "exercises" array.');
  return { id: uid(), name: String(t.name), notes: t.notes || '', exercises: t.exercises.map(e => {
    if (!e.name) throw new Error('Every exercise needs a "name".');
    const sets = Array.isArray(e.sets) ? e.sets.length : Math.max(1, parseInt(e.sets) || 3);
    return { name: String(e.name), sets, reps: String(e.reps ?? (Array.isArray(e.sets) ? e.sets.map(s => s.reps).join('/') : '10')), note: e.note || '' };
  }) };
}
function importTemplates(text) {
  const data = JSON.parse(text.replace(/^```(?:json)?|```$/gim, '').trim());
  const list = Array.isArray(data) ? data : data.templates ? data.templates : [data];
  const out = list.map(normTemplate);
  S.templates.push(...out); save();
  return out.length;
}
const CLAUDE_PROMPT = `Create workout templates for my workout tracking app. Ask me about my goals, split, equipment and days per week if you need to. When ready, reply with ONLY a JSON code block in exactly this format (one object per workout, "reps" can be a number or a range like "8-10"):

{"templates":[{"name":"Push Day","notes":"optional","exercises":[{"name":"Bench Press (Barbell)","sets":4,"reps":"6-8","note":"optional"}]}]}`;

let draft = null;
function viewTemplates() {
  if (route.sub === 'edit') return viewTemplateEdit();
  if (route.sub === 'import') return `
    <div class="card"><h2>Import from Claude</h2>
      <p class="muted">1. Copy this prompt and paste it into a chat with Claude.<br>2. Describe the workout you want.<br>3. Paste Claude's JSON reply below.</p>
      <pre>${esc(CLAUDE_PROMPT)}</pre>
      <button class="btn sec" onclick="copyPrompt()">Copy prompt</button></div>
    <div class="card"><textarea id="imp" placeholder='Paste JSON here'></textarea><p id="imperr" class="error"></p>
      <div class="row"><button class="btn grow" onclick="doImport()">Import</button><button class="btn sec" onclick="go('templates')">Cancel</button></div></div>`;
  return `<div class="row" style="margin-bottom:12px"><button class="btn grow" onclick="editTemplate()">+ New template</button><button class="btn sec" onclick="go('templates',{sub:'import'})">Import from Claude</button></div>` +
    (S.templates.map(t => `<div class="card"><div class="row"><h2 class="grow">${esc(t.name)}</h2>
      <button class="btn" onclick="startFromTemplate('${t.id}')">Start</button></div>
      <p class="muted">${t.exercises.map(e => `${esc(e.name)} ${e.sets}×${esc(e.reps)}`).join('<br>')}</p>
      <div class="row"><button class="link" onclick="editTemplate('${t.id}')">Edit</button><button class="link" onclick="dupTemplate('${t.id}')">Duplicate</button><button class="link" style="color:var(--danger)" onclick="delTemplate('${t.id}')">Delete</button></div></div>`).join('') ||
      '<p class="muted">No templates yet. Create one, or import one from a Claude chat. There is no limit.</p>');
}
function viewTemplateEdit() {
  return `<div class="card"><input id="tn" placeholder="Template name" value="${esc(draft.name)}" onchange="draft.name=this.value">
    ${draft.exercises.map((e, i) => `<div class="tpl-ex"><input list="exlist" value="${esc(e.name)}" placeholder="Exercise" onchange="draft.exercises[${i}].name=this.value">
      <input type="number" inputmode="numeric" value="${e.sets}" onchange="draft.exercises[${i}].sets=Math.max(1,+this.value||1)">
      <input value="${esc(e.reps)}" onchange="draft.exercises[${i}].reps=this.value">
      <button class="link" onclick="draft.exercises.splice(${i},1);render()">✕</button></div>`).join('')}
    <p class="hdr">Exercise · Sets · Reps</p>
    <button class="btn sec" onclick="draft.exercises.push({name:'',sets:3,reps:'10',note:''});render()">+ Exercise</button></div>
    <div class="row"><button class="btn grow ok" onclick="saveTemplate()">Save</button><button class="btn sec" onclick="go('templates')">Cancel</button></div>`;
}
window.editTemplate = id => { const t = S.templates.find(x => x.id === id); draft = t ? JSON.parse(JSON.stringify(t)) : { id: uid(), name: '', notes: '', exercises: [{ name: '', sets: 3, reps: '10', note: '' }] }; go('templates', { sub: 'edit' }); };
window.saveTemplate = () => {
  draft.exercises = draft.exercises.filter(e => e.name.trim());
  if (!draft.name.trim() || !draft.exercises.length) return alert('Add a name and at least one exercise.');
  const i = S.templates.findIndex(t => t.id === draft.id);
  i >= 0 ? S.templates[i] = draft : S.templates.push(draft); save(); go('templates');
};
window.delTemplate = id => { if (confirm('Delete this template?')) { S.templates = S.templates.filter(t => t.id !== id); save(); render(); } };
window.dupTemplate = id => { const t = JSON.parse(JSON.stringify(S.templates.find(x => x.id === id))); t.id = uid(); t.name += ' (copy)'; S.templates.push(t); save(); render(); };
window.copyPrompt = () => navigator.clipboard.writeText(CLAUDE_PROMPT).then(() => alert('Copied. Paste it into Claude.'), () => alert('Copy failed. Select the text manually.'));
window.doImport = () => { try { const n = importTemplates($('#imp').value); alert(`Imported ${n} template(s).`); go('templates'); } catch (e) { $('#imperr').textContent = 'Could not import: ' + e.message; } };

/* ---------- workout ---------- */
window.startFromTemplate = id => {
  const t = S.templates.find(x => x.id === id);
  startWorkout(t.name, t.exercises.map(e => {
    const prev = lastSets(e.name);
    return { name: e.name, note: e.note || '', sets: Array.from({ length: e.sets }, (_, i) => ({ type: 'N', w: prev[i]?.w || prev[prev.length - 1]?.w || 0, r: 0, done: false })), target: e.reps };
  }));
};
function startWorkout(name, exercises) {
  if (S.active && !confirm('Replace the workout in progress?')) return;
  S.active = { name: name || 'Workout', start: Date.now(), exercises, notes: '' }; save(); go('workout');
}
window.startEmpty = () => startWorkout('Quick Workout', []);
window.cancelWorkout = () => { if (confirm('Discard this workout?')) { S.active = null; save(); stopRest(); render(); } };
window.finishWorkout = () => {
  const a = S.active;
  a.exercises.forEach(e => e.sets = e.sets.filter(s => s.done));
  a.exercises = a.exercises.filter(e => e.sets.length);
  if (!a.exercises.length) return alert('Complete at least one set first.');
  const before = {}; a.exercises.forEach(e => before[e.name] = records(e.name));
  a.end = Date.now(); a.id = uid(); S.workouts.push(a); S.active = null; save(); stopRest();
  const prs = a.exercises.filter(e => { const r = records(e.name), b = before[e.name]; return b.sessions && (r.maxW > b.maxW || r.best1 > b.best1); }).map(e => e.name);
  alert(`Workout saved! ${dur(a.end - a.start)} · ${fmt(volume(a))} ${unit()} volume` + (prs.length ? `\n\n🏆 New PRs: ${prs.join(', ')}` : ''));
  go('history');
};
function viewWorkout() {
  const a = S.active;
  if (!a) return `<div class="card"><h2>Start a workout</h2><p class="muted">Pick a template or start empty.</p><button class="btn" onclick="startEmpty()">Start empty workout</button></div>` +
    S.templates.map(t => `<div class="card row"><div class="grow"><h2>${esc(t.name)}</h2><span class="muted">${t.exercises.length} exercises</span></div><button class="btn" onclick="startFromTemplate('${t.id}')">Start</button></div>`).join('') +
    (S.templates.length ? '' : '<p class="muted">No templates yet. Add them in the Templates tab.</p>');
  return `<div class="card"><input value="${esc(a.name)}" onchange="S.active.name=this.value;save()"><p class="muted">⏱ <span id="elapsed">${clock(Date.now() - a.start)}</span></p>
    <textarea placeholder="Workout notes" style="min-height:50px" onchange="S.active.notes=this.value;save()">${esc(a.notes)}</textarea></div>` +
    a.exercises.map((e, ei) => {
      const prev = lastSets(e.name), pr = records(e.name);
      return `<div class="card"><div class="row"><h2 class="grow"><a href="#" style="color:var(--accent);text-decoration:none" onclick="event.preventDefault();go('exercises',{name:'${enc(e.name)}'})">${esc(e.name)}</a></h2>
        <button class="link" onclick="S.active.exercises.splice(${ei},1);save();render()">✕</button></div>
        ${e.target ? `<span class="muted">Target: ${esc(e.target)} reps</span>` : ''}
        <input placeholder="Notes" style="margin:6px 0" value="${esc(e.note)}" onchange="S.active.exercises[${ei}].note=this.value;save()">
        <div class="set hdr"><span>SET</span><span>${unit().toUpperCase()}</span><span>REPS</span><span></span></div>
        ${e.sets.map((s, si) => {
          const p = prev[si]; const n = e.sets.slice(0, si + 1).filter(x => x.type !== 'W').length;
          return `<div class="set ${s.done ? 'done' : ''}"><button class="link" onclick="cycleType(${ei},${si})">${s.type === 'W' ? 'W' : n}</button>
          <input type="number" inputmode="decimal" placeholder="${p ? fmt(p.w) : ''}" value="${s.w || ''}" onchange="setVal(${ei},${si},'w',this.value)">
          <input type="number" inputmode="numeric" placeholder="${p ? p.r : ''}" value="${s.r || ''}" onchange="setVal(${ei},${si},'r',this.value)">
          <button class="chk" onclick="toggleSet(${ei},${si})">✓</button></div>`; }).join('')}
        <div class="row" style="margin-top:8px"><button class="btn sec grow" onclick="addSet(${ei})">+ Add set</button></div>
        ${pr.sessions ? `<p class="muted">Best: ${fmt(pr.maxW)} ${unit()} · est. 1RM ${fmt(pr.best1)}</p>` : ''}</div>`;
    }).join('') +
    `<div class="card"><input list="exlist" id="addex" placeholder="Add exercise…"><button class="btn sec" style="margin-top:8px" onclick="addExercise()">+ Add exercise</button></div>
    <div class="row"><button class="btn ok grow" onclick="finishWorkout()">Finish</button><button class="btn danger" onclick="cancelWorkout()">Cancel</button></div>`;
}
window.cycleType = (ei, si) => { const s = S.active.exercises[ei].sets[si]; s.type = s.type === 'W' ? 'N' : 'W'; save(); render(); };
window.setVal = (ei, si, k, v) => { S.active.exercises[ei].sets[si][k] = num(v); save(); };
window.addSet = ei => { const e = S.active.exercises[ei], l = e.sets[e.sets.length - 1]; e.sets.push({ type: 'N', w: l?.w || 0, r: 0, done: false }); save(); render(); };
window.addExercise = () => { const n = $('#addex').value.trim(); if (!n) return; if (!allExercises().includes(n)) S.exercises.push({ id: uid(), name: n, muscle: 'Other' }); S.active.exercises.push({ name: n, note: '', sets: [{ type: 'N', w: lastSets(n)[0]?.w || 0, r: 0, done: false }] }); save(); render(); };
window.toggleSet = (ei, si) => {
  const s = S.active.exercises[ei].sets[si];
  if (!s.done && !s.r) { const p = lastSets(S.active.exercises[ei].name)[si]; s.r = p?.r || 0; }
  s.done = !s.done; save(); render();
  s.done ? startRest(S.settings.rest) : stopRest();
};

/* rest timer + elapsed clock */
let restEnd = 0;
function startRest(sec) { restEnd = Date.now() + sec * 1000; drawRest(); }
function stopRest() { restEnd = 0; drawRest(); }
function drawRest() {
  let bar = $('#rest');
  if (!restEnd || restEnd < Date.now()) { bar && bar.remove(); restEnd = 0; return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'rest'; bar.className = 'restbar'; document.body.append(bar); }
  bar.innerHTML = `<span>Rest <b>${clock(restEnd - Date.now())}</b></span><span><button onclick="restEnd+=15000;drawRest()">+15s</button> <button onclick="stopRest()">Skip</button></span>`;
}
window.stopRest = stopRest; window.drawRest = drawRest;
setInterval(() => {
  if (restEnd) { if (Date.now() >= restEnd) { navigator.vibrate?.([200, 100, 200]); stopRest(); } else drawRest(); }
  const el = $('#elapsed'); if (el && S.active) el.textContent = clock(Date.now() - S.active.start);
}, 1000);

/* ---------- charts ---------- */
function chart(points, label) {
  if (points.length < 2) return `<p class="muted">Log at least 2 sessions to see a chart.</p>`;
  const W = 320, H = 160, p = 24, xs = points.map(x => x.x), ys = points.map(x => x.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = v => p + (x1 === x0 ? 0.5 : (v - x0) / (x1 - x0)) * (W - 2 * p), Y = v => H - p - (y1 === y0 ? 0.5 : (v - y0) / (y1 - y0)) * (H - 2 * p);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><polyline fill="none" stroke="#4f8cff" stroke-width="2" points="${points.map(q => `${X(q.x)},${Y(q.y)}`).join(' ')}"/>
    ${points.map(q => `<circle cx="${X(q.x)}" cy="${Y(q.y)}" r="3" fill="#4f8cff"/>`).join('')}
    <text x="4" y="14" fill="#8a94a3" font-size="11">${fmt(y1)}</text><text x="4" y="${H - 6}" fill="#8a94a3" font-size="11">${fmt(y0)}</text>
    <text x="${W - 4}" y="14" fill="#8a94a3" font-size="11" text-anchor="end">${label}</text></svg>`;
}

/* ---------- exercises (history, records, charts) ---------- */
let metric = 'e1rm';
function viewExercises() {
  if (route.name) {
    const name = dec(route.name), h = exerciseHistory(name), r = records(name);
    const val = { e1rm: x => Math.max(...x.sets.map(s => e1rm(s.w, s.r))), weight: x => Math.max(...x.sets.map(s => s.w)), volume: x => x.sets.reduce((a, s) => a + s.w * s.r, 0), reps: x => Math.max(...x.sets.map(s => s.r)) }[metric];
    return `<button class="link" onclick="go('exercises')">← All exercises</button><h2 style="margin:8px 0">${esc(name)}</h2>${S.exercises.some(e => e.name === name) ? `<div class="row"><button class="link" onclick="go('exercises',{sub:'new',edit:'${name.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'})">Edit</button><button class="link" style="color:var(--danger)" onclick="deleteExercise(decodeURIComponent('${enc(name)}'))">Delete</button></div>` : ''}
      <div class="card"><div class="stat"><div><span class="muted">Heaviest</span><b>${fmt(r.maxW)} ${unit()}</b></div><div><span class="muted">Est. 1RM</span><b>${fmt(r.best1)} ${unit()}</b></div>
      <div><span class="muted">Best set</span><b>${fmt(r.bestSet)}</b></div><div><span class="muted">Best session vol.</span><b>${fmt(r.bestSession)}</b></div></div></div>
      <div class="card"><select onchange="metric=this.value;render()">${[['e1rm','Estimated 1RM'],['weight','Heaviest weight'],['volume','Session volume'],['reps','Max reps']].map(([k, l]) => `<option value="${k}" ${metric === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div style="margin-top:8px">${chart(h.map(x => ({ x: x.date, y: val(x) })), unit())}</div></div>
      <h2 style="margin:8px 0">History</h2>` +
      (h.slice().reverse().map(x => `<div class="card"><b>${dt(x.date)}</b>${x.note ? `<div class="muted">${esc(x.note)}</div>` : ''}<br>${x.sets.map(s => `${fmt(s.w)} ${unit()} × ${s.r}${s.w === r.maxW ? ' <span class="pr">PR</span>' : ''}`).join('<br>')}</div>`).join('') || '<p class="muted">No history yet.</p>');
  }
  if (route.sub === 'new') return `<button class="link" onclick="go('exercises')">← Back</button><div class="card"><h2>${route.edit ? 'Edit' : 'New'} exercise</h2>
    <input id="xn" placeholder="Exercise name" value="${esc(route.edit || '')}" style="margin:8px 0">
    <select id="xm">${MUSCLES.map(m => `<option ${S.exercises.find(e => e.name === route.edit)?.muscle === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
    <div class="row" style="margin-top:10px"><button class="btn ok grow" onclick="saveExercise()">Save</button><button class="btn sec" onclick="go('exercises')">Cancel</button></div></div>`;
  return `<div class="row" style="margin-bottom:10px"><input id="exq" placeholder="Search" oninput="filterEx(this.value)"><button class="btn" onclick="go('exercises',{sub:'new'})">+ New</button></div><div id="exl">${exList('')}</div>`;
}
const exList = q => allExercises().filter(n => n.toLowerCase().includes(q.toLowerCase())).map(n => { const r = records(n), c = S.exercises.find(e => e.name === n);
  return `<div class="card row" onclick="go('exercises',{name:'${enc(n)}'})"><div class="grow"><b>${esc(n)}</b><div class="muted">${c ? esc(c.muscle) + ' · custom · ' : ''}${r.sessions} sessions</div></div><div class="muted">${r.maxW ? fmt(r.maxW) + ' ' + unit() : ''}</div></div>`; }).join('') || '<p class="muted">No exercises found.</p>';
window.filterEx = q => { $('#exl').innerHTML = exList(q); };
window.saveExercise = () => {
  const n = $('#xn').value.trim(); if (!n) return alert('Enter a name.');
  const old = route.edit, dup = allExercises().some(x => x.toLowerCase() === n.toLowerCase() && x !== old);
  if (dup) return alert('That exercise already exists.');
  if (old) { const c = S.exercises.find(e => e.name === old); c.name = n; c.muscle = $('#xm').value; renameEverywhere(old, n); }
  else S.exercises.push({ id: uid(), name: n, muscle: $('#xm').value });
  save(); go('exercises');
};
function renameEverywhere(a, b) {
  const fix = e => { if (e.name === a) e.name = b; };
  S.workouts.forEach(w => w.exercises.forEach(fix)); S.templates.forEach(t => t.exercises.forEach(fix)); S.active?.exercises.forEach(fix);
}
window.deleteExercise = name => { if (confirm('Delete this custom exercise? Past history is kept.')) { S.exercises = S.exercises.filter(e => e.name !== name); save(); go('exercises'); } };

/* ---------- history ---------- */
function viewHistory() {
  const byMonth = {};
  S.workouts.slice().reverse().forEach(w => (byMonth[new Date(w.start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })] ??= []).push(w));
  const weekAgo = Date.now() - 7 * 864e5;
  const wk = S.workouts.filter(w => w.start > weekAgo);
  return `<div class="card"><div class="stat"><div><span class="muted">Total workouts</span><b>${S.workouts.length}</b></div><div><span class="muted">Last 7 days</span><b>${wk.length}</b></div></div></div>` +
    (Object.entries(byMonth).map(([m, ws]) => `<h2 style="margin:12px 0 8px">${m}</h2>` + ws.map(w => `<div class="card"><div class="row"><b class="grow">${esc(w.name)}</b><span class="muted">${dt(w.start)}</span></div>
      <div class="muted">${dur(w.end - w.start)} · ${fmt(volume(w))} ${unit()}</div>
      ${w.notes ? `<div class="muted">${esc(w.notes)}</div>` : ''}
      <div style="margin-top:6px">${w.exercises.map(e => `<div>${esc(e.name)} <span class="muted">${doneSets(e).map(s => `${fmt(s.w)}×${s.r}`).join(', ')}</span></div>`).join('')}</div>
      <div class="row"><button class="link" onclick="saveAsTemplate('${w.id}')">Save as template</button><button class="link" onclick="repeatWorkout('${w.id}')">Repeat</button><button class="link" style="color:var(--danger)" onclick="delWorkout('${w.id}')">Delete</button></div></div>`).join('')).join('') || '<p class="muted">No workouts yet.</p>');
}
window.delWorkout = id => { if (confirm('Delete this workout?')) { S.workouts = S.workouts.filter(w => w.id !== id); save(); render(); } };
window.saveAsTemplate = id => { const w = S.workouts.find(x => x.id === id); S.templates.push({ id: uid(), name: w.name, notes: '', exercises: w.exercises.map(e => ({ name: e.name, sets: doneSets(e).length || 1, reps: '10', note: '' })) }); save(); alert('Saved to Templates.'); };
window.repeatWorkout = id => { const w = S.workouts.find(x => x.id === id); startWorkout(w.name, w.exercises.map(e => ({ name: e.name, note: '', sets: e.sets.map(s => ({ type: s.type, w: s.w, r: 0, done: false })) }))); };

/* ---------- settings / measurements / data ---------- */
function viewSettings() {
  const m = S.measurements.slice().sort((a, b) => a.date - b.date);
  return `<div class="card"><h2>Preferences</h2><p class="muted">Units</p>
    <select onchange="S.settings.unit=this.value;save();render()"><option value="kg" ${unit() === 'kg' ? 'selected' : ''}>kg</option><option value="lb" ${unit() === 'lb' ? 'selected' : ''}>lb</option></select>
    <p class="muted">Rest timer (seconds)</p><input type="number" inputmode="numeric" value="${S.settings.rest}" onchange="S.settings.rest=Math.max(0,+this.value||0);save()"></div>
    <div class="card"><h2>Body weight</h2>${chart(m.filter(x => x.weight).map(x => ({ x: x.date, y: x.weight })), unit())}
      <div class="row" style="margin-top:8px"><input id="bw" type="number" inputmode="decimal" placeholder="Weight (${unit()})"><input id="bf" type="number" inputmode="decimal" placeholder="Body fat %"><button class="btn" onclick="addMeasure()">Add</button></div>
      ${m.slice().reverse().slice(0, 8).map(x => `<div class="row muted" style="margin-top:6px"><span class="grow">${dt(x.date)}</span><span>${x.weight ? fmt(x.weight) + ' ' + unit() : ''} ${x.bf ? x.bf + '%' : ''}</span><button class="link" onclick="delMeasure(${x.date})">✕</button></div>`).join('')}</div>
    <div class="card"><h2>Plate calculator</h2><div class="row"><input id="pt" type="number" inputmode="decimal" placeholder="Target (${unit()})" oninput="plates()"><input id="pb" type="number" inputmode="decimal" placeholder="Bar" value="${unit() === 'kg' ? 20 : 45}" oninput="plates()"></div><p id="pout" class="muted"></p></div>
    <div class="card"><h2>Data</h2><p class="muted">Everything is stored on this device. Back it up regularly.</p>
      <div class="row" style="flex-wrap:wrap"><button class="btn sec" onclick="exportJSON()">Export backup</button><button class="btn sec" onclick="$('#file').click()">Restore backup</button><button class="btn sec" onclick="exportCSV()">Export CSV</button></div>
      <input type="file" id="file" accept=".json" hidden onchange="importBackup(this.files[0])"></div>`;
}
window.addMeasure = () => { const w = num($('#bw').value), bf = num($('#bf').value); if (!w && !bf) return; S.measurements.push({ date: Date.now(), weight: w, bf }); save(); render(); };
window.delMeasure = d => { S.measurements = S.measurements.filter(x => x.date !== d); save(); render(); };
window.plates = () => {
  let side = (num($('#pt').value) - num($('#pb').value)) / 2; if (side <= 0) return $('#pout').textContent = '';
  const set = unit() === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5], out = [];
  set.forEach(p => { while (side >= p - 1e-9) { out.push(p); side -= p; } });
  $('#pout').textContent = 'Per side: ' + (out.join(' + ') || '—') + (side > 0.01 ? ` (${fmt(side)} left over)` : '');
};
const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
window.exportJSON = () => download(`liftlog-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(S, null, 2), 'application/json');
window.exportCSV = () => download('liftlog-workouts.csv', ['Date,Workout,Exercise,Set,Weight,Reps,Type'].concat(S.workouts.flatMap(w => w.exercises.flatMap(e => e.sets.map((s, i) => [new Date(w.start).toISOString(), w.name, e.name, i + 1, s.w, s.r, s.type].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))))).join('\n'), 'text/csv');
window.importBackup = f => { if (!f) return; f.text().then(t => { try { const d = JSON.parse(t); if (!Array.isArray(d.workouts)) throw 0; if (!confirm('Replace all current data with this backup?')) return; S = Object.assign(DEFAULTS(), d); save(); render(); } catch { alert('Not a valid backup file.'); } }); };

/* ---------- shell ---------- */
const TITLES = { workout: 'Workout', templates: 'Templates', exercises: 'Exercises', history: 'History', settings: 'Settings' };
function render() {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === route.tab));
  $('#title').textContent = TITLES[route.tab];
  $('#view').innerHTML = `<datalist id="exlist">${allExercises().map(n => `<option value="${esc(n)}">`).join('')}</datalist>` +
    ({ workout: viewWorkout, templates: viewTemplates, exercises: viewExercises, history: viewHistory, settings: viewSettings }[route.tab])();
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => go(b.dataset.tab));
if (S.active) route = { tab: 'workout' };
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
