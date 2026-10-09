'use strict';
/* ================= DIET =================
   state.diet = { foods:[custom foods], recipes:[{id,name,items:[food entries]}], log:{date:[entries]}, presets:[custom goals], goal }
   food entry:   {id, kind:'food', f:{name,k,p,c,f,u,ug}, mode:'g'|'n', amt}   (values per 100 g; u/ug = unit name / grams per unit)
   recipe entry: {id, kind:'recipe', rid, servings}                              (the recipe definition is shared) */

const dietUI = { off: 0, add: null, edit: null, inline: null, drag: null, dropAt: null, renaming: null, wired: false };
const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MACROS = [['p', 'Protein', '#5f93d6'], ['c', 'Carbs', '#e07b78'], ['f', 'Fat', '#e0b84a']];
const GOAL_PRESETS = [
  { id: 'maint', name: 'Maintenance', k: 2000, p: 150, c: 200, f: 67, builtin: true },
  { id: 'bulk', name: 'Bulk', k: 3000, p: 190, c: 340, f: 98, builtin: true },
  { id: 'satiety', name: 'Satiety', k: 2000, p: 200, c: 150, f: 67, builtin: true },
  { id: 'keto', name: 'Keto', k: 2000, p: 125, c: 25, f: 155, builtin: true },
  { id: 'cut', name: 'Cut', k: 1600, p: 160, c: 130, f: 49, builtin: true },
];
let BUILTIN_FOODS = null;

/* ---------- math ---------- */
const dietDate = () => isoDate(new Date(Date.now() + dietUI.off * 864e5));
const dayLog = (date) => (state.diet.log[date] ||= []);
const recipeById = (id) => state.diet.recipes.find((r) => r.id === id);
const allGoals = () => [...GOAL_PRESETS, ...state.diet.presets];
const activeGoal = () => allGoals().find((g) => g.id === state.diet.goal) || GOAL_PRESETS[0];
const n1 = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
const sumM = (list) => list.reduce((a, m) => ({ k: a.k + m.k, p: a.p + m.p, c: a.c + m.c, f: a.f + m.f }), { k: 0, p: 0, c: 0, f: 0 });
function entryGrams(e) { return e.mode === 'n' ? e.amt * (e.f.ug || 100) : e.amt; }
function foodMacros(e) { const g = entryGrams(e) / 100; return { k: e.f.k * g, p: e.f.p * g, c: e.f.c * g, f: e.f.f * g }; }
function recipeMacros(r) { return sumM(r.items.map(foodMacros)); }
function entryMacros(e) {
  if (e.kind !== 'recipe') return foodMacros(e);
  const r = recipeById(e.rid), m = r ? recipeMacros(r) : { k: 0, p: 0, c: 0, f: 0 };
  return { k: m.k * e.servings, p: m.p * e.servings, c: m.c * e.servings, f: m.f * e.servings };
}
const dayTotals = (date) => sumM((state.diet.log[date] || []).map(entryMacros));
const macroLine = (m) => `${Math.round(m.k)} kcal · P ${n1(m.p)} · C ${n1(m.c)} · F ${n1(m.f)}`;

// reached = at/over the goal but not past the warning threshold; over = beyond goal + threshold
function goalState(val, goal) {
  const thr = 1 + state.settings.dietThreshold / 100;
  if (val > goal * thr + 1e-9) return 'over';
  return val >= goal ? 'ok' : '';
}
function dayStatus(date) {
  const t = dayTotals(date), g = activeGoal();
  const s = { k: goalState(t.k, g.k), p: goalState(t.p, g.p), c: goalState(t.c, g.c), f: goalState(t.f, g.f) };
  const logged = (state.diet.log[date] || []).length > 0;
  return { t, g, s, complete: logged && s.p === 'ok' && s.c === 'ok' && s.f === 'ok' && s.k !== 'over' };
}
const mark = (st) => (st === 'ok' ? '✅ ' : st === 'over' ? '⚠️ ' : '');

/* ---------- food lookup ---------- */
function builtinFoods() {
  return (BUILTIN_FOODS ||= FOODS.map(([name, k, p, c, f, u, ug]) => ({ name, k, p, c, f, u, ug })));
}
function matchFoods(q) {
  const toks = q.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!toks.length) return [];
  const score = (name) => {
    const n = name.toLowerCase();
    if (!toks.every((t) => n.includes(t))) return null;
    return toks.reduce((s, t) => s + (n.startsWith(t) ? 0 : n.includes(` ${t}`) ? 1 : 3), 0) + n.length / 100;
  };
  const foods = [...state.diet.foods, ...builtinFoods()].map((f) => [score(f.name), f]).filter((x) => x[0] != null);
  const recipes = state.diet.recipes.map((r) => [score(r.name), { recipe: r }]).filter((x) => x[0] != null);
  return [...recipes, ...foods.sort((a, b) => a[0] - b[0])].slice(0, 10).map((x) => x[1]);
}

/* ---------- quantity stepper:  - [value] +  ---------- */
function stepper({ get, set, label, toggle, step }) {
  const input = h('input', { class: 'q-in', type: 'text', inputmode: 'decimal', value: String(get()), 'aria-label': 'Quantity' });
  const apply = (v) => { v = Math.max(0, Math.round(v * 100) / 100); set(v); input.value = String(get()); };
  input.addEventListener('change', () => { const v = parseFloat(input.value.replace(',', '.')); if (Number.isFinite(v)) apply(v); else input.value = String(get()); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  const unit = toggle
    ? h('button', { class: 'q-unit tog', title: 'Switch between units and grams', onclick: toggle }, label())
    : h('span', { class: 'q-unit' }, label());
  return h('span', { class: 'stepper' },
    h('button', { class: 'q-btn', 'aria-label': 'Decrease', onclick: () => apply(get() - step()) }, '−'), input,
    h('button', { class: 'q-btn', 'aria-label': 'Increase', onclick: () => apply(get() + step()) }, '+'), unit);
}
function foodStepper(e, onChange) {
  return stepper({
    get: () => e.amt, set: (v) => { e.amt = v; onChange(); },
    step: () => (e.mode === 'n' ? 1 : 10),
    label: () => (e.mode === 'n' ? e.f.u : 'g'),
    toggle: e.f.u ? () => {
      const u = e.f.ug || 100;
      if (e.mode === 'n') { e.mode = 'g'; e.amt = Math.round(e.amt * u * 10) / 10; } else { e.mode = 'n'; e.amt = Math.round((e.amt / u) * 100) / 100; }
      onChange(true);
    } : null,
  });
}
const afterEdit = (rebuild) => { save(); renderDiet(); };

/* ---------- rendering ---------- */
function renderDiet() {
  const root = $('#diet'), date = dietDate(), D = state.diet;
  const ds = dayStatus(date), log = state.diet.log[date] || [];
  const d = new Date(`${date}T00:00:00`);
  const label = `${DOWS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;

  const top = h('div', { class: 'd-card d-top' },
    calorieBar(ds), h('div', { class: 'donuts' }, MACROS.map(([k, name, color]) => donut(k, name, color, ds))),
    goalRow(), dietUI.edit ? goalEditor() : null);

  const list = h('div', { class: 'd-list' },
    log.length ? log.map((e) => (e.kind === 'recipe' ? recipeCard(e) : foodRow(e, 'log'))) : h('div', { class: 'd-empty' }, 'Nothing logged for this day'),
    addArea());

  root.replaceChildren(h('div', { class: 'd-wrap' },
    h('div', { class: 'wk' },
      h('div', { class: 'wk-main' },
        h('button', { class: 'ib big', title: 'Previous day', html: ICON.left, onclick: () => { dietUI.off--; dietUI.add = null; renderDiet(); } }),
        h('span', { class: 'lbl' }, `${label}${ds.complete ? ' ✅' : ''}`),
        h('button', { class: 'ib big', title: 'Next day', html: ICON.right, onclick: () => { dietUI.off++; dietUI.add = null; renderDiet(); } })),
      h('button', { class: 'today-btn', style: { visibility: dietUI.off ? 'visible' : 'hidden' }, onclick: () => { dietUI.off = 0; dietUI.add = null; renderDiet(); } }, 'Today')),
    top, list,
    h('label', { class: 'd-key', title: 'Free key from fdc.nal.usda.gov, used for online food search' }, 'USDA API key',
      h('input', { type: 'text', placeholder: 'optional (uses a shared demo key)', spellcheck: 'false', value: state.settings.usdaKey || '',
        oninput: (e) => { state.settings.usdaKey = e.target.value.trim(); save(); } }))));
  wireDietDrag(root);
  const f = $('#diet .d-add input.d-q, #diet .rn-in, #diet .inl-in');
  if (f && (dietUI.add || dietUI.renaming || dietUI.inline)) { f.focus(); if (f.select) f.select(); }
}

// Click a goal number to change it right there. Editing a built-in preset first makes a custom copy of it.
function setGoalValue(key, val) {
  let g = activeGoal();
  if (g.builtin) {
    g = { id: uid(), name: `${g.name} (custom)`, k: g.k, p: g.p, c: g.c, f: g.f };
    state.diet.presets.push(g);
    state.diet.goal = g.id;
  }
  g[key] = Math.max(0, Math.round(val));
}
function inlineGoal(key, current) {
  const commit = (el) => {
    if (dietUI.inline !== key) return;
    dietUI.inline = null;
    const v = parseFloat(el.value);
    if (Number.isFinite(v) && v !== current) { setGoalValue(key, v); save(); }
    renderDiet();
  };
  return h('input', { class: 'inl-in', type: 'number', min: '0', step: '1', value: String(current), 'aria-label': 'Goal',
    onclick: (e) => e.stopPropagation(),
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { dietUI.inline = null; renderDiet(); } },
    onblur: (e) => commit(e.target) });
}
const goalText = (key, goal, extra = '') => h('span', { class: 'goal-num', title: 'Click to change this goal', onclick: (e) => { e.stopPropagation(); dietUI.inline = key; renderDiet(); } }, `${goal}${extra}`);

function calorieBar(ds) {
  const { t, g, s } = ds, pct = g.k ? Math.min(100, (t.k / g.k) * 100) : 0;
  return h('div', { class: `cal ${s.k}` },
    h('div', { class: 'cal-top' }, h('b', {}, 'Calories'),
      h('span', {}, `${Math.round(t.k)} / `, dietUI.inline === 'k' ? inlineGoal('k', g.k) : goalText('k', g.k), ' kcal')),
    h('div', { class: 'cal-row' },
      h('div', { class: 'cal-track', title: 'Click to change the calorie goal', onclick: () => { dietUI.inline = 'k'; renderDiet(); } }, h('div', { class: 'cal-fill', style: { width: `${pct}%` } })),
      h('span', { class: 'cal-mark' }, s.k === 'ok' ? '✅' : s.k === 'over' ? '⚠️' : '')));
}
function donut(key, name, color, ds) {
  const val = ds.t[key], goal = ds.g[key], st = ds.s[key], R = 40, C = 2 * Math.PI * R;
  const frac = goal ? Math.min(1, val / goal) : val > 0 ? 1 : 0;
  const ring = (cls, extra) => `<circle class="${cls}" cx="50" cy="50" r="${R}" fill="none" stroke-width="12" ${extra}/>`;
  return h('div', { class: `donut ${st}` },
    h('div', { class: 'dn-name' }, name),
    h('div', { class: 'dn-chart', title: 'Click to change this goal', onclick: () => { dietUI.inline = key; renderDiet(); },
      html: `<svg viewBox="0 0 100 100">${ring('trk', 'stroke="currentColor" stroke-opacity=".15"')}${ring('arc', `stroke="${color}" stroke-linecap="round" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"`)}</svg>` },
    st ? h('div', { class: 'dn-emoji' }, st === 'ok' ? '✅' : '⚠️') : null,
    h('div', { class: 'dn-val' }, h('span', { class: 'dn-line' }, `${Math.round(val)}/`, dietUI.inline === key ? inlineGoal(key, goal) : h('span', {}, goal)), h('small', {}, 'g'))));
}

/* ---------- goals ---------- */
function goalRow() {
  const g = activeGoal();
  return h('div', { class: 'goals' },
    allGoals().map((p) => h('button', { class: `gchip ${p.id === g.id ? 'sel' : ''}`, title: `${p.k} kcal · P ${p.p} · C ${p.c} · F ${p.f}`,
      onclick: () => { state.diet.goal = p.id; dietUI.edit = null; dietUI.inline = null; save(); renderDiet(); } }, p.name)),
    h('button', { class: 'gchip add', title: 'New or edited goal preset', 'aria-label': 'New goal preset',
      onclick: () => { dietUI.edit = dietUI.edit ? null : { ...g, name: g.name }; renderDiet(); } }, '+'));
}
function goalEditor() {
  const ed = dietUI.edit, cur = activeGoal();
  const hint = h('span', { class: 'g-hint' });
  const upd = () => { hint.textContent = `Macros add up to ${Math.round(ed.p * 4 + ed.c * 4 + ed.f * 9)} kcal`; };
  const num = (key, label) => h('label', { class: 'g-f' }, label, h('input', { type: 'number', min: '0', step: '1', value: String(ed[key]),
    oninput: (e) => { ed[key] = Math.max(0, parseFloat(e.target.value) || 0); upd(); } }));
  const commit = (id) => {
    const goal = { id, name: ed.name.trim() || 'Custom', k: ed.k, p: ed.p, c: ed.c, f: ed.f };
    const at = state.diet.presets.findIndex((x) => x.id === id);
    if (at >= 0) state.diet.presets[at] = goal; else state.diet.presets.push(goal);
    state.diet.goal = id; dietUI.edit = null; save(); renderDiet();
  };
  upd();
  return h('div', { class: 'g-edit' },
    h('label', { class: 'g-f wide' }, 'Name', h('input', { type: 'text', value: ed.name, maxlength: '30', oninput: (e) => { ed.name = e.target.value; } })),
    num('k', 'Calories'), num('p', 'Protein g'), num('c', 'Carbs g'), num('f', 'Fat g'), hint,
    h('div', { class: 'g-btns' },
      !cur.builtin ? h('button', { onclick: () => commit(cur.id) }, 'Save') : null,
      h('button', { class: 'pri', onclick: () => commit(uid()) }, 'Save as new'),
      !cur.builtin ? h('button', { class: 'danger', onclick: () => {
        state.diet.presets = state.diet.presets.filter((x) => x.id !== cur.id);
        state.diet.goal = 'maint'; dietUI.edit = null; save(); renderDiet();
      } }, 'Delete') : null,
      h('button', { onclick: () => { dietUI.edit = null; renderDiet(); } }, 'Cancel')));
}

/* ---------- list items ---------- */
function dragHandlers(row, handle, entry, from, kind) {
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) => {
    dietUI.drag = { id: entry.id, kind, from };
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', entry.id);
    e.dataTransfer.setDragImage(row, 20, 20);
    setTimeout(() => row.classList.add('dragging'), 0);
  });
  handle.addEventListener('dragend', () => { dietUI.drag = null; dietUI.dropAt = null; row.classList.remove('dragging'); clearDietMarks(); });
}
function foodRow(e, from) {
  const m = foodMacros(e);
  const main = h('div', { class: 'f-main' }, h('div', { class: 'f-name' }, e.f.name), h('div', { class: 'f-sub' }, macroLine(m)));
  const row = h('div', { class: `fitem ${from === 'log' ? '' : 'in'}`, 'data-id': e.id },
    main, foodStepper(e, () => afterEdit()),
    h('div', { class: 'acts' },
      h('button', { class: 'ib clone', title: 'Duplicate', html: ICON.copy, onclick: () => {
        const list = from === 'log' ? dayLog(dietDate()) : recipeById(from).items;
        list.splice(list.indexOf(e) + 1, 0, { ...e, id: uid(), f: { ...e.f } }); afterEdit();
      } }),
      h('button', { class: 'ib del', title: 'Remove', html: ICON.x, onclick: () => {
        const list = from === 'log' ? dayLog(dietDate()) : recipeById(from).items;
        list.splice(list.indexOf(e), 1); afterEdit();
      } })));
  dragHandlers(row, main, e, from, 'food');
  return row;
}
function recipeCard(e) {
  const r = recipeById(e.rid);
  if (!r) return h('div', { class: 'fitem', 'data-id': e.id }, h('div', { class: 'f-main' }, h('div', { class: 'f-name' }, '(deleted recipe)')),
    h('div', { class: 'acts' }, h('button', { class: 'ib del', html: ICON.x, onclick: () => { const l = dayLog(dietDate()); l.splice(l.indexOf(e), 1); afterEdit(); } })));
  const m = entryMacros(e);
  const renaming = dietUI.renaming === r.id;
  const nameEl = renaming
    ? h('input', { class: 'rn-in', value: r.name, maxlength: '60', spellcheck: 'false', onclick: (ev) => ev.stopPropagation(),
      onkeydown: (ev) => { if (ev.key === 'Enter') ev.target.blur(); else if (ev.key === 'Escape') { dietUI.renaming = null; renderDiet(); } },
      onblur: (ev) => { if (dietUI.renaming !== r.id) return; dietUI.renaming = null; r.name = ev.target.value.trim() || r.name; afterEdit(); } })
    : h('span', { class: 'r-name', title: 'Click to rename', onclick: () => { dietUI.renaming = r.id; renderDiet(); } }, r.name);
  const main = h('div', { class: 'f-main' }, h('div', { class: 'f-name' }, '📜 ', nameEl), h('div', { class: 'f-sub' }, `${macroLine(m)}${e.servings !== 1 ? ` (×${e.servings})` : ''}`));
  const sv = stepper({ get: () => e.servings, set: (v) => { e.servings = v; afterEdit(); }, step: () => 0.5, label: () => '×', toggle: null });
  const card = h('div', { class: 'recipe', 'data-id': e.id, 'data-rid': r.id },
    h('div', { class: 'r-head' }, main, sv,
      h('div', { class: 'acts' },
        h('button', { class: 'ib', title: 'Add food to this recipe', html: ICON.plus, onclick: () => openFoodAdd(r.id) }),
        h('button', { class: 'ib clone', title: 'Duplicate as a new recipe', html: ICON.copy, onclick: () => {
          const copy = { id: uid(), name: `${r.name} copy`, items: r.items.map((i) => ({ ...i, id: uid(), f: { ...i.f } })) };
          state.diet.recipes.push(copy);
          const l = dayLog(dietDate()); l.splice(l.indexOf(e) + 1, 0, { id: uid(), kind: 'recipe', rid: copy.id, servings: e.servings }); afterEdit();
        } }),
        h('button', { class: 'ib del', title: 'Remove from this day', html: ICON.x, onclick: () => { const l = dayLog(dietDate()); l.splice(l.indexOf(e), 1); afterEdit(); } }))),
    h('div', { class: 'r-items' },
      r.items.length ? r.items.map((i) => foodRow(i, r.id)) : h('div', { class: 'r-empty' }, 'Drag foods here'),
      dietUI.add?.target === r.id ? addPanel() : null));
  dragHandlers(card, main, e, 'log', 'recipe');
  return card;
}

/* ---------- add area: two big buttons, or the lookup panel ---------- */
function addArea() {
  const a = dietUI.add;
  if (a && a.target == null) return addPanel();
  return h('div', { class: 'd-adds' },
    h('button', { class: 'plus dplus', title: 'Add food', 'aria-label': 'Add food', onclick: () => openFoodAdd(null) }, '+🍽️'),
    h('button', { class: 'plus dplus', title: 'New recipe', 'aria-label': 'New recipe', onclick: () => { dietUI.add = { kind: 'recipe', target: null, name: '' }; renderDiet(); } }, '+📜'));
}
function openFoodAdd(target) {
  dietUI.add = { kind: 'food', target, q: '', hi: 0, sel: null, online: [], busy: false, err: '', custom: null };
  renderDiet();
}
function closeAdd() { dietUI.add = null; renderDiet(); }

function addPanel() {
  const a = dietUI.add;
  const panel = h('div', { class: 'd-add' });
  const body = h('div', { class: 'd-add-body' });
  panel.append(body);
  a.el = panel;

  if (a.kind === 'recipe') {
    const input = h('input', { class: 'd-q', type: 'text', placeholder: 'Recipe name', value: a.name, maxlength: '60', spellcheck: 'false',
      oninput: (e) => { a.name = e.target.value; },
      onkeydown: (e) => {
        if (e.key === 'Escape') closeAdd();
        else if (e.key === 'Enter') {
          const r = { id: uid(), name: a.name.trim() || `Recipe #${state.diet.recipes.length + 1}`, items: [] };
          state.diet.recipes.push(r);
          dayLog(dietDate()).push({ id: uid(), kind: 'recipe', rid: r.id, servings: 1 });
          dietUI.add = null; afterEdit();
        }
      } });
    body.append(h('div', { class: 'd-hint' }, '📜 New recipe: type a name and press Enter'), input);
    return panel;
  }

  const input = h('input', { class: 'd-q', type: 'text', placeholder: 'Search foods and recipes (e.g. ghee, beef patty, apple)', value: a.q, spellcheck: 'false' });
  const results = h('div', { class: 'd-res' });
  const finish = (entry) => {
    const list = a.target ? recipeById(a.target).items : dayLog(dietDate());
    list.push(entry);
    dietUI.add = null; afterEdit();
  };
  const pickFood = (f) => {
    const hasUnit = !!f.u;
    a.sel = { f: { ...f }, mode: hasUnit ? 'n' : 'g', amt: hasUnit ? 1 : 100 };
    paint();
  };
  const useOnline = (f) => {
    const saved = state.diet.foods.find((x) => x.name === f.name) || (state.diet.foods.push({ ...f }), f);
    save(); pickFood(saved);
  };
  const paintResults = () => {
    const found = matchFoods(a.q), rows = [];
    found.forEach((f, i) => {
      rows.push(h('div', { class: `d-r ${i === a.hi ? 'hi' : ''}`, onmousedown: (e) => e.preventDefault(), onclick: () => choose(f) },
        h('span', { class: 'rn' }, f.recipe ? `📜 ${f.recipe.name}` : f.name),
        h('span', { class: 'rs' }, f.recipe ? `recipe · ${Math.round(recipeMacros(f.recipe).k)} kcal` : `${f.k} kcal/100g${f.u ? ` · by ${f.u}` : ''}`),
        f.recipe ? h('button', { class: 'ib del', title: 'Delete saved recipe', html: ICON.x, onmousedown: (e) => e.preventDefault(), onclick: (e) => {
          e.stopPropagation();
          if (!confirm(`Delete recipe "${f.recipe.name}" everywhere?`)) return;
          state.diet.recipes = state.diet.recipes.filter((r) => r.id !== f.recipe.id);
          for (const day of Object.values(state.diet.log)) for (let j = day.length - 1; j >= 0; j--) if (day[j].rid === f.recipe.id) day.splice(j, 1);
          save(); afterEdit();
        } }) : null));
    });
    a.online.forEach((f) => rows.push(h('div', { class: 'd-r', onmousedown: (e) => e.preventDefault(), onclick: () => useOnline(f) },
      h('span', { class: 'rn' }, f.name), h('span', { class: 'rs' }, `USDA · ${Math.round(f.k)} kcal/100g`))));
    if (a.q.trim().length >= 2) {
      rows.push(h('div', { class: 'd-more' },
        h('button', { class: 'lnk', onmousedown: (e) => e.preventDefault(), onclick: () => searchOnline() }, a.busy ? 'Searching USDA…' : 'Search USDA online'),
        h('button', { class: 'lnk', onmousedown: (e) => e.preventDefault(), onclick: () => { a.custom = { name: a.q.trim(), k: 0, p: 0, c: 0, f: 0 }; paint(); } }, '+ Custom food'),
        a.err ? h('span', { class: 'err' }, a.err) : null));
    } else if (!rows.length) rows.push(h('div', { class: 'd-hint' }, 'Type to search generic foods and ingredients'));
    results.replaceChildren(...rows);
    a.found = found;
  };
  const choose = (f) => {
    if (f.recipe) { finish({ id: uid(), kind: 'recipe', rid: f.recipe.id, servings: 1 }); return; }
    pickFood(f);
  };
  const searchOnline = async () => {
    if (a.busy) return;
    a.busy = true; a.err = ''; paintResults();
    try {
      const list = await window.api.searchFoods(a.q.trim(), state.settings.usdaKey);
      a.online = list.filter((x) => x.k > 0 || x.p > 0 || x.c > 0 || x.f > 0);
      if (!a.online.length) a.err = 'No USDA matches';
    } catch (err) { a.err = String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
    a.busy = false;
    if (dietUI.add === a && !a.sel) paintResults();
  };

  const paint = () => {
    if (a.custom) { paintCustom(); return; }
    if (a.sel) { paintQty(); return; }
    body.replaceChildren(input, results);
    paintResults();
    input.focus();
  };
  const paintQty = () => {
    const e = a.sel, prev = h('div', { class: 'f-sub' });
    const upd = () => { prev.textContent = macroLine(foodMacros(e)); };
    const st = foodStepper(e, (toggled) => { if (toggled) { paintQty(); } else upd(); });
    upd();
    const add = () => finish({ id: uid(), kind: 'food', ...e, f: { ...e.f } });
    const keys = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } else if (ev.key === 'Escape') { a.sel = null; paint(); } };
    body.replaceChildren(
      h('div', { class: 'd-pick' }, h('div', { class: 'f-main' }, h('div', { class: 'f-name' }, e.f.name), prev), st,
        h('button', { class: 'lnk', onclick: () => { a.sel = null; paint(); } }, 'Back'),
        h('button', { class: 'okbtn', onclick: add }, 'Add')));
    body.onkeydown = keys;
    const q = body.querySelector('.q-in'); if (q) { q.focus(); q.select(); }
  };
  const paintCustom = () => {
    const c = a.custom;
    const f = (key, label) => h('label', { class: 'g-f' }, label, h('input', { type: key === 'name' ? 'text' : 'number', min: '0', step: 'any', value: String(c[key]),
      oninput: (e) => { c[key] = key === 'name' ? e.target.value : Math.max(0, parseFloat(e.target.value) || 0); } }));
    body.replaceChildren(h('div', { class: 'd-hint' }, 'Custom food, values per 100 g'),
      h('div', { class: 'g-edit' }, h('div', { class: 'g-f wide' }, f('name', 'Name')), f('k', 'kcal'), f('p', 'Protein g'), f('c', 'Carbs g'), f('f', 'Fat g'),
        h('div', { class: 'g-btns' }, h('button', { onclick: () => { a.custom = null; paint(); } }, 'Back'),
          h('button', { class: 'pri', onclick: () => {
            if (!c.name.trim()) return;
            const food = { name: c.name.trim(), k: c.k, p: c.p, c: c.c, f: c.f };
            state.diet.foods.push(food); save(); a.custom = null; pickFood(food);
          } }, 'Save food'))));
  };

  input.addEventListener('input', () => { a.q = input.value; a.hi = 0; a.online = []; a.err = ''; paintResults(); });
  input.addEventListener('keydown', (e) => {
    const n = (a.found || []).length;
    if (e.key === 'Escape') closeAdd();
    else if (e.key === 'ArrowDown') { e.preventDefault(); a.hi = Math.min(n - 1, a.hi + 1); paintResults(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); a.hi = Math.max(0, a.hi - 1); paintResults(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (a.found?.[a.hi]) choose(a.found[a.hi]); }
  });
  paint();
  return panel;
}
document.addEventListener('click', (e) => {
  const a = dietUI.add;
  if (a && a.el && !a.el.contains(e.target) && !e.target.closest('.dplus,.r-head .acts')) { dietUI.add = null; renderDiet(); }
}, true);

/* ---------- drag between the day and recipes ---------- */
function clearDietMarks() { document.querySelectorAll('#diet .drop-above,#diet .drop-below,#diet .drop-in').forEach((el) => el.classList.remove('drop-above', 'drop-below', 'drop-in')); }
function wireDietDrag(root) {
  if (dietUI.wired) return;
  dietUI.wired = true;
  root.addEventListener('dragover', (e) => {
    const d = dietUI.drag;
    if (!d) return;
    e.preventDefault();
    // foods can go into a recipe (or its list); recipes only reorder within the day
    const card = d.kind === 'food' ? e.target.closest('.recipe') : null;
    const to = card ? card.dataset.rid : 'log';
    const box = card ? card.querySelector('.r-items') : root.querySelector('.d-list');
    const rows = [...box.children].filter((el) => (el.classList.contains('fitem') || el.classList.contains('recipe')) && el.dataset.id !== d.id);
    clearDietMarks();
    const hit = rows.length ? nearestRow(rows, e.clientY) : null;
    dietUI.dropAt = { to, id: hit ? hit.row.dataset.id : null, after: !!hit?.after };
    if (hit) hit.row.classList.add(hit.after ? 'drop-below' : 'drop-above'); else box.classList.add('drop-in');
  });
  root.addEventListener('drop', (e) => {
    const d = dietUI.drag, at = dietUI.dropAt;
    if (!d || !at) return;
    e.preventDefault();
    const src = d.from === 'log' ? dayLog(dietDate()) : recipeById(d.from).items;
    const dst = at.to === 'log' ? dayLog(dietDate()) : recipeById(at.to).items;
    const from = src.findIndex((x) => x.id === d.id);
    if (from < 0) return;
    const [it] = src.splice(from, 1);
    let pos = at.id ? dst.findIndex((x) => x.id === at.id) : -1;
    if (pos < 0) pos = dst.length; else if (at.after) pos++;
    dst.splice(pos, 0, it);
    dietUI.drag = null; dietUI.dropAt = null;
    afterEdit();
  });
}
