const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'ch_admin_token';
let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* ignore */ }
let tab = 'overview';
let users = [];
let me = null;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || (res.status === 403 && path.startsWith('/api/admin'))) {
    if (!path.startsWith('/api/auth/')) showLogin(res.status === 403 ? '这个账号不是管理员' : '');
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3500);
}

function dialog(title, ...body) {
  $('dlgTitle').textContent = title;
  $('dlgBody').replaceChildren(...body);
  $('dialog').showModal();
}

function ago(iso) {
  if (!iso) return '从未';
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  if (m < 1440) return `${Math.floor(m / 60)} 小时前`;
  return `${Math.floor(m / 1440)} 天前`;
}
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('zh-CN') : '');
const kb = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

// ---------------- 登录 ----------------
function showLogin(err = '') {
  token = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  $('app').hidden = true;
  $('login').hidden = false;
  $('loginError').textContent = err;
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('loginError').textContent = '';
  try {
    const r = await api('POST', '/api/auth/login', { email: f.get('email'), password: f.get('password') });
    if (r.user.role !== 'admin') { $('loginError').textContent = '这个账号不是管理员'; return; }
    token = r.token;
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
    start();
  } catch (err) {
    $('loginError').textContent = err.message;
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await api('POST', '/api/auth/logout').catch(() => {});
  showLogin();
});

// ---------------- 页面切换 ----------------
function setTab(t) {
  tab = t;
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
  for (const s of document.querySelectorAll('[data-panel]')) s.hidden = s.dataset.panel !== t;
  history.replaceState(null, '', `#${t}`);
  load();
}
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => setTab(b.dataset.tab));
for (const b of document.querySelectorAll('[data-goto]')) b.addEventListener('click', () => setTab(b.dataset.goto));

async function load() {
  try {
    if (tab === 'overview') await loadOverview();
    if (tab === 'users') await loadUsers();
    if (tab === 'invites') await loadInvites();
    if (tab === 'settings') await loadSettings();
    if (tab === 'audit') await loadAudit();
  } catch (e) {
    if (token) toast(e.message);
  }
}

// ---------------- 概览 ----------------
async function loadOverview() {
  const o = await api('GET', '/api/admin/overview');
  $('ovSub').textContent = `服务器 v${o.version} · ${new Date(o.serverTime).toLocaleString('zh-CN')} 更新 · 每 15 秒自动刷新`;
  const stat = (label, n, sub, cls = '') => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: `stat-num ${cls}` }, n), sub ? h('span', { class: 'stat-sub' }, sub) : null);
  $('ovStats').replaceChildren(
    stat('用户总数', o.users, `${o.admins} 个管理员${o.disabled ? ` · ${o.disabled} 个已停用` : ''}`),
    stat('7 天活跃', o.active7d, `本周新注册 ${o.newUsers7d}`),
    stat('24 小时内同步过', o.synced24h, `${o.sessions} 个登录设备`),
    stat('今天同步', o.today.users, `${o.today.syncs} 次同步`),
    stat('可用邀请码', o.invitesActive, '')
  );
  const max = Math.max(1, ...o.days.map((d) => d.users));
  $('ovChart').replaceChildren(...o.days.map((d) => h('div', { class: 'bar-col', title: `${d.date}：${d.users} 人同步，共 ${d.syncs} 次` },
    h('span', { class: 'bar-val' }, d.users || ''),
    h('div', { class: `bar${d.users ? '' : ' zero'}`, style: `height:${Math.max(2, (d.users / max) * 120)}px` }),
    h('span', { class: 'bar-label' }, d.date.slice(5).replace('-', '/')))));
  $('ovChartHint').textContent = `14 天合计 ${o.days.reduce((n, d) => n + d.syncs, 0)} 次同步`;
  const s = o.settings;
  const reg = { invite: '需要邀请码', open: '开放注册', closed: '关闭注册' }[s.registration];
  const onoff = (v) => (v ? '开' : '关');
  $('ovSettings').replaceChildren(
    h('div', {}, h('span', {}, '注册方式'), reg),
    h('div', {}, h('span', {}, '云同步'), onoff(s.flags.sync)),
    h('div', {}, h('span', {}, '公告'), s.announcement || '无')
  );
}

// ---------------- 用户 ----------------
async function loadUsers() {
  users = (await api('GET', '/api/admin/users')).users;
  renderUsers();
}

function renderUsers() {
  const q = $('userQ').value.trim().toLowerCase();
  const list = users.filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q)).sort((a, b) => Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0));
  $('usersSub').textContent = `${users.length} 个用户`;
  const head = h('tr', {}, ...['用户', '角色', '最近活跃', '最近同步', '课程 / 事项 / 课件', '数据', ''].map((t, i) => h('th', { class: i >= 4 && i <= 5 ? 'num' : '' }, t)));
  const rows = list.map((u) => {
    const self = me && u.id === me.id;
    const act = async (fn, okMsg) => { try { await fn(); toast(okMsg); await loadUsers(); } catch (e) { toast(e.message); } };
    return h('tr', {},
      h('td', {}, h('div', { class: 'uname' }, u.name, self ? '（你）' : ''), h('div', { class: 'uemail' }, u.email), h('div', { class: 'muted' }, `注册于 ${date(u.createdAt)}${u.invitedWith ? ` · 邀请码 ${u.invitedWith}` : ''}`)),
      h('td', {}, u.disabled ? h('span', { class: 'chip danger' }, '已停用') : u.role === 'admin' ? h('span', { class: 'chip accent' }, '管理员') : h('span', { class: 'chip neutral' }, '用户')),
      h('td', { class: 'muted' }, ago(u.lastSeenAt)),
      h('td', { class: 'muted' }, ago(u.lastSyncAt)),
      h('td', { class: 'num' }, `${u.stats.courses} / ${u.stats.items} / ${u.stats.files}`),
      h('td', { class: 'num muted' }, kb(u.storageBytes), h('div', {}, `${u.sessions} 台设备`)),
      h('td', {}, h('div', { class: 'actions' },
        self ? null : h('button', { type: 'button', class: 'btn small', onClick: () => act(() => api('PATCH', `/api/admin/users/${u.id}`, { disabled: !u.disabled }), u.disabled ? '已恢复' : '已停用，对方已被退出登录') }, u.disabled ? '恢复' : '停用'),
        self ? null : h('button', { type: 'button', class: 'btn small', onClick: () => act(() => api('PATCH', `/api/admin/users/${u.id}`, { role: u.role === 'admin' ? 'user' : 'admin' }), '角色已修改') }, u.role === 'admin' ? '取消管理员' : '设为管理员'),
        h('button', { type: 'button', class: 'btn small', onClick: async () => {
          if (!confirm(`重置 ${u.email} 的密码？对方所有设备会被退出登录。`)) return;
          try {
            const r = await api('POST', `/api/admin/users/${u.id}/reset-password`);
            dialog('临时密码', h('p', {}, `把这个临时密码发给 ${u.name}，让他登录后在插件里改密码：`), h('div', { class: 'big-code' }, r.password));
            loadUsers();
          } catch (e) { toast(e.message); }
        } }, '重置密码'),
        self ? null : h('button', { type: 'button', class: 'btn small', onClick: () => {
          if (!confirm(`永久删除 ${u.email} 和他的所有同步数据？不能恢复。`)) return;
          act(() => api('DELETE', `/api/admin/users/${u.id}`), '已删除');
        } }, '删除')))
    );
  });
  $('usersTable').replaceChildren(h('thead', {}, head), h('tbody', {}, ...(rows.length ? rows : [h('tr', {}, h('td', { colspan: 7, class: 'empty-row' }, '没有用户'))])));
}
$('userQ').addEventListener('input', renderUsers);

// ---------------- 邀请码 ----------------
async function loadInvites() {
  const { invites } = await api('GET', '/api/admin/invites');
  const head = h('tr', {}, ...['邀请码', '备注', '剩余 / 总次数', '谁用了', '创建', ''].map((t) => h('th', {}, t)));
  const rows = invites.map((i) => h('tr', {},
    h('td', {}, h('span', { class: 'code' }, i.code)),
    h('td', {}, i.note || h('span', { class: 'muted' }, '—')),
    h('td', {}, i.usesLeft > 0 ? `${i.usesLeft} / ${i.uses}` : h('span', { class: 'chip neutral' }, '已用完')),
    h('td', { class: 'muted' }, i.usedBy.map((x) => x.email).join('、') || '—'),
    h('td', { class: 'muted' }, `${date(i.createdAt)} · ${i.createdBy}`),
    h('td', {}, h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn small', onClick: async () => { try { await navigator.clipboard.writeText(i.code); toast('已复制'); } catch { toast(i.code); } } }, '复制'),
      h('button', { type: 'button', class: 'btn small', onClick: async () => { if (!confirm(`删除邀请码 ${i.code}？`)) return; await api('DELETE', `/api/admin/invites/${i.code}`); loadInvites(); } }, '删除')))
  ));
  $('invitesTable').replaceChildren(h('thead', {}, head), h('tbody', {}, ...(rows.length ? rows : [h('tr', {}, h('td', { colspan: 6, class: 'empty-row' }, '还没有邀请码'))])));
}

$('inviteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const { invite } = await api('POST', '/api/admin/invites', { uses: Number(f.get('uses')), note: f.get('note') });
    e.target.reset();
    dialog('邀请码已生成', h('p', {}, `可以用 ${invite.uses} 次。发给同学，注册时填这个：`), h('div', { class: 'big-code' }, invite.code));
    loadInvites();
  } catch (err) { toast(err.message); }
});

// ---------------- 设置 ----------------
async function loadSettings() {
  const { settings: s } = await api('GET', '/api/admin/overview');
  const f = $('settingsForm');
  f.querySelector(`input[name=registration][value=${s.registration}]`).checked = true;
  f.flag_sync.checked = s.flags.sync;
  f.announcement.value = s.announcement || '';
}

$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('PUT', '/api/admin/settings', {
      registration: f.querySelector('input[name=registration]:checked')?.value,
      flags: { sync: f.flag_sync.checked },
      announcement: f.announcement.value
    });
    $('settingsSaved').textContent = `已保存 ${new Date().toLocaleTimeString('zh-CN')}`;
  } catch (err) { toast(err.message); }
});

// ---------------- 操作记录 ----------------
const ACTION = { register: '注册', invite: '生成邀请码', 'delete-invite': '删除邀请码', disable: '停用账号', enable: '恢复账号', role: '修改角色', 'reset-password': '重置密码', 'logout-all': '退出所有设备', 'delete-user': '删除用户', settings: '修改设置' };
async function loadAudit() {
  const { audit } = await api('GET', '/api/admin/audit');
  const head = h('tr', {}, ...['时间', '操作', '操作人', '详情'].map((t) => h('th', {}, t)));
  const rows = audit.map((a) => h('tr', {}, h('td', { class: 'muted' }, new Date(a.at).toLocaleString('zh-CN')), h('td', {}, ACTION[a.action] || a.action), h('td', {}, a.by), h('td', { class: 'muted' }, a.detail)));
  $('auditTable').replaceChildren(h('thead', {}, head), h('tbody', {}, ...(rows.length ? rows : [h('tr', {}, h('td', { colspan: 4, class: 'empty-row' }, '还没有记录'))])));
}

// ---------------- 启动 ----------------
async function start() {
  if (!token) { showLogin(); return; }
  try {
    const r = await api('GET', '/api/me');
    if (r.user.role !== 'admin') { showLogin('这个账号不是管理员'); return; }
    me = r.user;
  } catch {
    return;
  }
  $('who').textContent = `${me.name} · ${me.email}`;
  $('login').hidden = true;
  $('app').hidden = false;
  const t = location.hash.slice(1);
  setTab(['overview', 'users', 'invites', 'settings', 'audit'].includes(t) ? t : 'overview');
}

setInterval(() => { if (token && !document.hidden && (tab === 'overview' || tab === 'users')) load(); }, 15000);
start();
