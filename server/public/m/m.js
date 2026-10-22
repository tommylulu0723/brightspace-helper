import { TYPE_LABEL, courseColorMap, isDone, formatDue, formatRelative, formatAgo, groupItems, groupOf, stats } from '/lib/format.js';
import { isDoneStatus } from '/lib/merge.js';
import { buildPlan } from '/lib/plan.js';

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

let mode = 'login';
let info = null;
function setMode(m) {
  mode = m;
  const reg = m === 'register';
  $('modeLogin').setAttribute('aria-pressed', String(!reg));
  $('modeReg').setAttribute('aria-pressed', String(reg));
  for (const el of document.querySelectorAll('.reg-only')) el.hidden = !reg;
  $('inviteField').hidden = !(reg && info?.registration === 'invite');
  $('authSub').textContent = reg ? '注册后，在电脑上的课程助手插件里登录同一个账号，插件会用 Brightspace 核对一次姓名，通过后就能用了。' : '用课程助手账号登录，查看截止时间和今日计划。';
  $('pwLabel').textContent = reg ? '密码（至少 8 位）' : '密码';
  document.querySelector('#loginForm input[name=password]').autocomplete = reg ? 'new-password' : 'current-password';
  $('authBtn').textContent = reg ? '注册' : '登录';
  $('authError').textContent = '';
  if (reg && !info) api('GET', '/api/info').then((x) => { info = x; setMode(mode); }).catch(() => {});
}
$('modeLogin').addEventListener('click', () => setMode('login'));
$('modeReg').addEventListener('click', () => setMode('register'));

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = $('authBtn');
  btn.disabled = true;
  try {
    if (mode === 'register') {
      if (!String(f.get('firstName')).trim() || !String(f.get('lastName')).trim()) throw new Error('First name 和 Last name 都要填');
      const r = await api('POST', '/api/auth/register', { firstName: f.get('firstName'), lastName: f.get('lastName'), email: f.get('email'), password: f.get('password'), invite: f.get('invite') });
      token = r.token;
      try { localStorage.setItem(KEY, token); } catch { /* ignore */ }
      e.target.hidden = true;
      document.querySelector('.auth-card .seg').hidden = true;
      $('authSub').hidden = true;
      $('regDone').hidden = false;
      $('regDone').replaceChildren(
        h('strong', {}, `注册成功，${r.user.firstName}！${r.user.role === 'admin' ? '你是第一个注册的，已经是管理员。' : ''}`),
        h('p', {}, '最后一步：在电脑的 Chrome 里打开课程助手插件，用这个邮箱和密码登录。插件会读取 Brightspace 上的姓名核对，通过后这里就能看到你的截止时间。'),
        r.user.role === 'admin' ? h('a', { class: 'btn', href: '/admin/' }, '打开管理后台') : null,
        h('button', { type: 'button', class: 'btn primary', onClick: () => start() }, '我已经在插件里登录了，刷新'));
      return;
    }
    const r = await api('POST', '/api/auth/login', { email: f.get('email'), password: f.get('password') });
    token = r.token;
    try { localStorage.setItem(KEY, token); } catch { /* ignore */ }
    start();
  } catch (err) {
    $('authError').textContent = err.message;
    if (/邀请码/.test(err.message)) $('inviteField').hidden = false;
  } finally {
    btn.disabled = false;
  }
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
  renderPlan(items, now, ov, colors, names);
  renderRemind();
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

function renderPlan(items, now, ov, colors, names) {
  const plan = buildPlan(items, now, ov);
  const box = $('plan');
  box.hidden = !plan.length;
  if (!plan.length) return;
  box.replaceChildren(
    h('div', { class: 'ghead' }, h('h2', {}, '今日计划'), h('span', {}, `先做这 ${Math.min(plan.length, 5)} 件`)),
    h('div', { class: 'gcard' }, ...plan.slice(0, 5).map((it, i) => h('div', { class: 'prow' },
      h('span', { class: 'pnum', style: `--cc:${colors[it.courseId]}` }, i + 1),
      h('div', { class: 'mbody' },
        it.url ? h('a', { class: 'mtitle', href: it.url, target: '_blank', rel: 'noopener' }, it.title) : h('span', { class: 'mtitle' }, it.title),
        h('div', { class: 'mmeta' }, h('span', { class: 'course-tag', style: `--cc:${colors[it.courseId]}` }, names[it.courseId]), h('span', { class: `chip ${it.reason.tone}` }, it.reason.text)))))));
}

function renderRemind() {
  $('remind').hidden = false;
  const r = state.me.reminders || { h24: true, h3: true };
  const set = async (patch) => {
    try {
      const out = await api('PATCH', '/api/me', { reminders: { ...r, ...patch } });
      state.me = out.user;
      renderRemind();
      toast('已保存');
    } catch (e) { toast(e.message); }
  };
  const chip = (key, label) => h('button', { type: 'button', 'aria-pressed': String(r[key] !== false), onClick: () => set({ [key]: r[key] === false }) }, label);
  $('remind').replaceChildren(
    h('div', {}, h('b', {}, '邮件提醒'), h('span', {}, ` · 发到 ${state.me.email}`)),
    h('div', { class: 'mcourses' }, chip('h24', '截止前 24 小时'), chip('h3', '截止前 3 小时')));
}

function showLocked(msg) {
  $('auth').hidden = true;
  $('app').hidden = false;
  for (const id of ['stats', 'courses', 'list', 'remind']) $(id).replaceChildren();
  $('remind').hidden = true;
  $('plan').hidden = true;
  $('hello').textContent = state?.me?.name || '课程助手';
  $('synced').textContent = '';
  const l = $('locked');
  l.hidden = false;
  l.replaceChildren(h('strong', {}, '还不能使用'), h('p', {}, msg), h('p', { class: 'muted' }, '在电脑的 Chrome 里打开课程助手插件，登录 Brightspace 后会自动核对姓名。核对通过后刷新这个页面。'));
}

async function start() {
  if (!token) { logout(); return; }
  let me;
  try {
    me = await api('GET', '/api/me');
  } catch {
    return;
  }
  state = { ...(state || {}), me: me.user };
  const ann = me.announcement;
  $('announce').hidden = !ann;
  $('announce').textContent = ann || '';
  try {
    const st = await api('GET', '/api/state');
    state = { ...st, me: me.user };
  } catch (e) {
    showLocked(e.message);
    return;
  }
  $('locked').hidden = true;
  $('auth').hidden = true;
  $('app').hidden = false;
  render();
}

// 已经"添加到主屏幕"打开的，不再显示安装提示
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) $('installTip').hidden = true;

document.addEventListener('visibilitychange', () => { if (!document.hidden && token) start(); });
setInterval(() => { if (state) render(); }, 60000);
start();
