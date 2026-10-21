import { TYPE_LABEL, courseColorMap, isDone, formatDue, formatRelative, formatAgo, groupItems, groupOf, stats } from '/lib/format.js';
import { isDoneStatus } from '/lib/merge.js';

const $ = (id) => document.getElementById(id);
const KEY = 'ch_token';
let token = null;
try { token = localStorage.getItem(KEY); } catch { /* ignore */ }
let state = null;
let course = 'all';

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3000);
}

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth/')) { logout(data.error); throw new Error(data.error || '请重新登录'); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function logout(msg = '') {
  token = null;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  $('app').hidden = true;
  $('auth').hidden = false;
  $('authError').textContent = msg;
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await api('POST', '/api/auth/login', { email: f.get('email'), password: f.get('password') });
    token = r.token;
    try { localStorage.setItem(KEY, token); } catch { /* ignore */ }
    start();
  } catch (err) { $('authError').textContent = err.message; }
});
$('logoutBtn').addEventListener('click', async () => { await api('POST', '/api/auth/logout').catch(() => {}); logout(); });

const CHECK_SVG = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M20 6 9 17l-5-5');
  s.append(p);
  return s;
};

async function toggle(it) {
  const ov = { ...(state.overrides || {}) };
  const done = !isDone(it, ov);
  for (const id of it.ids || [it.id]) delete ov[id];
  if (done !== isDoneStatus(it.status)) ov[it.id] = done;
  state.overrides = ov;
  state.overridesAt = Date.now();
  render();
  try { await api('PUT', '/api/state', { overrides: ov, overridesAt: state.overridesAt }); } catch (e) { toast(`没保存上：${e.message}`); }
}

function render() {
  const now = new Date();
  const snap = state?.snapshot;
  const ov = state?.overrides || {};
  $('hello').textContent = `${snap?.user?.name?.split(' ')[0] || state.me.name}，${now.getHours() < 12 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好'}`;
  $('synced').textContent = snap?.lastSync ? `插件 ${formatAgo(snap.lastSync, now)}同步` : '电脑上的插件还没同步过';
  if (!snap) {
    $('stats').replaceChildren();
    $('courses').replaceChildren();
    $('list').replaceChildren(h('div', { class: 'empty' }, '还没有数据。在电脑的 Chrome 插件里登录同一个账号并同步一次，这里就能看到了。'));
    return;
  }
  const courses = snap.courses || [];
  const colors = courseColorMap(courses);
  const names = Object.fromEntries(courses.map((c) => [c.id, c.name]));
  const hidden = new Set(state.settings?.hiddenCourseIds || []);
  const items = (snap.items || []).filter((it) => names[it.courseId] && !hidden.has(it.courseId) && (course === 'all' || it.courseId === course));
  const s = stats(items, now, ov);
  $('stats').replaceChildren(
    h('div', { class: 'mstat' }, h('b', {}, s.open), h('span', {}, '未完成')),
    h('div', { class: 'mstat warn' }, h('b', {}, s.soon), h('span', {}, '7 天内')),
    h('div', { class: 'mstat danger' }, h('b', {}, s.overdue), h('span', {}, '确认逾期')));
  $('courses').replaceChildren(...[{ id: 'all', name: '全部' }, ...courses.filter((c) => !hidden.has(c.id))].map((c) =>
    h('button', { type: 'button', 'aria-pressed': String(course === c.id), onClick: () => { course = c.id; render(); } }, c.name)));
  const groups = groupItems(items, now, ov).filter((g) => g.id !== 'donePast' || g.items.length <= 30);
  if (!groups.length) { $('list').replaceChildren(h('div', { class: 'empty' }, '没有待办')); return; }
  $('list').replaceChildren(...groups.map((g) => h('section', {},
    h('div', { class: 'ghead' }, h('h2', { class: g.id === 'overdue' ? 'danger' : '' }, g.label), h('span', {}, `${g.items.length} 项`)),
    h('div', { class: 'gcard' }, ...g.items.map((it) => {
      const done = isDone(it, ov);
      const grp = groupOf(it, now, done);
      const tone = done ? 'neutral' : grp === 'overdue' ? 'danger' : grp === 'today' || grp === 'tomorrow' ? 'warn' : 'neutral';
      const cc = colors[it.courseId];
      return h('div', { class: `mrow${done ? ' done' : ''}` },
        h('button', { type: 'button', class: 'check', style: `--cc:${cc}`, 'aria-pressed': String(done), 'aria-label': `${done ? '标为未完成' : '标记完成'}：${it.title}`, onClick: () => toggle(it) }, CHECK_SVG()),
        h('div', { class: 'mbody' },
          it.url ? h('a', { class: 'mtitle', href: it.url, target: '_blank', rel: 'noopener' }, it.title) : h('span', { class: 'mtitle' }, it.title),
          h('div', { class: 'mmeta' },
            h('span', { class: 'course-tag', style: `--cc:${cc}` }, names[it.courseId]),
            h('span', {}, TYPE_LABEL[it.type] || ''),
            h('span', { class: `chip ${tone}` }, formatDue(it.due, now)),
            done || grp === 'unverified' ? null : h('span', {}, formatRelative(it.due, now)))));
    })))));
}

async function start() {
  if (!token) { logout(); return; }
  try {
    const [me, st] = await Promise.all([api('GET', '/api/me'), api('GET', '/api/state')]);
    state = { ...st, me: me.user };
    const ann = me.announcement;
    $('announce').hidden = !ann;
    $('announce').textContent = ann || '';
  } catch {
    return;
  }
  $('auth').hidden = true;
  $('app').hidden = false;
  render();
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && token) start(); });
setInterval(() => { if (state) render(); }, 60000);
start();
