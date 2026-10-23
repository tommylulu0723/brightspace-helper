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
    if (tab === 'mail') await loadMail();
    if (tab === 'feedback') await loadFeedback();
    if (tab === 'settings') await loadSettings();
    if (tab === 'audit') await loadAudit();
  } catch (e) {
    if (token) toast(e.message);
  }
}

// ---------------- 概览 ----------------
async function loadOverview() {
  const o = await api('GET', '/api/admin/overview');
  setFbBadge(o.feedbackOpen || 0);
  $('ovSub').textContent = `服务器 v${o.version} · ${new Date(o.serverTime).toLocaleString('zh-CN')} 更新 · 每 15 秒自动刷新`;
  const stat = (label, n, sub, cls = '') => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: `stat-num ${cls}` }, n), sub ? h('span', { class: 'stat-sub' }, sub) : null);
  $('ovStats').replaceChildren(
    stat('用户总数', o.users, `${o.admins} 个管理员${o.disabled ? ` · ${o.disabled} 个已停用` : ''}`),
    stat('7 天活跃', o.active7d, `本周新注册 ${o.newUsers7d}`),
    stat('24 小时内同步过', o.synced24h, `${o.sessions} 个登录设备`),
    stat('今天同步', o.today.users, `${o.today.syncs} 次同步`),
    stat('通过 Brightspace 校验', o.verified, o.unverified ? `${o.unverified} 人还没通过` : '全部通过', o.unverified ? 'warn' : ''),
    stat('待处理反馈', o.feedbackOpen || 0, o.feedbackOpen ? '去"反馈"页看看' : '没有新反馈', o.feedbackOpen ? 'warn' : ''),
    stat('今天发出提醒邮件', o.mail.configured ? o.mail.today.sent : '未开启', o.mail.configured ? `${o.remindersOn} 人开着提醒${o.mail.today.failed ? ` · ${o.mail.today.failed} 封失败` : ''}` : '去"邮件提醒"设置发信邮箱', o.mail.today.failed || !o.mail.configured ? 'warn' : '')
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
    h('div', {}, h('span', {}, '公告'), s.announcement || '无'),
    h('div', {}, h('span', {}, '发信邮箱'), s.mail?.configured ? `${s.mail.user}（${s.mail.host}）` : '未设置')
  );
}

// ---------------- 用户 ----------------
async function loadUsers() {
  users = (await api('GET', '/api/admin/users')).users;
  renderUsers();
}

function renderUsers() {
  const q = $('userQ').value.trim().toLowerCase();
  const list = users.filter((u) => !q || `${u.name} ${u.email} ${u.verify?.bsName || ''}`.toLowerCase().includes(q)).sort((a, b) => Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0));
  $('usersSub').textContent = `${users.length} 个用户`;
  const head = h('tr', {}, ...['用户', 'Brightspace 校验', '角色', '最近活跃', '最近同步', '课程 / 事项 / 课件', '提醒邮件', ''].map((t, i) => h('th', { class: i === 5 || i === 6 ? 'num' : '' }, t)));
  const VS = { ok: ['已通过', 'ok'], mismatch: ['姓名不一致', 'danger'], taken: ['账号被占用', 'danger'], pending: ['等待校验', 'neutral'] };
  const rows = list.map((u) => {
    const self = me && u.id === me.id;
    const act = async (fn, okMsg) => { try { await fn(); toast(okMsg); await loadUsers(); } catch (e) { toast(e.message); } };
    return h('tr', {},
      h('td', {}, h('div', { class: 'uname' }, u.name, self ? '（你）' : ''), h('div', { class: 'uemail' }, u.email), h('div', { class: 'muted' }, `注册于 ${date(u.createdAt)}${u.invitedWith ? ` · 邀请码 ${u.invitedWith}` : ''}`)),
      h('td', {}, (() => {
        const v = u.verify || { status: 'pending' };
        const [label, tone] = VS[v.status] || VS.pending;
        return h('div', { class: 'vchip' }, h('span', { class: `chip ${tone}` }, label + (v.manual ? '（手动）' : '')),
          v.bsName ? h('small', {}, `Brightspace：${v.bsName}${v.uniqueName ? ` · ${v.uniqueName}` : ''}`) : null,
          v.status !== 'ok' && v.reason ? h('small', {}, v.reason) : null,
          v.checkedAt ? h('small', {}, `${ago(v.checkedAt)}检查`) : null);
      })()),
      h('td', {}, u.disabled ? h('span', { class: 'chip danger' }, '已停用') : u.role === 'admin' ? h('span', { class: 'chip accent' }, '管理员') : h('span', { class: 'chip neutral' }, '用户')),
      h('td', { class: 'muted' }, ago(u.lastSeenAt)),
      h('td', { class: 'muted' }, ago(u.lastSyncAt)),
      h('td', { class: 'num' }, `${u.stats.courses} / ${u.stats.items} / ${u.stats.files}`),
      h('td', { class: 'num muted' }, u.reminders && !u.reminders.h24 && !u.reminders.h3 ? '已关闭' : `${u.reminderCount || 0} 封`, h('div', {}, u.lastReminderAt ? `最近 ${ago(u.lastReminderAt)}` : `${u.sessions} 台设备 · ${kb(u.storageBytes)}`)),
      h('td', {}, h('div', { class: 'actions' },
        u.verify?.status !== 'ok' ? h('button', { type: 'button', class: 'btn small', onClick: () => {
          if (!confirm(`确认 ${u.name} 是本人，手动通过 Brightspace 校验？\n他下次同步时会绑定当时登录的 Brightspace 账号。`)) return;
          act(() => api('PATCH', `/api/admin/users/${u.id}`, { verify: 'approve' }), '已手动通过');
        } }, '手动通过') : h('button', { type: 'button', class: 'btn small', title: '解除绑定，下次同步重新比对姓名', onClick: () => {
          if (!confirm(`重置 ${u.name} 的 Brightspace 校验？下次同步时会重新比对姓名、重新绑定账号。`)) return;
          act(() => api('PATCH', `/api/admin/users/${u.id}`, { verify: 'reset' }), '已重置');
        } }, '重置校验'),
        h('button', { type: 'button', class: 'btn small', onClick: () => {
          const f = prompt('First name（和 Brightspace 一致）', u.firstName || '');
          if (f == null) return;
          const l = prompt('Last name（和 Brightspace 一致）', u.lastName || '');
          if (l == null) return;
          act(() => api('PATCH', `/api/admin/users/${u.id}`, { firstName: f, lastName: l }), '姓名已修改');
        } }, '改姓名'),
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
  $('usersTable').replaceChildren(h('thead', {}, head), h('tbody', {}, ...(rows.length ? rows : [h('tr', {}, h('td', { colspan: 8, class: 'empty-row' }, '没有用户'))])));
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

// ---------------- 邮件提醒 ----------------
async function loadMail() {
  const [o, { log }] = await Promise.all([api('GET', '/api/admin/overview'), api('GET', '/api/admin/mail-log')]);
  const m = o.settings.mail || {};
  const f = $('mailForm');
  if (!f.dataset.loaded) {
    f.host.value = m.host || '';
    f.port.value = m.port || '';
    f.user.value = m.user || '';
    f.fromName.value = m.fromName || '';
    f.secure.value = m.secure || 'ssl';
    f.siteUrl.value = o.settings.siteUrl || '';
    f.pass.placeholder = m.hasPass ? '已设置，不改就留空' : '还没设置';
    f.dataset.loaded = '1';
  }
  const stat = (label, n, sub, cls = '') => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: `stat-num ${cls}` }, n), sub ? h('span', { class: 'stat-sub' }, sub) : null);
  $('mailStats').replaceChildren(
    stat('发信邮箱', m.configured ? '已设置' : '未设置', m.configured ? m.user : '设置好才会发提醒', m.configured ? '' : 'warn'),
    stat('今天发出', o.mail.today.sent, o.mail.today.failed ? `${o.mail.today.failed} 封失败` : '没有失败', o.mail.today.failed ? 'warn' : ''),
    stat('开着提醒的人', o.remindersOn, `共 ${o.verified} 人通过校验`),
    stat('最近一次失败', o.mail.lastError ? '有' : '无', o.mail.lastError || '')
  );
  const KIND = { reminder: '截止提醒', test: '用户测试', 'admin-test': '后台测试' };
  const head = h('tr', {}, ...['时间', '类型', '收件人', '标题', '结果'].map((t) => h('th', {}, t)));
  const rows = log.map((x) => h('tr', {},
    h('td', { class: 'muted' }, new Date(x.at).toLocaleString('zh-CN')),
    h('td', {}, KIND[x.kind] || x.kind),
    h('td', {}, x.to),
    h('td', {}, x.subject),
    h('td', {}, x.ok ? h('span', { class: 'chip ok' }, '已发送') : h('span', { class: 'chip danger', title: x.error }, `失败：${x.error}`))));
  $('mailTable').replaceChildren(h('thead', {}, head), h('tbody', {}, ...(rows.length ? rows : [h('tr', {}, h('td', { colspan: 5, class: 'empty-row' }, '还没有发过邮件'))])));
}

$('mailForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('PUT', '/api/admin/settings', {
      siteUrl: f.siteUrl.value,
      mail: { host: f.host.value, port: Number(f.port.value) || (f.secure.value === 'starttls' ? 587 : 465), user: f.user.value, pass: f.pass.value, fromName: f.fromName.value, secure: f.secure.value }
    });
    f.pass.value = '';
    f.dataset.loaded = '';
    $('mailSaved').textContent = `已保存 ${new Date().toLocaleTimeString('zh-CN')}`;
    loadMail();
  } catch (err) { toast(err.message); }
});
$('mailTest').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const r = await api('POST', '/api/admin/test-email', { to: $('mailForm').testTo.value });
    toast(`测试邮件已发到 ${r.to}，去收件箱（或垃圾邮件）看看`);
  } catch (err) {
    dialog('发送失败', h('p', {}, err.message), h('p', { class: 'hint' }, 'Gmail 要用"应用专用密码"（不是登录密码），QQ 邮箱要用"授权码"。改完先点保存再测试。'));
  } finally {
    btn.disabled = false;
    loadMail();
  }
});
$('runReminders').addEventListener('click', async () => {
  try {
    const r = await api('POST', '/api/admin/run-reminders');
    toast(r.reason === 'MAIL_OFF' ? '还没设置发信邮箱' : r.skipped ? '正在检查中，稍后再看' : `检查完成：发出 ${r.sent} 封${r.failed ? `，失败 ${r.failed} 封` : ''}`);
    loadMail();
  } catch (err) { toast(err.message); }
});

// ---------------- 反馈 ----------------
let fbFilter = 'open';
function setFbBadge(n) { $('fbBadge').hidden = !n; $('fbBadge').textContent = n; }
for (const b of document.querySelectorAll('#fbFilter button')) b.addEventListener('click', () => {
  fbFilter = b.dataset.f;
  for (const x of document.querySelectorAll('#fbFilter button')) x.setAttribute('aria-pressed', String(x === b));
  loadFeedback();
});
const KIND = { bug: ['问题', 'danger'], idea: ['建议', 'accent'], other: ['其他', 'neutral'] };
async function loadFeedback() {
  const { feedback, open } = await api('GET', '/api/admin/feedback');
  setFbBadge(open);
  const list = feedback.filter((f) => fbFilter === 'all' || f.status === fbFilter);
  $('fbSub').textContent = `${open} 条待处理 · 共 ${feedback.length} 条`;
  const act = async (fn, msg) => { try { await fn(); toast(msg); loadFeedback(); } catch (e) { toast(e.message); } };
  $('fbList').replaceChildren(...(list.length ? list.map((f) => {
    const [kl, kt] = KIND[f.kind] || KIND.other;
    return h('div', { class: `card fb-card${f.status === 'done' ? ' done' : ''}` },
      h('div', { class: 'fb-head' },
        h('span', { class: `chip ${kt}` }, kl),
        h('strong', {}, f.name || '未登录用户'),
        h('span', { class: 'muted' }, f.email || '没留邮箱'),
        h('span', { class: 'muted' }, `v${f.version || '?'} · ${f.lang === 'en' ? 'English' : '中文'} · ${ago(f.at)}`),
        f.status === 'done' ? h('span', { class: 'chip ok' }, '已处理') : null),
      h('p', { class: 'fb-msg' }, f.message),
      f.reply ? h('p', { class: 'fb-reply' }, h('b', {}, '你的回复：'), f.reply) : null,
      h('div', { class: 'actions' },
        f.hasDiag ? h('button', { type: 'button', class: 'btn small', onClick: async () => {
          try {
            const { diagnostics } = await api('GET', `/api/admin/feedback/${f.id}`);
            const text = JSON.stringify(diagnostics, null, 2);
            dialog('诊断信息', h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn small', onClick: async () => { try { await navigator.clipboard.writeText(text); toast('已复制，可以直接粘贴给 Claude'); } catch { toast('复制失败'); } } }, '复制')), h('pre', { class: 'diag' }, text));
          } catch (e) { toast(e.message); }
        } }, '查看诊断信息') : h('span', { class: 'muted' }, '没有附诊断信息'),
        f.userId ? h('button', { type: 'button', class: 'btn small', onClick: () => {
          const r = prompt('回复（对方在插件的反馈窗口里能看到）：', f.reply || '');
          if (r == null) return;
          act(() => api('PATCH', `/api/admin/feedback/${f.id}`, { reply: r, status: 'done' }), '已回复并标记为已处理');
        } }, f.reply ? '修改回复' : '回复') : null,
        h('button', { type: 'button', class: 'btn small', onClick: () => act(() => api('PATCH', `/api/admin/feedback/${f.id}`, { status: f.status === 'done' ? 'open' : 'done' }), f.status === 'done' ? '已重新打开' : '已标记为已处理') }, f.status === 'done' ? '重新打开' : '标记已处理'),
        h('button', { type: 'button', class: 'btn small', onClick: () => { if (confirm('删除这条反馈？')) act(() => api('DELETE', `/api/admin/feedback/${f.id}`), '已删除'); } }, '删除')));
  }) : [h('div', { class: 'card empty-row' }, fbFilter === 'open' ? '没有待处理的反馈 🎉' : '还没有反馈')]));
}

// ---------------- 操作记录 ----------------
const ACTION = { feedback: '提交反馈', 'verify-ok': '通过 Brightspace 校验', 'verify-mismatch': '校验不一致', 'verify-taken': 'Brightspace 账号被占用', 'verify-approve': '手动通过校验', 'verify-reset': '重置校验', rename: '修改姓名', register: '注册', invite: '生成邀请码', 'delete-invite': '删除邀请码', disable: '停用账号', enable: '恢复账号', role: '修改角色', 'reset-password': '重置密码', 'logout-all': '退出所有设备', 'delete-user': '删除用户', settings: '修改设置' };
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
  setTab(['overview', 'users', 'feedback', 'mail', 'invites', 'settings', 'audit'].includes(t) ? t : 'overview');
}

setInterval(() => { if (token && !document.hidden && (tab === 'overview' || tab === 'users' || tab === 'mail' || tab === 'feedback')) load(); }, 15000);
start();
