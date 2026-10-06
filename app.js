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
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
};

/* ================= state ================= */
const DEFAULTS = () => ({
  settings: { open: 'daily', weekStart: 'mon', allDays: false, switcher: 'tabs', bg: { type: 'default' } },
  daily: { tasks: [], checks: {} },
  todo: { cats: [], layout: null },
});

let state = load();
const ui = {
  view: state.settings.open,
  weekOffset: 0,
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
  d.daily.tasks.forEach((t, i) => { if (!t.color) t.color = pickTaskColor(d.daily.tasks, i); });
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
function commitEditor() {
  const ed = ui.editor;
  if (!ed) return;
  ui.editor = null;
  const name = ed.draft.name.trim();
  if (name) { ed.apply(name); save(); }
  render();
}
function cancelEditor() { ui.editor = null; render(); }

function editorInput(draft) {
  const i = h('input', { class: 'ed', type: 'text', value: draft.name, placeholder: 'Task name', spellcheck: 'false', maxlength: '200' });
  i.addEventListener('input', () => { draft.name = i.value; });
  i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEditor(); }
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
      : plusButton('large', 'Add task', () => openEditor({ kind: 'daily', id: 'new', draft: { name: '', days: Array(7).fill(state.settings.allDays), color: pickTaskColor(state.daily.tasks, state.daily.tasks.length) }, apply(name) {
        state.daily.tasks.push({ id: uid(), name, days: this.draft.days.slice(), color: this.draft.color });
      } })));

  root.replaceChildren(
    h('div', { class: 'wk' },
      h('div', { class: 'wk-main' },
        h('button', { class: 'ib big', title: 'Previous week', html: ICON.left, onclick: () => { ui.weekOffset--; render(); } }),
        h('span', { class: 'lbl' }, range),
        h('button', { class: 'ib big', title: 'Next week', html: ICON.right, onclick: () => { ui.weekOffset++; render(); } })),
      h('button', { class: 'today-btn', style: { visibility: ui.weekOffset ? 'visible' : 'hidden' }, onclick: () => { ui.weekOffset = 0; render(); } }, 'This week')),
    grid);
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
    const copy = { id: uid(), name: t.name, days: t.days.slice(), color: t.color };
    state.daily.tasks.splice(i + 1, 0, copy);
    copy.color = pickTaskColor(state.daily.tasks, i + 1);
    save(); render();
  }, () => {
    state.daily.tasks = state.daily.tasks.filter((x) => x !== t);
    delete state.daily.checks[t.id];
    save(); render();
  }));
  return h('div', { class: 'drow task', vars: { '--c': t.color, '--on': textOn(t.color) } }, name, cols.map((c) => {
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
      : plusButton('small', 'Add task', () => openEditor({ kind: 'todo', id: 'new', cat: cat.id, draft: { name: '', done: false }, apply(name) {
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
  { key: 'open', title: 'Open at', a: ['Daily', 'daily'], b: ['Todo', 'todo'] },
  { key: 'weekStart', title: 'Week starts on', a: ['Monday', 'mon'], b: ['Sunday', 'sun'] },
  { key: 'allDays', title: 'Enable all days for new tasks', a: ['No', false], b: ['Yes', true] },
  { key: 'switcher', title: 'Window switcher', a: ['Tabs', 'tabs'], b: ['Arrows', 'arrows'] },
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
    const isB = state.settings[s.key] === s.b[1];
    const row = $(`#pop [data-key="${s.key}"]`);
    row.querySelector('.track').classList.toggle('on', isB);
    row.querySelector('.track').setAttribute('aria-checked', String(isB));
    row.querySelectorAll('.opt')[0].classList.toggle('cur', !isB);
    row.querySelectorAll('.opt')[1].classList.toggle('cur', isB);
  }
  const bg = state.settings.bg;
  $('#pop .bgrow').replaceChildren(...[
    ['Default', 'default', () => setBackground({ type: 'default' }), 'Biodome'],
    ['Image', 'file', async () => {
      const url = await window.api?.chooseBackground();
      if (url) setBackground({ type: 'file', value: `${url}?t=${Date.now()}` });
    }, 'Image…'],
    ['Black', 'black', () => setBackground({ type: 'color', value: '#000000' })],
    ['White', 'white', () => setBackground({ type: 'color', value: '#ffffff' })],
    ['Color', 'pick', () => { ui.bgPicker = !ui.bgPicker; syncPop(); }, 'Color…'],
  ].map(([title, kind, fn, text]) => {
    const on = (kind === 'default' && bg.type === 'default') || (kind === 'file' && bg.type === 'file')
      || (kind === 'black' && bg.value === '#000000') || (kind === 'white' && bg.value === '#ffffff')
      || (kind === 'pick' && bg.type === 'color' && !['#000000', '#ffffff'].includes(bg.value));
    return h('button', { class: `bgbtn ${kind} ${on ? 'sel' : ''}`, title, onclick: fn, vars: kind === 'pick' && on ? { '--c': bg.value } : {} }, text || '');
  }));
  $('#pop .bgcols').hidden = !ui.bgPicker;
  $('#pop .bgcols').replaceChildren(...BG_COLORS.map((c) => h('button', {
    class: `swatch ${bg.value === c ? 'sel' : ''}`, vars: { '--c': c }, title: c,
    onclick: () => setBackground({ type: 'color', value: c }),
  })));
}
function buildPop() {
  $('#pop').replaceChildren(
    ...SETTINGS.map((s) => h('div', { class: 'srow', 'data-key': s.key },
      h('span', { class: 'sl' }, s.title),
      h('div', { class: 'sw' },
        h('span', { class: 'opt', onclick: () => setSetting(s.key, s.a[1]) }, s.a[0]),
        h('button', { class: 'track', role: 'switch', 'aria-label': s.title, onclick: () => setSetting(s.key, state.settings[s.key] === s.b[1] ? s.a[1] : s.b[1]) }),
        h('span', { class: 'opt', onclick: () => setSetting(s.key, s.b[1]) }, s.b[0])))),
    h('div', { class: 'srow col' }, h('span', { class: 'sl' }, 'Background'), h('div', { class: 'bgrow' }), h('div', { class: 'bgcols', hidden: true })),
    h('div', { class: 'note' }, 'Task names support Markdown (**bold**, *italic*, `code`) and LaTeX ($x^2$).'));
  syncPop();
}
function closePop() { ui.popOpen = false; $('#pop').hidden = true; }
function togglePop() {
  ui.popOpen = !ui.popOpen;
  $('#pop').hidden = !ui.popOpen;
  if (ui.popOpen) syncPop();
}

/* ================= shell ================= */
const VIEWS = ['daily', 'todo'];
const LABEL = { daily: 'Daily', todo: 'Todo' };
function switchView(v) {
  if (ui.editor) commitEditor();
  ui.view = v;
  syncShell();
}
function syncShell() {
  document.body.dataset.switcher = state.settings.switcher;
  for (const v of VIEWS) $(`#${v}`).classList.toggle('active', ui.view === v);
  $('#tabs').replaceChildren(...VIEWS.map((v) => h('button', { class: ui.view === v ? 'on' : '', onclick: () => switchView(v) }, LABEL[v])));
  $('#title').textContent = LABEL[ui.view];
  const other = ui.view === 'daily' ? 'todo' : 'daily';
  const l = $('#arrow-l'), r = $('#arrow-r');
  l.hidden = ui.view !== 'todo'; r.hidden = ui.view !== 'daily';
  l.replaceChildren(h('span', { html: ICON.left }), h('span', {}, LABEL[other]));
  r.replaceChildren(h('span', { html: ICON.right }), h('span', {}, LABEL[other]));
  l.onclick = r.onclick = () => switchView(other);
}
function applySettings() { syncShell(); applyBackground(); }

function render() {
  renderDaily();
  renderTodo();
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
