'use strict';

/* ================= constants ================= */
const STORE_KEY = 'tasks-app-v1';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Muted take on the 16 HTML colors (black/gray/silver/white become slate tones).
const COLORS = [
  '#a8636a', '#d17f7a', '#8b6a9e', '#c488b5', '#6f9a74', '#a3c27a', '#a39b5e', '#dcc874',
  '#5f6f9e', '#7a9bd0', '#5f9a9a', '#86c4c8', '#4a4f57', '#7d838c', '#b3b8bf', '#d9d6cf',
];
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
  settings: { open: 'daily', weekStart: 'mon', disableWeekends: false, switcher: 'tabs' },
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

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function fmtDate(v) {
  const d = new Date(v);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.68 ? '#26282c' : '#ffffff';
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
      : plusButton('large', 'Add task', () => openEditor({ kind: 'daily', id: 'new', draft: { name: '', days: Array(7).fill(false) }, apply(name) {
        state.daily.tasks.push({ id: uid(), name, days: this.draft.days.slice() });
      } })));

  root.replaceChildren(
    h('div', { class: 'wk' },
      h('button', { class: 'ib big', title: 'Previous week', html: ICON.left, onclick: () => { ui.weekOffset--; render(); } }),
      h('span', { class: 'lbl' }, range),
      h('button', { class: 'ib big', title: 'Next week', html: ICON.right, onclick: () => { ui.weekOffset++; render(); } }),
      ui.weekOffset ? h('button', { class: 'today-btn', onclick: () => { ui.weekOffset = 0; render(); } }, 'This week') : null),
    grid);
}

function dailyRow(t, cols) {
  const checks = state.daily.checks[t.id] || {};
  const name = h('div', {
    class: 'dname',
    onclick: (e) => {
      if (e.target.closest('button')) return;
      openEditor({ kind: 'daily', id: t.id, draft: { name: t.name, days: t.days.slice() }, apply(n) { t.name = n; t.days = this.draft.days.slice(); } });
    },
  },
  h('span', { class: 'ttl', html: renderText(t.name) }),
  actions(() => {
    const i = state.daily.tasks.indexOf(t);
    state.daily.tasks.splice(i + 1, 0, { id: uid(), name: t.name, days: t.days.slice() });
    save(); render();
  }, () => {
    state.daily.tasks = state.daily.tasks.filter((x) => x !== t);
    delete state.daily.checks[t.id];
    save(); render();
  }));
  return h('div', { class: 'drow' }, name, cols.map((c) => {
    if (!t.days[c.dow]) return h('div', { class: 'dcell' });
    const off = state.settings.disableWeekends && (c.dow === 0 || c.dow === 6);
    const box = checkbox(!!checks[c.iso], () => {
      const m = (state.daily.checks[t.id] ||= {});
      if (m[c.iso]) delete m[c.iso]; else m[c.iso] = true;
      box.classList.toggle('on', !!m[c.iso]);
      box.setAttribute('aria-pressed', String(!!m[c.iso]));
      save();
    }, off ? 'dis' : '');
    if (off) box.disabled = true;
    return h('div', { class: 'dcell' }, box);
  }));
}

function dailyEditorRow(cols) {
  const ed = ui.editor;
  const input = editorInput(ed.draft);
  const row = h('div', { class: 'drow editor' },
    h('div', { class: 'dname' }, input),
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
  const ids = new Set(todo.cats.map((c) => c.id));
  const seen = new Set();
  const prune = (n) => {
    if (!n) return null;
    if (n.cat) return ids.has(n.cat) && !seen.has(n.cat) && seen.add(n.cat) ? n : null;
    const kids = [], ws = [];
    n.kids.forEach((k, i) => { const r = prune(k); if (r) { kids.push(r); ws.push(n.ws[i] || 1); } });
    if (!kids.length) return null;
    if (kids.length === 1) return kids[0];
    return { dir: n.dir, kids, ws };
  };
  todo.layout = prune(todo.layout);
  for (const c of todo.cats) if (!seen.has(c.id)) appendLeaf(todo, c.id);
}
function appendLeaf(todo, id) {
  const leaf = { cat: id }, t = todo.layout;
  if (!t) todo.layout = leaf;
  else if (t.dir === 'row') { t.ws.push(t.ws.reduce((a, b) => a + b, 0) / t.ws.length); t.kids.push(leaf); }
  else todo.layout = { dir: 'row', kids: [t, leaf], ws: [1, 1] };
}
function removeLeaf(n, id) {
  if (!n) return null;
  if (n.cat) return n.cat === id ? null : n;
  const kids = [], ws = [];
  n.kids.forEach((k, i) => { const r = removeLeaf(k, id); if (r) { kids.push(r); ws.push(n.ws[i]); } });
  if (!kids.length) return null;
  if (kids.length === 1) return kids[0];
  n.kids = kids; n.ws = ws;
  return n;
}
// Split the tile holding `target` and put `id` on the given side.
function insertAt(root, target, id, zone) {
  const dir = zone === 'left' || zone === 'right' ? 'row' : 'col';
  const before = zone === 'left' || zone === 'top';
  const leaf = { cat: id };
  let done = false;
  const rec = (n, parent, idx) => {
    if (n.cat) {
      if (n.cat !== target) return n;
      done = true;
      if (parent && parent.dir === dir) {
        const w = parent.ws[idx] / 2;
        parent.ws[idx] = w;
        const at = before ? idx : idx + 1;
        parent.kids.splice(at, 0, leaf); parent.ws.splice(at, 0, w);
        return n;
      }
      return { dir, kids: before ? [leaf, n] : [n, leaf], ws: [1, 1] };
    }
    for (let i = 0; i < n.kids.length && !done; i++) n.kids[i] = rec(n.kids[i], n, i);
    return n;
  };
  return rec(root, null, 0);
}
function swapLeaves(n, a, b) {
  if (n.cat) { if (n.cat === a) n.cat = b; else if (n.cat === b) n.cat = a; return; }
  n.kids.forEach((k) => swapLeaves(k, a, b));
}

function renderTodo() {
  const root = $('#todo');
  const { cats, layout } = state.todo;
  if (!cats.length) {
    root.replaceChildren(h('div', { class: 'empty' }, h('button', { class: 'sq huge', title: 'New category', 'aria-label': 'New category', html: ICON.plus, onclick: () => catModal() })));
    return;
  }
  const board = h('div', { class: 'board' }, renderNode(layout));
  board.addEventListener('dragleave', (e) => { if (!board.contains(e.relatedTarget)) hideOverlay(); });
  ui.board = board;
  root.replaceChildren(
    h('div', { class: 'todo-bar' }, h('button', { class: 'sq', title: 'New category', 'aria-label': 'New category', html: ICON.plus, onclick: () => catModal() })),
    board);
}

function renderNode(n) {
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

function dropZone(e, el) {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  if (x > 0.3 && x < 0.7 && y > 0.3 && y < 0.7) return 'swap';
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

  el.addEventListener('dragover', (e) => {
    if (!ui.drag || ui.drag === cat.id) return;
    e.preventDefault();
    showOverlay(el, dropZone(e, el));
  });
  el.addEventListener('drop', (e) => {
    if (!ui.drag || ui.drag === cat.id) return;
    e.preventDefault();
    const zone = dropZone(e, el), id = ui.drag;
    ui.drag = null; hideOverlay();
    if (zone === 'swap') swapLeaves(state.todo.layout, id, cat.id);
    else {
      state.todo.layout = removeLeaf(state.todo.layout, id);
      state.todo.layout = insertAt(state.todo.layout, cat.id, id, zone);
    }
    save(); render();
  });

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
      appendLeaf(state.todo, c.id);
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
  { key: 'disableWeekends', title: 'Disable tasks on weekends', a: ['Off', false], b: ['On', true] },
  { key: 'switcher', title: 'Window switcher', a: ['Tabs', 'tabs'], b: ['Arrows', 'arrows'] },
];
function setSetting(key, value) {
  state.settings[key] = value;
  save(); applySettings(); render();
  if (ui.popOpen) fillPop();
}
function fillPop() {
  $('#pop').replaceChildren(
    ...SETTINGS.map((s) => {
      const isB = state.settings[s.key] === s.b[1];
      const track = h('button', { class: `track ${isB ? 'on' : ''}`, role: 'switch', 'aria-checked': String(isB), 'aria-label': s.title, onclick: () => setSetting(s.key, isB ? s.a[1] : s.b[1]) });
      return h('div', { class: 'srow' },
        h('span', { class: 'sl' }, s.title),
        h('div', { class: 'sw' },
          h('span', { class: `opt ${isB ? '' : 'cur'}`, onclick: () => setSetting(s.key, s.a[1]) }, s.a[0]),
          track,
          h('span', { class: `opt ${isB ? 'cur' : ''}`, onclick: () => setSetting(s.key, s.b[1]) }, s.b[0])));
    }),
    h('div', { class: 'note' }, 'Task names support Markdown (**bold**, *italic*, `code`) and LaTeX ($x^2$).'));
}
function closePop() { ui.popOpen = false; $('#pop').hidden = true; }
function togglePop() {
  ui.popOpen = !ui.popOpen;
  $('#pop').hidden = !ui.popOpen;
  if (ui.popOpen) fillPop();
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
function applySettings() { syncShell(); }

function render() {
  renderDaily();
  renderTodo();
  syncShell();
  const i = ui.editor && $('input.ed');
  if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

$('#gear').innerHTML = ICON.gear;
$('#gear').addEventListener('click', togglePop);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.popOpen) closePop(); });
render();
