'use strict';

/* ================= constants ================= */
const STORE_KEY = 'tasks-app-v1';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Muted take on the 16 HTML colors (black/gray/silver/white become slate tones).
const COLORS = [
  '#d49aa2', '#e6a3a0', '#b9a0cc', '#d8a6cb', '#9fcba6', '#c3dc9f', '#c9c28c', '#ecdc9c',
  '#94a5d1', '#9fc0e8', '#8fcbc8', '#a9dce0', '#8a909b', '#a2a8b1', '#c8ccd2', '#e8e6e1',
];
const ADD = '__add'; // the "new category" pseudo-tile in the layout
const ICON = {
  x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8"/><path d="M2.5 10.5V4.3c0-1 .8-1.8 1.8-1.8h6.2"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M12 4v16M4 12h16"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  brush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4L12 12"/><path d="M10.5 10.5l3 3"/><path d="M13.5 13.5c0 3.2-2.2 6-7 6 1.3-1.1 1.7-2.1 1.7-3.3 0-1.6 1.4-2.7 2.9-2.7z"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
};

/* ================= state ================= */
const DEFAULTS = () => ({
  settings: { open: 'daily', weekStart: 'mon', allDays: false, switcher: 'tabs', interp: 'linear', statsMode: 'pct', statsGran: 'week', statsRange: 1, bg: { type: 'default' } },
  daily: { tasks: [], checks: {} },
  todo: { cats: [], layout: null },
});

let state = load();
const ui = {
  view: state.settings.open,
  weekOffset: 0,
  statsOffset: 0,
  statsLock: null,
  statsHover: null,
  editor: null, // {kind, id, draft, apply, el}
  drag: null,
  overlay: null,
  popOpen: false,
};

function load() {
  const d = DEFAULTS();
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s) {
      Object.assign(d.settings, s.settings);
      Object.assign(d.daily, s.daily);
      Object.assign(d.todo, s.todo);
    }
  } catch { /* fresh state */ }
  normalizeLayout(d.todo);
  d.daily.tasks.forEach((t, i) => {
    if (!t.color) t.color = pickTaskColor(d.daily.tasks, i);
    if (!t.created) t.created = Object.keys(d.daily.checks[t.id] || {}).sort()[0] || isoDate(new Date());
  });
  return d;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k === 'vars') for (const [n, x] of Object.entries(v)) el.style.setProperty(n, x);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(k));
  }
  return el;
}

function pickTaskColor(tasks, index) {
  // Unique colors while there is room; past 16 tasks, only avoid the neighbours.
  const others = tasks.filter((_, i) => i !== index);
  let pool = COLORS.filter((c) => !others.some((t) => t.color === c));
  if (!pool.length) {
    const near = [tasks[index - 1]?.color, tasks[index + 1]?.color];
    pool = COLORS.filter((c) => !near.includes(c));
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
function desat(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let hh = 0, ss = 0;
  if (d) {
    ss = d / (1 - Math.abs(2 * l - 1));
    hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  }
  ss *= f;
  const c = (1 - Math.abs(2 * l - 1)) * ss, x = c * (1 - Math.abs((hh % 2) - 1)), m = l - c / 2;
  [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hh) % 6].map((v) => Math.round((v + m) * 255));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
const BG_COLORS = COLORS.map((c) => desat(c, 0.35));
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function fmtDate(v) {
  const d = new Date(v);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.5 ? '#26282c' : '#ffffff';
}

/* ================= typesetting: markdown-lite + LaTeX (KaTeX) ================= */
function renderText(src) {
  const stash = [];
  const keep = (html) => `${stash.push(html) - 1}`;
  let s = src.replace(/`([^`\n]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  s = s.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (m, block, inline) => {
    const tex = block ?? inline;
    if (!window.katex) return keep(esc(m));
    try { return keep(katex.renderToString(tex, { displayMode: block != null, throwOnError: false })); }
    catch { return keep(esc(m)); }
  });
  s = esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>');
  return s.replace(/(\d+)/g, (_, i) => stash[i]);
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ================= shared editor machinery ================= */
// One inline editor at a time. Enter / click-away commits (empty name discards), Esc cancels.
function openEditor(ed) { ui.editor = ed; render(); }
function commitEditor(viaEnter = false) {
  const ed = ui.editor;
  if (!ed) return;
  ui.editor = null;
  // Enter on a new, nameless task creates "Task #n"; clicking away discards it.
  const name = ed.draft.name.trim() || (viaEnter && ed.id === 'new' ? ed.fallback() : '');
  if (name) { ed.apply(name); save(); }
  render();
}
function cancelEditor() { ui.editor = null; render(); }

function editorInput(draft) {
  const i = h('input', { class: 'ed', type: 'text', value: draft.name, placeholder: 'Task name', spellcheck: 'false', maxlength: '200' });
  i.addEventListener('input', () => { draft.name = i.value; });
  i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEditor(true); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEditor(); }
  });
  return i;
}
// toggles keep focus in the text input so Enter always confirms
const keepFocus = (e) => e.preventDefault();

document.addEventListener('click', (e) => {
  if (ui.editor && ui.editor.el && !ui.editor.el.contains(e.target)) commitEditor();
  if (ui.popOpen && !$('#pop').contains(e.target) && !$('#gear').contains(e.target)) closePop();
}, true);

function actions(onClone, onDelete) {
  return h('div', { class: 'acts' },
    h('button', { class: 'ib clone', title: 'Duplicate', html: ICON.copy, onclick: (e) => { e.stopPropagation(); onClone(); } }),
    h('button', { class: 'ib del', title: 'Delete', html: ICON.x, onclick: (e) => { e.stopPropagation(); onDelete(); } }));
}
const plusButton = (cls, label, onclick) => h('button', { class: `plus ${cls}`, title: label, 'aria-label': label, html: ICON.plus, onclick });
const checkbox = (on, onclick, extra = '') => h('button', { class: `chk ${extra} ${on ? 'on' : ''}`, html: ICON.check, onclick, 'aria-pressed': String(!!on) });

/* ================= DAILY ================= */
function weekColumns() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startDow = state.settings.weekStart === 'mon' ? 1 : 0;
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() - startDow + 7) % 7) + 7 * ui.weekOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return { date: d, dow: d.getDay(), iso: isoDate(d), today: isoDate(d) === isoDate(today) };
  });
}

function renderDaily() {
  const root = $('#daily');
  const cols = weekColumns();
  const a = cols[0].date, b = cols[6].date;
  const range = a.getMonth() === b.getMonth()
    ? `${MONTHS[a.getMonth()]} ${a.getDate()} – ${b.getDate()}`
    : `${MONTHS[a.getMonth()]} ${a.getDate()} – ${MONTHS[b.getMonth()]} ${b.getDate()}`;

  const grid = h('div', { class: 'dgrid' },
    h('div', { class: 'drow head' }, h('div'), cols.map((c) => h('div', { class: `hd ${c.today ? 'today' : ''}` }, LETTERS[c.dow]))),
    state.daily.tasks.map((t) => (ui.editor?.kind === 'daily' && ui.editor.id === t.id ? dailyEditorRow(cols) : dailyRow(t, cols))),
    ui.editor?.kind === 'daily' && ui.editor.id === 'new'
      ? dailyEditorRow(cols)
      : endDrop(plusButton('large', 'Add task', () => openEditor({ kind: 'daily', id: 'new', fallback: () => `Task #${state.daily.tasks.length + 1}`, draft: { name: '', days: Array(7).fill(state.settings.allDays), color: pickTaskColor(state.daily.tasks, state.daily.tasks.length) }, apply(name) {
        state.daily.tasks.push({ id: uid(), name, days: this.draft.days.slice(), color: this.draft.color, created: isoDate(new Date()) });
      } }))));

  root.replaceChildren(
    h('div', { class: 'wk' },
      h('div', { class: 'wk-main' },
        h('button', { class: 'ib big', title: 'Previous week', html: ICON.left, onclick: () => { ui.weekOffset--; render(); } }),
        h('span', { class: 'lbl' }, range),
        h('button', { class: 'ib big', title: 'Next week', html: ICON.right, onclick: () => { ui.weekOffset++; render(); } })),
      h('button', { class: 'today-btn', style: { visibility: ui.weekOffset ? 'visible' : 'hidden' }, onclick: () => { ui.weekOffset = 0; render(); } }, 'This week')),
    grid);
}

function endDrop(btn) {
  btn.addEventListener('dragover', (e) => { if (ui.dragTask) { e.preventDefault(); clearDropMarks(); btn.classList.add('drop-above'); } });
  btn.addEventListener('dragleave', () => btn.classList.remove('drop-above'));
  btn.addEventListener('drop', (e) => { if (ui.dragTask) { e.preventDefault(); moveTask(ui.dragTask, null, true); } });
  return btn;
}

function dailyRow(t, cols) {
  const checks = state.daily.checks[t.id] || {};
  const name = h('div', {
    class: 'dname',
    onclick: (e) => {
      if (e.target.closest('button')) return;
      openEditor({ kind: 'daily', id: t.id, draft: { name: t.name, days: t.days.slice(), color: t.color }, apply(n) { t.name = n; t.days = this.draft.days.slice(); t.color = this.draft.color; } });
    },
  },
  h('span', { class: 'ttl', html: renderText(t.name) }),
  actions(() => {
    const i = state.daily.tasks.indexOf(t);
    const copy = { id: uid(), name: t.name, days: t.days.slice(), color: t.color, created: isoDate(new Date()) };
    state.daily.tasks.splice(i + 1, 0, copy);
    copy.color = pickTaskColor(state.daily.tasks, i + 1);
    save(); render();
  }, () => {
    state.daily.tasks = state.daily.tasks.filter((x) => x !== t);
    delete state.daily.checks[t.id];
    save(); render();
  }));
  const row = h('div', { class: 'drow task', vars: { '--c': t.color, '--on': textOn(t.color) } }, name, cols.map((c) => {
    if (!t.days[c.dow]) return h('div', { class: 'dcell' });
    const box = checkbox(!!checks[c.iso], () => {
      const m = (state.daily.checks[t.id] ||= {});
      if (m[c.iso]) delete m[c.iso]; else m[c.iso] = true;
      box.classList.toggle('on', !!m[c.iso]);
      box.setAttribute('aria-pressed', String(!!m[c.iso]));
      save();
    });
    return h('div', { class: 'dcell' }, box);
  }));
  name.draggable = true;
  name.addEventListener('dragstart', (e) => {
    ui.dragTask = t.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.setDragImage(row, 20, 20);
    setTimeout(() => row.classList.add('dragging'), 0);
  });
  name.addEventListener('dragend', () => { ui.dragTask = null; row.classList.remove('dragging'); clearDropMarks(); });
  row.addEventListener('dragover', (e) => {
    if (!ui.dragTask || ui.dragTask === t.id) return;
    e.preventDefault();
    const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
    clearDropMarks();
    row.classList.add(after ? 'drop-below' : 'drop-above');
  });
  row.addEventListener('drop', (e) => {
    if (!ui.dragTask) return;
    e.preventDefault();
    moveTask(ui.dragTask, t.id, row.classList.contains('drop-below'));
  });
  return row;
}
function clearDropMarks() { document.querySelectorAll('.drop-above,.drop-below').forEach((el) => el.classList.remove('drop-above', 'drop-below')); }
function moveTask(id, targetId, after) {
  const arr = state.daily.tasks;
  const [t] = arr.splice(arr.findIndex((x) => x.id === id), 1);
  let to = targetId ? arr.findIndex((x) => x.id === targetId) : arr.length;
  if (targetId && after) to++;
  arr.splice(to, 0, t);
  ui.dragTask = null;
  save(); render();
}

function dailyEditorRow(cols) {
  const ed = ui.editor;
  const input = editorInput(ed.draft);
  const dot = h('button', { class: 'dot', title: 'Highlight color', onclick: () => {
    const open = row.querySelector('.palette');
    if (open) { open.remove(); return; }
    const pal = h('div', { class: 'palette' }, COLORS.map((c) => h('button', {
      class: `swatch ${c === ed.draft.color ? 'sel' : ''}`, vars: { '--c': c },
      onclick: () => { ed.draft.color = c; row.style.setProperty('--c', c); row.style.setProperty('--on', textOn(c)); pal.remove(); input.focus(); },
    })));
    nameCell.append(pal);
  } });
  dot.addEventListener('mousedown', keepFocus);
  const nameCell = h('div', { class: 'dname' }, dot, input);
  const row = h('div', { class: 'drow task editor', vars: { '--c': ed.draft.color, '--on': textOn(ed.draft.color) } },
    nameCell,
    cols.map((c) => {
      const b = checkbox(ed.draft.days[c.dow], () => {
        ed.draft.days[c.dow] = !ed.draft.days[c.dow];
        b.classList.toggle('on', ed.draft.days[c.dow]);
      }, 'ghost');
      b.tabIndex = -1;
      b.addEventListener('mousedown', keepFocus);
      return h('div', { class: 'dcell' }, b);
    }));
  ed.el = row;
  return row;
}

/* ================= TODO ================= */
function normalizeLayout(todo) {
  const ids = new Set([ADD, ...todo.cats.map((c) => c.id)]);
  const seen = new Set();
  const prune = (n) => {
    if (!n) return null;
    if (n.cat) return ids.has(n.cat) && !seen.has(n.cat) && seen.add(n.cat) ? n : null;
    const kids = [], ws = [];
    n.kids.forEach((k, i) => { const r = prune(k); if (r) { kids.push(r); ws.push(n.ws[i] || 1); } });
    return tidy({ dir: n.dir, kids, ws });
  };
  todo.layout = prune(todo.layout);
  for (const id of ids) if (!seen.has(id)) todo.layout = todo.layout ? tidy({ dir: 'row', kids: [todo.layout, { cat: id }], ws: [1, 1] }) : { cat: id };
}
// Collapse empty/single-child splits and merge same-direction nesting so every tile stays a clean rectangle.
function tidy(n) {
  if (!n || n.cat) return n;
  const kids = [], ws = [];
  n.kids.forEach((k, i) => {
    k = tidy(k);
    if (!k) return;
    if (!k.cat && k.dir === n.dir) {
      const sum = k.ws.reduce((a, b) => a + b, 0);
      k.kids.forEach((kk, j) => { kids.push(kk); ws.push((n.ws[i] * k.ws[j]) / sum); });
    } else { kids.push(k); ws.push(n.ws[i]); }
  });
  if (!kids.length) return null;
  if (kids.length === 1) return kids[0];
  return { dir: n.dir, kids, ws };
}
function removeLeaf(n, id) {
  if (!n) return null;
  if (n.cat) return n.cat === id ? null : n;
  n.kids.forEach((k, i) => { n.kids[i] = removeLeaf(k, id); });
  const keep = n.kids.map((k) => !!k);
  n.ws = n.ws.filter((_, i) => keep[i]);
  n.kids = n.kids.filter(Boolean);
  return tidy(n);
}
// Split the tile holding `target` and put `id` on the given side.
function insertAt(root, target, id, zone) {
  const dir = zone === 'left' || zone === 'right' ? 'row' : 'col';
  const before = zone === 'left' || zone === 'top';
  const leaf = { cat: id };
  const wrap = (n) => ({ dir, kids: before ? [leaf, n] : [n, leaf], ws: [1, 1] });
  if (!root) return leaf;
  if (root.cat) return root.cat === target ? tidy(wrap(root)) : root;
  const rec = (n) => {
    for (let i = 0; i < n.kids.length; i++) {
      const k = n.kids[i];
      if (k.cat === target) { n.kids[i] = wrap(k); return true; }
      if (!k.cat && rec(k)) return true;
    }
    return false;
  };
  rec(root);
  return tidy(root);
}
function swapLeaves(n, a, b) {
  if (n.cat) { if (n.cat === a) n.cat = b; else if (n.cat === b) n.cat = a; return; }
  n.kids.forEach((k) => swapLeaves(k, a, b));
}

function renderTodo() {
  const board = h('div', { class: 'board' }, renderNode(state.todo.layout));
  board.addEventListener('dragleave', (e) => { if (!board.contains(e.relatedTarget)) hideOverlay(); });
  ui.board = board;
  ui.overlay = null;
  $('#todo').replaceChildren(board);
}

function renderNode(n) {
  if (n.cat === ADD) return addTile();
  if (n.cat) return tile(state.todo.cats.find((c) => c.id === n.cat));
  const el = h('div', { class: `split ${n.dir}` });
  n.kids.forEach((k, i) => {
    if (i) el.append(divider(n, i));
    el.append(h('div', { class: 'cell', style: { flex: `${n.ws[i]} 1 0` } }, renderNode(k)));
  });
  return el;
}

function divider(node, i) {
  const d = h('div', { class: 'divider' });
  d.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    d.setPointerCapture(e.pointerId);
    d.classList.add('drag');
    const a = d.previousElementSibling, b = d.nextElementSibling;
    const horiz = node.dir === 'row';
    const sa = horiz ? a.offsetWidth : a.offsetHeight, sb = horiz ? b.offsetWidth : b.offsetHeight;
    const wsum = node.ws[i - 1] + node.ws[i], start = horiz ? e.clientX : e.clientY, min = 0.15 * (sa + sb);
    const move = (ev) => {
      const na = Math.min(Math.max(sa + (horiz ? ev.clientX : ev.clientY) - start, min), sa + sb - min);
      node.ws[i - 1] = (wsum * na) / (sa + sb);
      node.ws[i] = wsum - node.ws[i - 1];
      a.style.flex = `${node.ws[i - 1]} 1 0`; b.style.flex = `${node.ws[i]} 1 0`;
    };
    const up = () => { d.classList.remove('drag'); d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); save(); };
    d.addEventListener('pointermove', move); d.addEventListener('pointerup', up);
  });
  return d;
}

function dropZone(e, el, allowSwap = true) {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  if (allowSwap && x > 0.3 && x < 0.7 && y > 0.3 && y < 0.7) return 'swap';
  const d = { left: x, right: 1 - x, top: y, bottom: 1 - y };
  return Object.keys(d).reduce((m, k) => (d[k] < d[m] ? k : m));
}
function showOverlay(el, zone) {
  const b = ui.board.getBoundingClientRect(), r = el.getBoundingClientRect();
  const box = { l: r.left - b.left, t: r.top - b.top, w: r.width, h: r.height };
  if (zone === 'left') box.w /= 2;
  if (zone === 'right') { box.l += box.w / 2; box.w /= 2; }
  if (zone === 'top') box.h /= 2;
  if (zone === 'bottom') { box.t += box.h / 2; box.h /= 2; }
  if (!ui.overlay) { ui.overlay = h('div', { class: 'ov' }); ui.board.append(ui.overlay); }
  ui.overlay.className = `ov ${zone === 'swap' ? 'swap' : ''}`;
  Object.assign(ui.overlay.style, { left: `${box.l}px`, top: `${box.t}px`, width: `${box.w}px`, height: `${box.h}px` });
}
function hideOverlay() { ui.overlay?.remove(); ui.overlay = null; }

function dropTarget(el, targetId, allowSwap) {
  el.addEventListener('dragover', (e) => {
    if (!ui.drag || ui.drag === targetId) return;
    e.preventDefault();
    showOverlay(el, dropZone(e, el, allowSwap));
  });
  el.addEventListener('drop', (e) => {
    if (!ui.drag || ui.drag === targetId) return;
    e.preventDefault();
    const zone = dropZone(e, el, allowSwap), id = ui.drag;
    ui.drag = null; hideOverlay();
    if (zone === 'swap') swapLeaves(state.todo.layout, id, targetId);
    else {
      state.todo.layout = removeLeaf(state.todo.layout, id);
      state.todo.layout = insertAt(state.todo.layout, targetId, id, zone);
    }
    state.todo.layout = tidy(state.todo.layout);
    save(); render();
  });
}

// The "new category" button lives in the layout as an immovable tile.
function addTile() {
  const el = h('section', { class: 'add-tile' },
    h('button', { class: 'sq', title: 'New category', 'aria-label': 'New category', html: ICON.plus, onclick: () => catModal() }));
  dropTarget(el, ADD, false);
  return el;
}

function tile(cat) {
  const el = h('section', { class: 'cat', vars: { '--c': cat.color, '--on': textOn(cat.color) } });
  const head = h('header', {
    class: 'cat-h', draggable: 'true', title: 'Drag to rearrange · click to edit',
    ondragstart: (e) => {
      ui.drag = cat.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cat.id);
      e.dataTransfer.setDragImage(el, 20, 20);
      setTimeout(() => el.classList.add('dragging'), 0);
    },
    ondragend: () => { ui.drag = null; el.classList.remove('dragging'); hideOverlay(); },
    onclick: (e) => { if (!e.target.closest('button')) catModal(cat); },
  },
  h('span', { class: 'nm' }, cat.name),
  h('span', { class: 'cnt' }, `${cat.tasks.filter((t) => t.done).length}/${cat.tasks.length}`),
  actions(() => cloneCat(cat), () => {
    if (cat.tasks.length && !confirm(`Delete "${cat.name}" and its ${cat.tasks.length} task(s)?`)) return;
    state.todo.cats = state.todo.cats.filter((c) => c !== cat);
    state.todo.layout = removeLeaf(state.todo.layout, cat.id);
    save(); render();
  }));

  dropTarget(el, cat.id, true);

  const ed = ui.editor;
  const adding = ed?.kind === 'todo' && ed.id === 'new' && ed.cat === cat.id;
  el.append(head, h('div', { class: 'cat-list' },
    cat.tasks.map((t) => (ed?.kind === 'todo' && ed.id === t.id ? todoEditor(ed) : todoTask(cat, t))),
    adding ? todoEditor(ed)
      : plusButton('small', 'Add task', () => openEditor({ kind: 'todo', id: 'new', cat: cat.id, fallback: () => `Task #${cat.tasks.length + 1}`, draft: { name: '', done: false }, apply(name) {
        cat.tasks.push(makeTask(name, this.draft.done));
      } }))));
  return el;
}

function makeTask(name, done) {
  const now = new Date().toISOString();
  return { id: uid(), name, done: !!done, created: now, completed: done ? now : null };
}
function setDone(t, done) {
  if (done === t.done) return;
  t.done = done;
  t.completed = done ? new Date().toISOString() : null;
}

function todoTask(cat, t) {
  return h('div', {
    class: `ttask ${t.done ? 'done' : ''}`,
    onclick: (e) => {
      if (e.target.closest('button')) return;
      openEditor({ kind: 'todo', id: t.id, cat: cat.id, draft: { name: t.name, done: t.done }, apply(n) { t.name = n; setDone(t, this.draft.done); } });
    },
  },
  h('div', { class: 'dates' }, h('span', {}, fmtDate(t.created)), h('span', {}, t.completed ? fmtDate(t.completed) : '')),
  h('div', { class: 'trow' },
    checkbox(t.done, () => { setDone(t, !t.done); save(); render(); }),
    h('div', { class: 'tname', html: renderText(t.name) }),
    actions(() => {
      cat.tasks.splice(cat.tasks.indexOf(t) + 1, 0, makeTask(t.name, false));
      save(); render();
    }, () => { cat.tasks = cat.tasks.filter((x) => x !== t); save(); render(); })));
}

function todoEditor(ed) {
  const input = editorInput(ed.draft);
  const box = checkbox(ed.draft.done, () => { ed.draft.done = !ed.draft.done; box.classList.toggle('on', ed.draft.done); }, 'ghost');
  box.tabIndex = -1;
  box.addEventListener('mousedown', keepFocus);
  const el = h('div', { class: 'ttask editor' }, h('div', { class: 'trow' }, box, input));
  ed.el = el;
  return el;
}

function cloneCat(cat) {
  const copy = {
    id: uid(), name: cat.name, color: cat.color,
    tasks: cat.tasks.map((t) => ({ ...t, id: uid() })),
  };
  state.todo.cats.splice(state.todo.cats.indexOf(cat) + 1, 0, copy);
  state.todo.layout = insertAt(state.todo.layout, cat.id, copy.id, 'right');
  save(); render();
}

/* ---------- category modal ---------- */
function catModal(cat) {
  const used = new Set(state.todo.cats.map((c) => c.color));
  const free = COLORS.filter((c) => !used.has(c));
  const pool = free.length ? free : COLORS;
  let color = cat ? cat.color : pool[Math.floor(Math.random() * pool.length)];

  const input = h('input', { class: 'name', type: 'text', value: cat ? cat.name : '', placeholder: 'Category name', maxlength: '60', spellcheck: 'false' });
  const sw = COLORS.map((c) => h('button', {
    class: `swatch ${c === color ? 'sel' : ''} ${used.has(c) ? 'used' : ''}`, title: c,
    vars: { '--c': c, '--on': textOn(c) },
    onclick: () => { color = c; sw.forEach((s) => s.classList.toggle('sel', s === sw[COLORS.indexOf(c)])); input.focus(); },
  }));
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const confirmIt = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    if (cat) { cat.name = name; cat.color = color; }
    else {
      const c = { id: uid(), name, color, tasks: [] };
      state.todo.cats.push(c);
      state.todo.layout = insertAt(state.todo.layout, ADD, c.id, 'left');
      const L = state.todo.layout; // rebalance the top-level columns; the add tile stays narrow
      if (L.dir === 'row') L.ws = L.kids.map((k) => (k.cat === ADD ? 0.45 : 1));
    }
    save(); close(); render();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'Enter') { e.preventDefault(); confirmIt(); }
  };
  const back = h('div', { class: 'backdrop', onmousedown: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal', role: 'dialog' },
      h('h2', {}, cat ? 'Edit category' : 'New category'),
      input,
      h('div', { class: 'swatches' }, sw),
      h('div', { class: 'btns' }, h('button', { onclick: close }, 'Cancel'), h('button', { class: 'pri', onclick: confirmIt }, cat ? 'Save' : 'Add'))));
  document.body.append(back);
  document.addEventListener('keydown', onKey, true);
  input.focus(); input.setSelectionRange(input.value.length, input.value.length);
}

/* ================= settings ================= */
const SETTINGS = [
  { key: 'open', title: 'Open at', opts: [['Daily', 'daily'], ['Todo', 'todo'], ['Stats', 'stats']] },
  { key: 'weekStart', title: 'Week starts on', opts: [['Monday', 'mon'], ['Sunday', 'sun']] },
  { key: 'allDays', title: 'New tasks are daily', opts: [['No', false], ['Yes', true]] },
  { key: 'switcher', title: 'Window switcher', opts: [['Tabs', 'tabs'], ['Arrows', 'arrows']] },
  { key: 'interp', title: 'Graph interpolation', circles: true, opts: [['x<sup>1</sup>', 'linear'], ['x<sup>2</sup>', 'quadratic'], ['x<sup>3</sup>', 'cubic']] },
];
function setSetting(key, value) {
  state.settings[key] = value;
  save(); applySettings(); render();
  if (ui.popOpen) syncPop();
}
function applyBackground() {
  const bg = state.settings.bg, el = $('#bg');
  el.style.backgroundImage = bg.type === 'default' ? 'url("assets/biodome.jpg")' : bg.type === 'file' ? `url("${bg.value}")` : 'none';
  el.style.backgroundColor = bg.type === 'color' ? bg.value : 'transparent';
}
function setBackground(bg) {
  state.settings.bg = bg;
  save(); applyBackground(); syncPop();
}
// Update the existing controls in place so the switches animate.
function syncPop() {
  for (const s of SETTINGS) {
    const idx = s.opts.findIndex((o) => o[1] === state.settings[s.key]);
    const row = $(`#pop [data-key="${s.key}"]`);
    if (s.opts.length === 2 && !s.circles) {
      row.querySelector('.track').classList.toggle('on', idx === 1);
      row.querySelector('.track').setAttribute('aria-checked', String(idx === 1));
      row.querySelectorAll('.opt').forEach((o, i) => o.classList.toggle('cur', i === idx));
    } else {
      row.querySelectorAll('.pick').forEach((b, i) => b.classList.toggle('sel', i === idx));
    }
  }
  const bg = state.settings.bg;
  const isColor = (v) => bg.type === 'color' && bg.value === v;
  $('#pop .bgrow').replaceChildren(
    h('button', { class: `bgbtn white ${isColor('#ffffff') ? 'sel' : ''}`, title: 'White', onclick: () => setBackground({ type: 'color', value: '#ffffff' }) }),
    h('button', { class: `bgbtn black ${isColor('#000000') ? 'sel' : ''}`, title: 'Black', onclick: () => setBackground({ type: 'color', value: '#000000' }) }),
    h('button', { class: `bgbtn rainbow ${bg.type === 'color' && !['#ffffff', '#000000'].includes(bg.value) ? 'sel' : ''}`, title: 'Pick a color', html: ICON.chev, onclick: () => { ui.bgPicker = !ui.bgPicker; syncPop(); } }),
    h('button', { class: `bgbtn ${bg.type === 'file' ? 'sel' : ''}`, title: 'Choose an image', html: ICON.file, onclick: async () => {
      const url = await window.api?.chooseBackground();
      if (url) setBackground({ type: 'file', value: `${url}?t=${Date.now()}` });
    } }));
  $('#pop .bgcols').hidden = !ui.bgPicker;
  $('#pop .bgcols').replaceChildren(...BG_COLORS.map((c) => h('button', {
    class: `swatch ${bg.value === c ? 'sel' : ''}`, vars: { '--c': c }, title: c,
    onclick: () => setBackground({ type: 'color', value: c }),
  })));
}
function buildPop() {
  const control = (s) => {
    if (s.circles) return h('div', { class: 'circs' }, s.opts.map(([l, v]) => h('button', { class: 'pick circ', title: v, html: l, onclick: () => setSetting(s.key, v) })));
    if (s.opts.length > 2) return h('div', { class: 'seg' }, s.opts.map(([l, v]) => h('button', { class: 'pick', onclick: () => setSetting(s.key, v) }, l)));
    const [a, b] = s.opts;
    return h('div', { class: 'sw' },
      h('span', { class: 'opt', onclick: () => setSetting(s.key, a[1]) }, a[0]),
      h('button', { class: 'track', role: 'switch', 'aria-label': s.title, onclick: () => setSetting(s.key, state.settings[s.key] === b[1] ? a[1] : b[1]) }),
      h('span', { class: 'opt', onclick: () => setSetting(s.key, b[1]) }, b[0]));
  };
  $('#pop').replaceChildren(
    ...SETTINGS.map((s) => h('div', { class: 'srow', 'data-key': s.key }, h('span', { class: 'sl' }, s.title), control(s))),
    h('div', { class: 'srow col' }, h('span', { class: 'sl' }, 'Background'), h('div', { class: 'bgrow' }), h('div', { class: 'bgcols', hidden: true })),
    h('div', { class: 'note' }, 'Task names support Markdown and LaTeX.'));
  syncPop();
}
function closePop() { ui.popOpen = false; $('#pop').hidden = true; }
function togglePop() {
  ui.popOpen = !ui.popOpen;
  $('#pop').hidden = !ui.popOpen;
  if (ui.popOpen) syncPop();
}

/* ================= STATS ================= */
const LINE_STOPS = ['#e07b78', '#e0b84a', '#6fb87a', '#4fb3b0', '#5f93d6', '#9a78c4'];
const SVGNS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), m = (v) => Math.round(v * (1 - f));
  return `#${((1 << 24) | (m(n >> 16) << 16) | (m((n >> 8) & 255) << 8) | m(n & 255)).toString(16).slice(1)}`;
}
function weekStartOf(date) {
  const startDow = state.settings.weekStart === 'mon' ? 1 : 0;
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - startDow + 7) % 7));
  return d;
}
const GRANS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']];
const RANGE_OPTS = { day: [7, 14, 30, 90], week: [4, 12, 26, 52], month: [6, 12, 24, 36], year: [3, 5, 10, 20] };
const CAPTION = { day: 'Day', week: 'Week of', month: 'Month', year: 'Year' };
function bucketStart(date, g) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  if (g === 'week') return weekStartOf(d);
  if (g === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (g === 'year') return new Date(d.getFullYear(), 0, 1);
  return d;
}
function shiftBucket(d, g, k) {
  if (g === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
  if (g === 'week') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * k);
  if (g === 'month') return new Date(d.getFullYear(), d.getMonth() + k, 1);
  return new Date(d.getFullYear() + k, 0, 1);
}
function bucketLabel(d, g) {
  if (g === 'year') return String(d.getFullYear());
  if (g === 'month') return `${MONTHS[d.getMonth()]} ’${String(d.getFullYear()).slice(2)}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
// One point per period: checks done vs. days a task was enabled. A task counts from its creation
// date, or from its earliest check if that is older, so retroactively entered data always shows.
function statsData() {
  const g = state.settings.statsGran, N = RANGE_OPTS[g][state.settings.statsRange];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayIso = isoDate(today);
  const last = shiftBucket(bucketStart(today, g), g, -ui.statsOffset * N);
  const starts = Array.from({ length: N }, (_, i) => shiftBucket(last, g, i - (N - 1)));
  const pct = state.settings.statsMode === 'pct';
  const from = new Map(state.daily.tasks.map((t) => {
    const first = Object.keys(state.daily.checks[t.id] || {}).sort()[0];
    return [t.id, first && first < (t.created || '9') ? first : t.created || todayIso];
  }));
  const calc = (tasks, a, b) => {
    let c = 0, p = 0;
    for (const t of tasks) {
      const checks = state.daily.checks[t.id] || {}, start = from.get(t.id);
      for (const d = new Date(a); d < b; d.setDate(d.getDate() + 1)) {
        const iso = isoDate(d);
        if (iso < start || !t.days[d.getDay()]) continue;
        const on = !!checks[iso];
        if (iso > todayIso && !on) continue;
        p++; if (on) c++;
      }
    }
    return p ? { c, p, v: pct ? (c / p) * 100 : c } : null;
  };
  const tasks = state.daily.tasks;
  const span = (i) => [starts[i], shiftBucket(starts[i], g, 1)];
  return {
    g, weeks: starts, labels: starts.map((d) => bucketLabel(d, g)), pct,
    series: tasks.map((t) => ({ task: t, pts: starts.map((_, i) => calc([t], ...span(i))) })),
    all: starts.map((_, i) => calc(tasks, ...span(i))),
  };
}

function linePath(pts, mode) {
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]}h.01`;
  const f = (n) => Math.round(n * 100) / 100;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  if (mode === 'linear') { for (const p of pts.slice(1)) d += `L${f(p[0])} ${f(p[1])}`; return d; }
  const slope = pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    // flatten at local extremes so curves never overshoot the data
    if (i && i < pts.length - 1 && (a[1] - p[1]) * (b[1] - p[1]) >= 0) return 0;
    return (b[1] - a[1]) / (b[0] - a[0]);
  });
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = x1 - x0;
    if (mode === 'cubic') d += `C${f(x0 + dx / 3)} ${f(y0 + (slope[i] * dx) / 3)} ${f(x1 - dx / 3)} ${f(y1 - (slope[i + 1] * dx) / 3)} ${f(x1)} ${f(y1)}`;
    else d += `Q${f((x0 + x1) / 2)} ${f((y0 + slope[i] * dx / 2 + y1 - slope[i + 1] * dx / 2) / 2)} ${f(x1)} ${f(y1)}`;
  }
  return d;
}

function todoAvgStrip() {
  const avg = (tasks) => {
    const ds = tasks.filter((t) => t.completed).map((t) => (new Date(t.completed) - new Date(t.created)) / 864e5);
    return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
  };
  const fmt = (v) => (v == null ? '–' : `${Math.round(v * 10) / 10}d`);
  const chip = (label, v, color) => h('div', { class: 'tchip', title: `Average days to complete: ${label}`, vars: color ? { '--c': color } : {} }, h('span', {}, label), h('b', {}, fmt(v)));
  return h('div', { class: 'tstats' },
    h('span', { class: 'tlabel' }, 'Todo · avg days to finish'),
    chip('All', avg(state.todo.cats.flatMap((c) => c.tasks))),
    state.todo.cats.map((c) => chip(c.name, avg(c.tasks), c.color)));
}

function renderStats() {
  const root = $('#stats');
  const st = state.settings;
  if (ui.statsLock && !state.daily.tasks.some((t) => t.id === ui.statsLock)) ui.statsLock = null;
  ui.statsHover = null;
  const chart = h('div', { class: 'chart' });
  const mode = st.statsMode === 'pct';
  const legend = h('div', { class: 'sc-legend' }, state.daily.tasks.map((t) => h('button', {
    class: `lg ${ui.statsLock === t.id ? 'lock' : ''}`, vars: { '--c': t.color, '--on': textOn(t.color) }, title: t.name, 'data-id': t.id,
    onmouseenter: () => { ui.statsHover = t.id; styleLines(); },
    onmouseleave: () => { ui.statsHover = null; styleLines(); },
    onclick: () => {
      ui.statsLock = ui.statsLock === t.id ? null : t.id;
      legend.querySelectorAll('.lg').forEach((b) => b.classList.toggle('lock', b.dataset.id === ui.statsLock));
      drawChart(chart);
    },
  }, t.name)));
  const arrow = (dir) => h('button', {
    class: 'ib big', title: dir < 0 ? 'Earlier' : 'Later', html: dir < 0 ? ICON.left : ICON.right,
    onclick: () => { ui.statsOffset -= dir; renderStats(); },
  });
  const track = h('button', { class: `track ${mode ? '' : 'on'}`, role: 'switch', 'aria-label': 'Percentage or raw count', onclick: () => setSetting('statsMode', mode ? 'raw' : 'pct') });
  const unit = st.statsGran[0];
  root.replaceChildren(
    h('div', { class: 'stats-card' },
      h('div', { class: 'sc-head' },
        h('div', { class: 'seg' }, GRANS.map(([g, l]) => h('button', { class: g === st.statsGran ? 'sel' : '', onclick: () => { st.statsGran = g; ui.statsOffset = 0; save(); renderStats(); } }, l))),
        h('div', { class: 'seg' }, RANGE_OPTS[st.statsGran].map((n, i) => h('button', { class: i === st.statsRange ? 'sel' : '', title: `Show ${n} points`, onclick: () => { st.statsRange = i; ui.statsOffset = 0; save(); renderStats(); } }, `${n}${unit}`))),
        h('button', { class: 'today-btn', style: { visibility: ui.statsOffset ? 'visible' : 'hidden' }, onclick: () => { ui.statsOffset = 0; renderStats(); } }, 'Today'),
        h('div', { class: 'sw' }, h('span', { class: `opt ${mode ? 'cur' : ''}` }, 'Percent'), track, h('span', { class: `opt ${mode ? '' : 'cur'}` }, 'Count'))),
      h('div', { class: 'sc-chart' }, arrow(-1), chart, arrow(1)),
      legend),
    todoAvgStrip());
  ui.statsRO?.disconnect();
  ui.statsRO = new ResizeObserver(() => drawChart(chart));
  ui.statsRO.observe(chart);
}

function styleLines() {
  const focus = ui.statsLock || ui.statsHover;
  const root = $('#stats');
  let top = null;
  root.querySelectorAll('.ln').forEach((p) => {
    const hot = focus ? p.dataset.id === focus : p.dataset.id === 'all';
    p.style.opacity = hot ? 1 : focus ? 0.1 : 0.34;
    p.style.strokeWidth = hot ? 3.5 : 2;
    if (hot && focus) top = p;
  });
  if (top) top.parentNode.append(top);
  root.querySelectorAll('.lg').forEach((b) => b.classList.toggle('dim', !!focus && b.dataset.id !== focus));
}

function drawChart(el) {
  const W = el.clientWidth, H = el.clientHeight;
  if (W < 50 || H < 50) return;
  const d = statsData();
  const M = { l: 46, r: 18, t: 14, b: 44 };
  const pw = W - M.l - M.r, ph = H - M.t - M.b, N = d.weeks.length;
  const vals = [...d.all, ...d.series.flatMap((s) => s.pts)].filter(Boolean).map((p) => p.v);
  let ymax = 100, step = 25;
  if (!d.pct) {
    const mx = Math.max(1, ...vals);
    step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => mx / s <= 4) || 1000;
    ymax = Math.ceil(mx / step) * step;
  }
  const X = (i) => (N === 1 ? M.l + pw / 2 : M.l + (i * pw) / (N - 1));
  const Y = (v) => M.t + ph * (1 - v / ymax);
  const every = Math.ceil(N / Math.max(1, Math.floor(pw / 62)));

  const axis = svg('g', { class: 'axis' });
  for (let v = 0; v <= ymax + 1e-9; v += step) {
    axis.append(
      svg('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), class: 'grid' }),
      Object.assign(svg('text', { x: M.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }), { textContent: d.pct ? `${v}%` : v }));
  }
  d.weeks.forEach((w, i) => {
    if ((N - 1 - i) % every) return;
    axis.append(Object.assign(svg('text', { x: X(i), y: H - M.b + 18, 'text-anchor': 'middle' }), { textContent: d.labels[i] }));
  });
  axis.append(Object.assign(svg('text', { x: M.l + pw / 2, y: H - 6, 'text-anchor': 'middle', class: 'cap' }), { textContent: CAPTION[d.g] }));

  const gid = 'g' + uid();
  const grad = svg('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: M.l, x2: W - M.r, y1: 0, y2: 0 },
    LINE_STOPS.map((c, i) => svg('stop', { offset: `${(i / (LINE_STOPS.length - 1)) * 100}%`, 'stop-color': c })));
  const clip = svg('clipPath', { id: gid + 'c' }, svg('rect', { x: M.l - 6, y: M.t - 6, width: pw + 12, height: ph + 12 }));
  const lines = svg('g', { 'clip-path': `url(#${gid}c)` });
  const mk = (id, pts, stroke) => {
    const runs = []; let cur = [];
    pts.forEach((p, i) => { if (p) cur.push([X(i), Y(p.v)]); else if (cur.length) { runs.push(cur); cur = []; } });
    if (cur.length) runs.push(cur);
    const g = svg('g', { class: 'ln', 'data-id': id, stroke, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      runs.map((r) => svg('path', { d: linePath(r, state.settings.interp), stroke })));
    return g;
  };
  d.series.forEach((s) => lines.append(mk(s.task.id, s.pts, shade(s.task.color, 0.2))));
  lines.append(mk('all', d.all, `url(#${gid})`));

  const sv = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, svg('defs', {}, grad, clip), axis, lines);
  // locked line: hoverable points
  const tip = h('div', { class: 'tip', hidden: true });
  const lock = ui.statsLock && d.series.find((s) => s.task.id === ui.statsLock);
  if (lock) {
    const color = shade(lock.task.color, 0.2);
    lock.pts.forEach((p, i) => {
      if (!p) return;
      const dot = svg('circle', { cx: X(i), cy: Y(p.v), r: 4.5, fill: color, stroke: '#fff', 'stroke-width': 1.5, class: 'pt' });
      const hit = svg('circle', { cx: X(i), cy: Y(p.v), r: 11, fill: 'transparent' });
      hit.addEventListener('mouseenter', () => {
        tip.textContent = `${d.labels[i]}: ${d.pct ? `${Math.round(p.v)}%` : `${p.c} of ${p.p}`}`;
        tip.hidden = false;
        tip.style.left = `${Math.min(Math.max(X(i), 70), W - 70)}px`; tip.style.top = `${Y(p.v) - 12}px`;
        dot.setAttribute('r', 6.5);
      });
      hit.addEventListener('mouseleave', () => { tip.hidden = true; dot.setAttribute('r', 4.5); });
      sv.append(dot, hit);
    });
  }
  el.replaceChildren(sv, tip);
  if (!state.daily.tasks.length) el.append(h('div', { class: 'chart-empty' }, 'Add tasks in Daily to see stats'));
  styleLines();
}

/* ================= shell ================= */
const VIEWS = ['daily', 'todo', 'stats'];
const LABEL = { daily: 'Daily', todo: 'Todo', stats: 'Stats' };
function switchView(v) {
  if (ui.editor) commitEditor();
  ui.view = v;
  syncShell();
}
function syncShell() {
  document.body.dataset.switcher = state.settings.switcher;
  const at = VIEWS.indexOf(ui.view);
  VIEWS.forEach((v, i) => {
    const el = $(`#${v}`);
    el.classList.toggle('active', i === at);
    el.dataset.rel = Math.sign(i - at);
  });
  $('#tabs').replaceChildren(...VIEWS.map((v) => h('button', { class: ui.view === v ? 'on' : '', onclick: () => switchView(v) }, LABEL[v])));
  $('#title').textContent = LABEL[ui.view];
  const prev = VIEWS[(at + VIEWS.length - 1) % VIEWS.length], next = VIEWS[(at + 1) % VIEWS.length];
  $('#arrow-l').replaceChildren(h('div', { class: 'pill' }, h('span', { html: ICON.left }), h('span', {}, LABEL[prev])));
  $('#arrow-r').replaceChildren(h('div', { class: 'pill' }, h('span', { html: ICON.right }), h('span', {}, LABEL[next])));
  $('#arrow-l').onclick = () => switchView(prev);
  $('#arrow-r').onclick = () => switchView(next);
}
function applySettings() { syncShell(); applyBackground(); }

function render() {
  renderDaily();
  renderTodo();
  renderStats();
  syncShell();
  const i = ui.editor && $('input.ed');
  if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

buildPop();
$('#gear').innerHTML = ICON.gear;
$('#gear').addEventListener('click', togglePop);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.popOpen) closePop(); });
applyBackground();
render();
