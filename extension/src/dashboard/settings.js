// 设置页：课程管理、通知、账号（登录 / 注册，可选）、诊断、更新日志。
// 每一块只在它自己的数据变了才重画，避免正在输入的内容被清掉。
import { h, fill, add, icon, I, toast, confirmDialog, initials } from './ui.js';
import { cloud, normalizeServer } from '../lib/cloud.js';
import { DEFAULT_SERVER, VERSION_NOTES, REQUIRE_LOGIN } from '../config.js';
import { getLang } from '../lib/i18n.js';
import { courseColorMap } from '../lib/format.js';

const sections = {};
const lastKey = {};

function section(root, id, title, desc) {
  if (!sections[id]) {
    const body = h('div', { class: 'set-body' });
    const el = h('section', { class: 'set-card', id: `set-${id}`, 'aria-labelledby': `set-${id}-t` },
      h('div', { class: 'set-head' }, h('h2', { id: `set-${id}-t` }, title), desc ? h('p', {}, desc) : null),
      body);
    sections[id] = { el, body };
  }
  if (!sections[id].el.isConnected) add(root, sections[id].el);
  return sections[id].body;
}

function once(id, key, fn) {
  const k = JSON.stringify(key);
  if (lastKey[id] === k) return;
  lastKey[id] = k;
  fn();
}

export function resetSettingsCache() {
  for (const k of Object.keys(lastKey)) delete lastKey[k];
}

// ---------------- 账号 ----------------
const VSTATUS = { ok: ['已通过 Brightspace 姓名校验', 'ok'], mismatch: ['姓名和 Brightspace 不一致', 'danger'], taken: ['Brightspace 账号已被别人绑定', 'danger'], pending: ['等待 Brightspace 姓名校验', 'neutral'] };

function verifyLine(u) {
  const v = u.verify || { status: 'pending' };
  const [label, tone] = VSTATUS[v.status] || VSTATUS.pending;
  return h('div', { class: 'verify-line' }, h('span', { class: `chip ${tone}` }, label),
    v.bsName ? h('span', { class: 'muted' }, `Brightspace：${v.bsName}${v.uniqueName ? `（${v.uniqueName}）` : ''}`) : null,
    v.status !== 'ok' && v.reason ? h('span', { class: 'muted' }, v.reason) : null);
}

function remindersBox(c, ctx) {
  const u = c.user;
  const r = u.reminders || { h24: true, h3: true };
  const save = async (patch) => {
    try {
      const out = await cloud.updateProfile(c.server, c.token, { reminders: { ...r, ...patch } });
      await ctx.store.set({ cloud: { ...ctx.state.cloud, user: out.user } });
      toast('已保存');
    } catch (e) { toast(`没保存上：${e.message}`); }
  };
  const box = (key, label) => {
    const input = h('input', { type: 'checkbox', checked: r[key] !== false });
    input.addEventListener('change', () => save({ [key]: input.checked }));
    return h('label', { class: 'check-row' }, input, h('span', {}, h('b', {}, label)));
  };
  return h('div', { class: 'reminder-box' },
    h('div', { class: 'reminder-head' }, h('strong', {}, '邮件提醒'), h('span', { class: 'muted' }, `发到 ${u.email}，没交的作业 / 测验才会提醒；电脑关机也照样发`)),
    box('h24', '截止前 24 小时'),
    box('h3', '截止前 3 小时'),
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn small', onClick: async (e) => {
      e.currentTarget.disabled = true;
      try { await cloud.testEmail(c.server, c.token); toast(`测试邮件已发到 ${u.email}，没收到就看看垃圾邮件`); } catch (x) { toast(x.message); }
    } }, '发一封测试邮件')));
}
let authMode = 'login';
let serverInfo = null;

async function fetchInfo(server) {
  try {
    serverInfo = { server, ...(await cloud.info(server)) };
  } catch (e) {
    serverInfo = { server, error: e.message };
  }
  return serverInfo;
}

function renderAccount(body, ctx) {
  const c = ctx.state.cloud;
  if (c?.token && c.user) {
    const u = c.user;
    const base = normalizeServer(c.server);
    fill(body, 
      h('div', { class: 'acct' },
        h('span', { class: 'avatar big', style: '--cc:#57068C' }, initials(u.name)),
        h('div', { class: 'acct-main' },
          h('strong', {}, u.name, u.role === 'admin' ? h('span', { class: 'chip accent', style: 'margin-left:8px' }, '管理员') : null),
          h('span', { class: 'muted' }, u.email),
          h('span', { class: 'muted' }, `服务器：${base} · ${c.lastCloudSync ? `${new Date(c.lastCloudSync).toLocaleString()} 云同步` : '还没云同步过'}`),
          c.error ? h('span', { class: 'err' }, c.error) : null)),
      verifyLine(u),
      remindersBox(c, ctx),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onClick: async (e) => {
          e.currentTarget.disabled = true;
          const r = await ctx.store.cloudSync();
          toast(r?.ok ? '云同步完成' : `云同步失败：${r?.error || ''}`);
        } }, icon(I.refresh, 15), '立即云同步'),
        h('a', { class: 'btn', href: `${base}/m/`, target: '_blank', rel: 'noopener' }, '打开手机版'),
        u.role === 'admin' ? h('a', { class: 'btn', href: `${base}/admin/`, target: '_blank', rel: 'noopener' }, '打开管理后台') : null,
        h('button', { type: 'button', class: 'btn', onClick: () => passwordDialog(c) }, '修改密码'),
        h('button', { type: 'button', class: 'btn', onClick: async () => {
          if (!(await confirmDialog({ title: '退出登录？', body: REQUIRE_LOGIN ? '退出后要重新登录才能继续使用课程助手。' : '本机的数据和设置会保留，只是不再云同步。', ok: '退出登录' }))) return;
          await cloud.logout(c.server, c.token);
          await ctx.store.set({ cloud: { server: c.server, token: null, user: null } });
          toast('已退出登录');
        } }, '退出登录')),
      h('p', { class: 'hint' }, '云同步的内容：截止事项、课程列表、课件目录、"标记完成"记录、课程设置。Brightspace 的登录信息不会上传。'));
    return;
  }

  const server = c?.server || DEFAULT_SERVER || '';
  const form = h('form', { class: 'auth-form', novalidate: true });
  const err = h('p', { class: 'form-error', role: 'alert' }, c?.error || '');
  const serverInput = h('input', { name: 'server', type: 'url', placeholder: 'https://study.example.com', value: server, autocomplete: 'url', required: true });
  const bs = ctx.state.data?.user;
  const inviteField = h('label', { class: 'field' }, h('span', {}, '邀请码'), h('input', { name: 'invite', placeholder: '找管理员要，例如 ABCD-2345', autocomplete: 'off' }));
  const infoLine = h('p', { class: 'hint' });

  const updateInfo = async () => {
    infoLine.textContent = '';
    let url;
    try { url = normalizeServer(serverInput.value); } catch (e) { infoLine.textContent = e.message; return; }
    if (!url) return;
    const info = serverInfo?.server === url ? serverInfo : await fetchInfo(url);
    if (info.error) { infoLine.textContent = `连不上这个服务器：${info.error}`; return; }
    inviteField.hidden = authMode !== 'register' || info.registration !== 'invite';
    if (info.firstUser) infoLine.textContent = '这个服务器还没有人注册，第一个注册的人会成为管理员。';
    else if (authMode === 'register' && info.registration === 'closed') infoLine.textContent = '管理员关闭了注册。';
    else infoLine.textContent = `已连接：${info.name} v${info.version}${info.announcement ? ` · ${info.announcement}` : ''}`;
  };
  serverInput.addEventListener('change', updateInfo);

  const reg = authMode === 'register';
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '登录或注册' },
    h('button', { type: 'button', 'aria-pressed': String(!reg), onClick: () => { authMode = 'login'; lastKey.account = null; ctx.rerender(); } }, '登录'),
    h('button', { type: 'button', 'aria-pressed': String(reg), onClick: () => { authMode = 'register'; lastKey.account = null; ctx.rerender(); } }, '注册'));

  add(form, 
    DEFAULT_SERVER ? null : h('label', { class: 'field' }, h('span', {}, '服务器地址'), serverInput),
    reg ? h('label', { class: 'field' }, h('span', {}, 'First name（和 Brightspace 一致）'), h('input', { name: 'firstName', maxlength: 40, autocomplete: 'given-name', value: bs?.firstName || '' })) : null,
    reg ? h('label', { class: 'field' }, h('span', {}, 'Last name（和 Brightspace 一致）'), h('input', { name: 'lastName', maxlength: 40, autocomplete: 'family-name', value: bs?.lastName || '' })) : null,
    h('label', { class: 'field' }, h('span', {}, '邮箱'), h('input', { name: 'email', type: 'email', autocomplete: 'username', required: true })),
    h('label', { class: 'field' }, h('span', {}, reg ? '密码（至少 8 位）' : '密码'), h('input', { name: 'password', type: 'password', autocomplete: reg ? 'new-password' : 'current-password', required: true })),
    reg ? inviteField : null,
    err,
    h('button', { type: 'submit', class: 'btn primary' }, reg ? '注册并登录' : '登录'));
  inviteField.hidden = true;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const f = new FormData(form);
    let url;
    try { url = normalizeServer(f.get('server')); } catch (x) { err.textContent = x.message; return; }
    if (!url) { err.textContent = '先填服务器地址'; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const body = { email: f.get('email'), password: f.get('password') };
      const r = reg ? await cloud.register(url, { ...body, firstName: f.get('firstName'), lastName: f.get('lastName'), invite: f.get('invite'), lang: getLang() }) : await cloud.login(url, body);
      await ctx.store.set({ cloud: { server: url, token: r.token, user: r.user, flags: r.flags || {}, error: null } });
      toast(reg ? `注册成功，欢迎 ${r.user.name}` : `欢迎回来，${r.user.name}`);
      ctx.store.sync();
    } catch (x) {
      err.textContent = x.message;
      if (x.code === 'INVITE_REQUIRED') inviteField.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  fill(body, 
    h('p', { class: 'hint' }, REQUIRE_LOGIN ? '登录后"标记完成"和课程设置会云同步，手机上也能看截止时间，还能收到截止提醒邮件。' : '只在本机用的话不需要登录，所有功能都能正常使用。部署了自己的服务器后，登录可以让"标记完成"和课程设置云同步，手机上也能看截止时间。'),
    seg, infoLine, form);
  if (serverInput.value) updateInfo();
}

function passwordDialog(c) {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', { class: 'auth-form' },
    h('h2', {}, '修改密码'),
    h('label', { class: 'field' }, h('span', {}, '原密码（管理员重置过的话填临时密码）'), h('input', { name: 'old', type: 'password', autocomplete: 'current-password', required: true })),
    h('label', { class: 'field' }, h('span', {}, '新密码（至少 8 位）'), h('input', { name: 'new', type: 'password', autocomplete: 'new-password', required: true })),
    err,
    h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn', value: 'cancel', onClick: () => dlg.close() }, '取消'), h('button', { type: 'submit', class: 'btn primary' }, '保存')));
  const dlg = h('dialog', { class: 'dialog' }, form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      await cloud.changePassword(c.server, c.token, { oldPassword: f.get('old'), newPassword: f.get('new') });
      dlg.close();
      toast('密码已修改，其他设备已退出登录');
    } catch (x) { err.textContent = x.message; }
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ---------------- 课程管理 ----------------
export async function setCourseSynced(ctx, course, on) {
  const s = ctx.state.settings || {};
  const hidden = new Set(s.hiddenCourseIds || []);
  const added = new Set(s.addedCourseIds || []);
  if (on) {
    hidden.delete(course.id);
    if (!course.auto) added.add(course.id);
  } else {
    added.delete(course.id);
    if (course.auto !== false) hidden.add(course.id);
  }
  await ctx.store.set({ settings: { ...s, hiddenCourseIds: [...hidden], addedCourseIds: [...added] }, settingsAt: Date.now() });
  ctx.scheduleResync();
}

function termLabel(c) {
  if (!c.start && !c.end) return '';
  const f = (iso) => { const d = new Date(iso); return `${d.getFullYear()}/${d.getMonth() + 1}`; };
  return [c.start && f(c.start), c.end && f(c.end)].filter(Boolean).join(' – ');
}

function renderCourses(body, ctx) {
  const d = ctx.state.data;
  const s = ctx.state.settings || {};
  const hidden = new Set(s.hiddenCourseIds || []);
  const added = new Set(s.addedCourseIds || []);
  let all = d?.allCourses;
  if (!all) all = (d?.courses || []).map((c) => ({ ...c, auto: true, current: true }));
  if (!all.length) { fill(body, h('p', { class: 'hint' }, '第一次同步后这里会列出你在 Brightspace 上的所有课程。')); return; }
  const colors = courseColorMap(d?.courses || []);
  const isOn = (c) => !hidden.has(c.id) && (c.auto || added.has(c.id));
  const q = h('input', { type: 'search', placeholder: '搜索课程名或课号…', class: 'mini-search', 'aria-label': '搜索课程' });
  const listBox = h('div', { class: 'course-manage' });
  const draw = () => {
    const needle = q.value.trim().toLowerCase();
    const filt = all.filter((c) => !needle || `${c.name} ${c.code}`.toLowerCase().includes(needle));
    const groups = [['正在同步', filt.filter(isOn)], ['本学期 · 未同步', filt.filter((c) => !isOn(c) && c.current)], ['其他学期 / 其他', filt.filter((c) => !isOn(c) && !c.current)]];
    fill(listBox, ...groups.filter(([, l]) => l.length).map(([label, list]) => h('div', { class: 'cm-group' },
      h('div', { class: 'cm-label' }, `${label} · ${list.length}`),
      ...list.map((c) => {
        const on = isOn(c);
        return h('div', { class: 'cm-row' },
          h('span', { class: 'avatar', style: `--cc:${colors[c.id] || '#8a8494'}` }, initials(c.name)),
          h('div', { class: 'cm-main' },
            h('span', { class: 'cm-name' }, c.name),
            h('span', { class: 'muted' }, [c.code, termLabel(c), c.auto ? '自动识别为本学期' : added.has(c.id) ? '你手动添加的' : ''].filter(Boolean).join(' · '))),
          h('button', {
            type: 'button', class: `btn small ${on ? '' : 'primary'}`,
            onClick: async () => {
              if (on && !(await confirmDialog({ title: `移除「${c.name}」？`, body: '移除后不再同步这门课的截止时间和课件，侧边栏里也不显示。随时可以加回来。', ok: '移除', danger: true }))) return;
              await setCourseSynced(ctx, c, !on);
              toast(on ? `已移除 ${c.name}` : `已添加 ${c.name}，正在同步…`);
            }
          }, on ? '移除' : '添加'));
      }))));
  };
  q.addEventListener('input', draw);
  draw();
  fill(body, 
    h('div', { class: 'cm-top' }, q, h('span', { class: 'hint' }, `共 ${all.length} 门 · 最多同步 25 门`)),
    listBox);
}

// ---------------- 通知 / 诊断 / 更新日志 ----------------
function renderNotify(body, ctx) {
  const s = ctx.state.settings || {};
  const row = (key, label, hint, def = true) => {
    const input = h('input', { type: 'checkbox', checked: def ? s[key] !== false : !!s[key] });
    input.addEventListener('change', () => ctx.store.set({ settings: { ...(ctx.state.settings || {}), [key]: input.checked }, settingsAt: Date.now() }));
    return h('label', { class: 'check-row' }, input, h('span', {}, h('b', {}, label), hint ? h('span', { class: 'muted' }, ` · ${hint}`) : null));
  };
  fill(body,
    row('notifyPlan', '每天早上的今日计划', '8 点以后第一次同步时，告诉你今天先做哪几件'),
    row('notify', '快到期提醒', '24 小时内到期的事项各提醒一次；Brightspace 登录过期时提醒重新登录'),
    row('notifyUpdates', '动态提醒', '新公告、新课件、课件更新、截止时间改动、新作业、出分'),
    row('autoApplyUpdate', '自动安装插件更新', '关闭时：检测到新版本先弹窗问你，点"立即更新"才更新', false),
    syncEveryRow(s, ctx));
}

function syncEveryRow(s, ctx) {
  const cur = [5, 10, 30].includes(s.syncEvery) ? s.syncEvery : 10;
  const sel = h('select', { class: 'mini-select', 'aria-label': '自动同步间隔' }, ...[5, 10, 30].map((m) => h('option', { value: m, selected: m === cur }, `每 ${m} 分钟`)));
  sel.addEventListener('change', () => ctx.store.set({ settings: { ...(ctx.state.settings || {}), syncEvery: Number(sel.value) }, settingsAt: Date.now() }));
  return h('div', { class: 'check-row sync-every' },
    h('span', {}, h('b', {}, '自动同步'), h('span', { class: 'muted' }, ' · 另外打开插件、在 Brightspace 交完作业、电脑从休眠回来时也会马上同步')),
    sel);
}

function renderDiag(body, ctx) {
  const d = ctx.state.data;
  const info = [];
  if (d) {
    info.push(`上次同步 ${new Date(d.lastSync).toLocaleString()}`, `${d.items.length} 项截止`, `请求 ${d.requestCount} 次`);
    if (d.usingFallback) info.push('通过已打开的 Brightspace 标签页同步');
    if (d.warnings?.length) info.push(`${d.warnings.length} 条提示：${d.warnings.slice(0, 3).join('；')}`);
  }
  fill(body, 
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', onClick: ctx.copyDiagnostics }, '复制诊断信息'),
      h('span', { class: 'hint' }, '某项状态不对时，点这个再粘贴给开发者，里面有每一项的判断依据。')),
    h('p', { class: 'muted-line' }, info.join(' · ') || '还没同步过'));
}

function renderChangelog(body, ctx) {
  fill(body,
    h('div', { class: 'btn-row' },
      h('span', { class: 'hint' }, `当前版本 ${ctx.store.version()}`),
      h('button', { type: 'button', class: 'btn small', title: '检测到更新后没反应时点这里', onClick: () => ctx.store.reload() }, icon(I.refresh, 14), '重新加载插件')),
    h('p', { class: 'hint' }, '热更新：电脑每分钟从 GitHub 拉取新版本，插件发现后弹出"检测到更新"，点"立即更新"几秒钟就好，不用重新装。'),
    ...VERSION_NOTES.filter((n) => getLang() !== 'en' || n.en).map((n) => {
      const en = getLang() === 'en' && n.en;
      // 没有英文版的旧说明保持中文原文（不做逐词替换）
      return h('div', { class: 'log' }, h('strong', {}, `v${n.v}`), h('span', { class: 'muted' }, ` · ${n.d}`),
        h('ul', {}, ...(en || n.items).map((x) => h('li', {}, x))));
    }),
    getLang() === 'en' ? h('p', { class: 'hint' }, 'Notes for earlier versions are available in Chinese only.') : null);
}

// ---------------- 语言 ----------------
function renderLang(body, ctx) {
  const cur = getLang();
  const pick = async (l) => {
    if (l === cur) return;
    await ctx.store.set({ settings: { ...(ctx.state.settings || {}), lang: l }, settingsAt: Date.now() });
    const c = ctx.state.cloud;
    if (c?.token) { try { await cloud.updateProfile(c.server, c.token, { lang: l }); } catch { /* 下次同步再说 */ } }
    location.reload();
  };
  fill(body,
    h('div', { class: 'seg lang-seg', role: 'group', 'aria-label': 'Language', 'data-no-tr': '' },
      h('button', { type: 'button', 'aria-pressed': String(cur === 'zh'), onClick: () => pick('zh') }, '中文'),
      h('button', { type: 'button', 'aria-pressed': String(cur === 'en'), onClick: () => pick('en') }, 'English')),
    h('p', { class: 'hint' }, '界面语言，切换后立即生效；提醒邮件也会用这个语言。'));
}

/** ctx: { state, store, rerender, scheduleResync, copyDiagnostics } */
export function renderSettingsView(root, ctx) {
  const st = ctx.state;
  once('courses', [st.data?.allCourses, st.data?.courses?.map((c) => c.id), st.settings?.hiddenCourseIds, st.settings?.addedCourseIds], () =>
    renderCourses(section(root, 'courses', '课程管理', '移除不重要的课（比如社团、培训类"课程"），或者把没被自动识别的课加回来。改完会自动重新同步截止时间和课件。'), ctx));
  section(root, 'courses', '课程管理');
  once('lang', [getLang()], () => renderLang(section(root, 'lang', '语言 / Language'), ctx));
  section(root, 'lang', '语言 / Language');
  once('notify', [st.settings?.notify, st.settings?.notifyPlan, st.settings?.notifyUpdates, st.settings?.autoApplyUpdate, st.settings?.syncEvery], () => renderNotify(section(root, 'notify', '通知'), ctx));
  section(root, 'notify', '通知');
  once('account', [st.cloud?.token, st.cloud?.user, st.cloud?.error, st.cloud?.lastCloudSync, authMode], () =>
    renderAccount(section(root, 'account', (REQUIRE_LOGIN ? '账号与邮件提醒' : '账号与云同步（可选）'), null), ctx));
  section(root, 'account', (REQUIRE_LOGIN ? '账号与邮件提醒' : '账号与云同步（可选）'));
  once('diag', [st.data?.lastSync, st.data?.warnings], () => renderDiag(section(root, 'diag', '诊断'), ctx));
  section(root, 'diag', '诊断');
  once('log', [1], () => renderChangelog(section(root, 'log', '更新日志'), ctx));
  section(root, 'log', '更新日志');
}
