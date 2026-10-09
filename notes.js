'use strict';
/* ================= NOTES =================
   state.notes = { items:[{id,title,folder,body,updated}], folders:[{id,name,parent,open}], sel, mode, seeded }
   Markdown + [[wikilinks]] + live values like {{daily:Gym|week}} that read the other windows. */

const noteUI = { q: '', drag: null, renaming: null, menu: null, period: 'week', timer: null };
const NOTE_MODES = [['edit', 'Edit'], ['split', 'Split'], ['view', 'Preview']];
const PERIODS = ['today', 'week', 'month', 'year', 'all'];

/* ---------- data helpers ---------- */
const noteById = (id) => state.notes.items.find((n) => n.id === id);
const noteByTitle = (t) => state.notes.items.find((n) => n.title.toLowerCase() === String(t).trim().toLowerCase());
const folderById = (id) => state.notes.folders.find((f) => f.id === id);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function uniqueTitle(base, ignoreId) {
  let t = base, i = 2;
  while (state.notes.items.some((n) => n.id !== ignoreId && n.title.toLowerCase() === t.toLowerCase())) t = `${base} ${i++}`;
  return t;
}
// runs while the app state loads, before app.js helpers like uid() exist
const seedId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
function seedNotes(notes) {
  if (notes.seeded || notes.items.length) { notes.seeded = true; return; }
  notes.seeded = true;
  const now = Date.now();
  notes.items.push(
    { id: seedId(), title: 'Welcome', folder: null, updated: now, body: `# Welcome\n\nThis is a small markdown notebook. Make folders, drag notes into them, and link notes together with wikilinks like [[Ideas]] (click it to create the note).\n\n## Formatting\n\n- **bold**, *italic*, ~~strike~~, \`code\`, and [links](https://example.com)\n- math: $E = mc^2$\n- [ ] checkboxes you can click in Preview\n\n## Live values\n\nThese pull from your other windows and update automatically. Use the **Live** button to insert more.\n\n- Today's diet: {{diet:today}}\n- Todo overview: {{todo:*}}\n- Daily tasks this week: {{daily:*|week}}\n` },
    { id: seedId(), title: 'Ideas', folder: null, updated: now, body: '# Ideas\n\nBack to [[Welcome]].\n' });
}

function addNote(folder, title = 'Untitled', body = '') {
  const n = { id: uid(), title: uniqueTitle(title), folder: folder || null, body, updated: Date.now() };
  state.notes.items.push(n);
  state.notes.sel = n.id;
  state.notes.mode = 'edit';
  if (folder) { const f = folderById(folder); if (f) f.open = true; }
  save(); render();
  setTimeout(() => $('#notes .n-edit')?.focus(), 0);
  return n;
}
function addFolder(parent) {
  const f = { id: uid(), name: 'New folder', parent: parent || null, open: true };
  state.notes.folders.push(f);
  if (parent) folderById(parent).open = true;
  noteUI.renaming = f.id;
  save(); render();
}
function folderDescendants(id) {
  const out = [id];
  for (const f of state.notes.folders) if (f.parent === id) out.push(...folderDescendants(f.id));
  return out;
}
function deleteNote(id) {
  const n = noteById(id);
  if (n.body.trim() && !confirm(`Delete "${n.title}"?`)) return;
  state.notes.items = state.notes.items.filter((x) => x.id !== id);
  if (state.notes.sel === id) state.notes.sel = null;
  save(); render();
}
function deleteFolder(id) {
  const ids = folderDescendants(id), inside = state.notes.items.filter((n) => ids.includes(n.folder));
  if (inside.length && !confirm(`Delete this folder and its ${inside.length} note(s)?`)) return;
  state.notes.folders = state.notes.folders.filter((f) => !ids.includes(f.id));
  state.notes.items = state.notes.items.filter((n) => !ids.includes(n.folder));
  if (!noteById(state.notes.sel)) state.notes.sel = null;
  save(); render();
}
function renameNote(n, title) {
  title = title.trim();
  if (!title || title === n.title) return;
  const old = n.title;
  n.title = uniqueTitle(title, n.id);
  // keep links in other notes pointing at the renamed note
  const re = new RegExp(`\\[\\[\\s*${escRe(old)}\\s*(\\||\\]\\])`, 'gi');
  for (const o of state.notes.items) if (o.id !== n.id) o.body = o.body.replace(re, `[[${n.title}$1`);
  save(); render();
}
function openNoteByTitle(title) {
  const n = noteByTitle(title);
  if (n) { state.notes.sel = n.id; save(); render(); return; }
  const cur = noteById(state.notes.sel);
  addNote(cur ? cur.folder : null, title.trim());
}
function backlinks(n) {
  const re = new RegExp(`\\[\\[\\s*${escRe(n.title)}\\s*(\\||\\]\\])`, 'i');
  return state.notes.items.filter((o) => o.id !== n.id && re.test(o.body));
}

/* ---------- live values ---------- */
function periodRange(period) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (period === 'today') return [today, tomorrow];
  if (period === 'all') return [new Date(2000, 0, 1), tomorrow];
  const g = period === 'month' ? 'month' : period === 'year' ? 'year' : 'week';
  const a = bucketStart(today, g);
  return [a, shiftBucket(a, g, 1)];
}
function liveChip(kind, raw) {
  const [name = '', opt = ''] = raw.split('|').map((s) => s.trim());
  const all = name === '*' || /^all$/i.test(name);
  const chip = (text, color, title) => `<span class="chip" style="${color ? `--c:${color}` : ''}" title="${esc(title || '')}">${esc(text)}</span>`;
  const miss = (what) => `<span class="chip miss" title="Not found">${esc(what)}?</span>`;
  if (kind === 'daily') {
    const tasks = all ? state.daily.tasks : state.daily.tasks.filter((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!tasks.length) return miss(name || 'daily');
    const period = PERIODS.includes(opt.toLowerCase()) ? opt.toLowerCase() : 'week';
    const r = completionOf(tasks, ...periodRange(period));
    const label = all ? 'All daily tasks' : tasks[0].name;
    return chip(`${label}: ${r ? `${Math.round((r.c / r.p) * 100)}% (${r.c}/${r.p})` : 'no data'} · ${period}`, all ? '' : tasks[0].color, 'Daily completion');
  }
  if (kind === 'todo') {
    const cats = all ? state.todo.cats : state.todo.cats.filter((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!cats.length) return miss(name || 'todo');
    const tasks = cats.flatMap((c) => c.tasks), done = tasks.filter((t) => t.done);
    const over = tasks.filter((t) => !t.done && t.deadline && t.deadline < isoDate(new Date())).length;
    const days = done.length ? done.reduce((s, t) => s + (new Date(t.completed) - new Date(t.created)) / 864e5, 0) / done.length : null;
    const bits = [`${done.length}/${tasks.length} done`];
    if (days != null) bits.push(`avg ${Math.round(days * 10) / 10}d`);
    if (over) bits.push(`${over} overdue`);
    return chip(`${all ? 'Todo' : cats[0].name}: ${bits.join(' · ')}`, all ? '' : cats[0].color, 'Todo progress');
  }
  // diet
  const key = name.toLowerCase() || 'today';
  const day = (off) => isoDate(new Date(Date.now() + off * 864e5));
  if (key === 'week') {
    const days = Array.from({ length: 7 }, (_, i) => dayTotals(day(-i)));
    const avg = (f) => Math.round(days.reduce((s, d) => s + d[f], 0) / 7);
    return chip(`Diet, 7-day avg: ${avg('k')} kcal · P ${avg('p')} · C ${avg('c')} · F ${avg('f')}`, '', 'Diet');
  }
  const date = key === 'today' ? day(0) : key === 'yesterday' ? day(-1) : /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
  if (!date) return miss(name);
  const t = dayTotals(date), g = activeGoal();
  return chip(`Diet ${key === 'today' || key === 'yesterday' ? key : date}: ${Math.round(t.k)}/${g.k} kcal · P ${Math.round(t.p)} · C ${Math.round(t.c)} · F ${Math.round(t.f)}`, '', 'Diet');
}

/* ---------- markdown ---------- */
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
function renderMarkdown(src) {
  const lines = src.replace(/\r/g, '').replace(/\t/g, '  ').split('\n');
  const inl = (t) => renderText(t, { notes: true });
  const out = [];
  const startsBlock = (l) => /^(#{1,6}\s|```|>\s?)/.test(l) || LIST_RE.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    let m;
    if (/^```/.test(ln)) {
      const code = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
    } else if (!ln.trim()) i++;
    else if ((m = ln.match(/^(#{1,6})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`); i++; }
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(ln)) { out.push('<hr>'); i++; }
    else if (/^>\s?/.test(ln)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(q.join('\n'))}</blockquote>`);
    } else if (LIST_RE.test(ln)) {
      let html = '';
      const stack = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const [, ind, bullet, text] = lines[i].match(LIST_RE), lvl = Math.floor(ind.length / 2), tag = /\d/.test(bullet) ? 'ol' : 'ul';
        while (stack.length && stack.at(-1).lvl > lvl) html += `</li></${stack.pop().tag}>`;
        if (stack.length && stack.at(-1).lvl === lvl) html += '</li>';
        else { html += `<${tag}>`; stack.push({ tag, lvl }); }
        const task = text.match(/^\[([ xX])\]\s+(.*)$/);
        html += task
          ? `<li class="task"><input type="checkbox" data-line="${i}" ${task[1] === ' ' ? '' : 'checked'}> ${inl(task[2])}`
          : `<li>${inl(text)}`;
        i++;
      }
      while (stack.length) html += `</li></${stack.pop().tag}>`;
      out.push(html);
    } else if (ln.includes('|') && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1] || '')) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inl(c.trim()));
      const head = cells(ln); i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines[i]))) para.push(inl(lines[i++]));
      out.push(`<p>${para.join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

/* ---------- view ---------- */
function renderNotes() {
  const S = state.notes;
  const side = h('aside', { class: 'n-side' },
    h('div', { class: 'n-tools' },
      h('input', { class: 'n-search', type: 'search', placeholder: 'Search notes', value: noteUI.q, spellcheck: 'false',
        oninput: (e) => { noteUI.q = e.target.value; fillTree(); } }),
      h('button', { class: 'n-btn', title: 'New note', onclick: () => addNote(null) }, '+ Note'),
      h('button', { class: 'n-btn', title: 'New folder', onclick: () => addFolder(null) }, '+ Folder')),
    h('div', { class: 'n-tree' }));
  const tree = side.querySelector('.n-tree');
  // dropping on empty tree space moves things back to the top level
  tree.addEventListener('dragover', (e) => { if (noteUI.drag) { e.preventDefault(); } });
  tree.addEventListener('drop', (e) => { if (noteUI.drag) { e.preventDefault(); moveInto(null); } });
  $('#notes').replaceChildren(h('div', { class: 'n-wrap' }, side, noteMain()));
  fillTree();
  if (noteUI.renaming) { const i = $('#notes .n-rename'); if (i) { i.focus(); i.select(); } }
}

function moveInto(folderId) {
  const d = noteUI.drag; noteUI.drag = null;
  if (!d) return;
  if (d.type === 'note') noteById(d.id).folder = folderId;
  else if (!folderId || !folderDescendants(d.id).includes(folderId)) folderById(d.id).parent = folderId;
  if (folderId) folderById(folderId).open = true;
  save(); render();
}

function fillTree() {
  const tree = $('#notes .n-tree');
  if (!tree) return;
  const S = state.notes, q = noteUI.q.trim().toLowerCase();
  const byName = (a, b) => (a.name || a.title).localeCompare(b.name || b.title, undefined, { sensitivity: 'base' });
  const noteRow = (n, extra) => {
    const row = h('div', { class: `n-row n-note ${S.sel === n.id ? 'sel' : ''}`, draggable: 'true', onclick: () => { S.sel = n.id; save(); render(); } },
      h('span', { class: 'n-ico' }, '·'), h('span', { class: 'n-name' }, n.title), extra ? h('span', { class: 'n-sub' }, extra) : null,
      h('div', { class: 'acts' },
        h('button', { class: 'ib clone', title: 'Duplicate', html: ICON.copy, onclick: (e) => { e.stopPropagation(); addNote(n.folder, `${n.title} copy`, n.body); } }),
        h('button', { class: 'ib del', title: 'Delete', html: ICON.x, onclick: (e) => { e.stopPropagation(); deleteNote(n.id); } })));
    row.addEventListener('dragstart', (e) => { noteUI.drag = { type: 'note', id: n.id }; e.dataTransfer.setData('text/plain', n.id); e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { noteUI.drag = null; });
    return row;
  };
  if (q) {
    const hits = S.items.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)).sort(byName);
    tree.replaceChildren(...(hits.length ? hits.map((n) => noteRow(n, n.folder ? folderById(n.folder)?.name : '')) : [h('div', { class: 'n-empty' }, 'No matches')]));
    return;
  }
  const level = (parent, depth) => {
    const els = [];
    for (const f of S.folders.filter((x) => x.parent === parent).sort(byName)) {
      const count = S.items.filter((n) => folderDescendants(f.id).includes(n.folder)).length;
      const renaming = noteUI.renaming === f.id;
      const nameEl = renaming
        ? h('input', { class: 'n-rename', value: f.name, spellcheck: 'false',
          onclick: (e) => e.stopPropagation(),
          onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { noteUI.renaming = null; render(); } },
          onblur: (e) => { if (noteUI.renaming !== f.id) return; noteUI.renaming = null; f.name = e.target.value.trim() || f.name; save(); render(); } })
        : h('span', { class: 'n-name', title: 'Double-click to rename', ondblclick: (e) => { e.stopPropagation(); noteUI.renaming = f.id; render(); } }, f.name);
      const row = h('div', { class: 'n-row n-folder', draggable: renaming ? null : 'true', onclick: () => { f.open = !f.open; save(); render(); } },
        h('span', { class: 'n-ico' }, f.open ? '▾' : '▸'), nameEl, h('span', { class: 'n-sub' }, String(count)),
        h('div', { class: 'acts' },
          h('button', { class: 'ib', title: 'New note here', html: ICON.plus, onclick: (e) => { e.stopPropagation(); addNote(f.id); } }),
          h('button', { class: 'ib del', title: 'Delete folder', html: ICON.x, onclick: (e) => { e.stopPropagation(); deleteFolder(f.id); } })));
      row.addEventListener('dragstart', (e) => { noteUI.drag = { type: 'folder', id: f.id }; e.dataTransfer.setData('text/plain', f.id); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragend', () => { noteUI.drag = null; row.classList.remove('over'); });
      row.addEventListener('dragover', (e) => {
        const d = noteUI.drag;
        if (!d || (d.type === 'folder' && folderDescendants(d.id).includes(f.id))) return;
        e.preventDefault(); e.stopPropagation(); row.classList.add('over');
      });
      row.addEventListener('dragleave', () => row.classList.remove('over'));
      row.addEventListener('drop', (e) => {
        const d = noteUI.drag;
        if (!d || (d.type === 'folder' && folderDescendants(d.id).includes(f.id))) return;
        e.preventDefault(); e.stopPropagation(); moveInto(f.id);
      });
      const wrap = h('div', { class: 'n-group', style: { '--d': depth } }, row);
      if (f.open) wrap.append(h('div', { class: 'n-kids' }, level(f.id, depth + 1)));
      els.push(wrap);
    }
    for (const n of S.items.filter((x) => x.folder === parent).sort(byName)) els.push(noteRow(n));
    return els;
  };
  const rows = level(null, 0);
  tree.replaceChildren(...(rows.length ? rows : [h('div', { class: 'n-empty' }, 'No notes yet. Use + Note to start.')]));
}

function noteMain() {
  const S = state.notes, n = noteById(S.sel);
  if (!n) return h('section', { class: 'n-main n-none' }, h('div', { class: 'n-empty' }, 'Select or create a note'));
  const mode = S.mode || 'edit';
  const ta = h('textarea', { class: 'n-edit', spellcheck: 'false', placeholder: 'Write in markdown… link notes with [[Note title]]' });
  ta.value = n.body;
  const view = h('div', { class: 'n-view md' });
  const paint = () => { view.innerHTML = renderMarkdown(n.body); };
  paint();
  ta.addEventListener('input', () => {
    n.body = ta.value; n.updated = Date.now(); save();
    clearTimeout(noteUI.timer);
    if (S.mode === 'split') noteUI.timer = setTimeout(paint, 120);
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
  });
  view.addEventListener('click', (e) => {
    const wl = e.target.closest('.wikilink');
    if (wl) { e.preventDefault(); openNoteByTitle(wl.dataset.note); return; }
    const box = e.target.closest('input[type=checkbox][data-line]');
    if (box) {
      const lines = n.body.split('\n'), idx = +box.dataset.line;
      lines[idx] = lines[idx].replace(/\[([ xX])\]/, box.checked ? '[x]' : '[ ]');
      n.body = lines.join('\n'); n.updated = Date.now(); save(); ta.value = n.body; paint();
    }
  });
  const title = h('input', { class: 'n-title', value: n.title, spellcheck: 'false', maxlength: '120',
    onchange: (e) => renameNote(n, e.target.value),
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } });
  const live = h('button', { class: 'n-btn', title: 'Insert a live value from another window', onclick: () => toggleLiveMenu(live, ta, n, paint) }, '⚡ Live');
  const links = backlinks(n);
  return h('section', { class: `n-main m-${mode}` },
    h('div', { class: 'n-head' }, title,
      live,
      h('div', { class: 'seg' }, NOTE_MODES.map(([k, l]) => h('button', { class: k === mode ? 'sel' : '', onclick: () => { S.mode = k; save(); render(); } }, l)))),
    h('div', { class: 'n-body' }, mode !== 'view' ? ta : null, mode !== 'edit' ? view : null),
    links.length ? h('div', { class: 'n-back' }, 'Linked from ', links.flatMap((o, i) => [i ? ', ' : '', h('a', { class: 'wikilink', onclick: () => { S.sel = o.id; save(); render(); } }, o.title)])) : null);
}

/* ---------- live-value menu ---------- */
function toggleLiveMenu(anchor, ta, n, paint) {
  if (noteUI.menu) { closeLiveMenu(); return; }
  const insert = (token) => {
    if (state.notes.mode === 'view') { state.notes.mode = 'split'; save(); render(); setTimeout(() => insertAtCursor($('#notes .n-edit'), token), 0); closeLiveMenu(); return; }
    insertAtCursor(ta, token); closeLiveMenu();
  };
  const clean = (s) => s.replace(/[|}]/g, '');
  const item = (label, token) => h('button', { class: 'n-mi', onclick: () => insert(token) }, label);
  const per = noteUI.period;
  const menu = h('div', { class: 'n-menu' },
    h('div', { class: 'n-mh' }, 'Daily completion',
      h('div', { class: 'seg' }, PERIODS.map((p) => h('button', { class: p === per ? 'sel' : '', onclick: () => { noteUI.period = p; closeLiveMenu(); toggleLiveMenu(anchor, ta, n, paint); } }, p)))),
    item('All daily tasks', `{{daily:*|${per}}}`),
    state.daily.tasks.map((t) => item(t.name, `{{daily:${clean(t.name)}|${per}}}`)),
    h('div', { class: 'n-mh' }, 'Todo'),
    item('All categories', '{{todo:*}}'),
    state.todo.cats.map((c) => item(c.name, `{{todo:${clean(c.name)}}}`)),
    h('div', { class: 'n-mh' }, 'Diet'),
    item('Today', '{{diet:today}}'), item('Yesterday', '{{diet:yesterday}}'), item('7-day average', '{{diet:week}}'));
  noteUI.menu = menu;
  anchor.parentNode.append(menu);
}
function closeLiveMenu() { noteUI.menu?.remove(); noteUI.menu = null; }
function insertAtCursor(ta, text) {
  if (!ta) return;
  ta.focus();
  document.execCommand('insertText', false, text); // keeps the undo stack and fires input
}
document.addEventListener('click', (e) => {
  if (noteUI.menu && !noteUI.menu.contains(e.target) && !e.target.closest('.n-head .n-btn')) closeLiveMenu();
}, true);
