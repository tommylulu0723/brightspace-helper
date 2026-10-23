// 登录 / 注册 / Brightspace 姓名校验的全屏页面（要求登录时，没通过就只显示这个）
import { h, fill, add, icon, I, toast } from './ui.js';
import { cloud, normalizeServer } from '../lib/cloud.js';
import { DEFAULT_SERVER } from '../config.js';
import { BASE_URL } from '../lib/api.js';
import { getLang } from '../lib/i18n.js';

let mode = 'login';
let prefill = null; // 从"注册"切到"登录"时带过去的邮箱和提示
let lastKey = '';
let info = null;

async function loadInfo(server) {
  try { info = { server, ...(await cloud.info(server)) }; } catch (e) { info = { server, error: e.message }; }
  return info;
}

function card(...children) {
  return h('div', { class: 'gate-card' },
    h('div', { class: 'gate-brand' }, h('span', { class: 'logo' }, icon(I.book, 18)), h('strong', {}, '课程助手')),
    ...children);
}

function accountLine(ctx) {
  const c = ctx.state.cloud;
  return h('p', { class: 'gate-foot' },
    c?.user ? `已登录 ${c.user.email} · ` : '',
    c?.user ? h('button', { type: 'button', class: 'link-btn', onClick: async () => {
      await cloud.logout(c.server, c.token);
      await ctx.store.set({ cloud: { server: c.server, token: null, user: null } });
      lastKey = '';
    } }, '退出登录') : null,
    c?.user ? ' · ' : '',
    ctx.openFeedback ? h('button', { type: 'button', class: 'link-btn', onClick: () => ctx.openFeedback() }, '遇到问题？反馈') : null);
}

function authForm(ctx) {
  const server = ctx.state.cloud?.server || DEFAULT_SERVER;
  const bs = ctx.state.data?.user;
  const reg = mode === 'register';
  const err = h('p', { class: 'form-error', role: 'alert' }, prefill?.msg || ctx.state.cloud?.error || '');
  const invite = h('label', { class: 'field' }, h('span', {}, '邀请码'), h('input', { name: 'invite', placeholder: '找管理员要，例如 ABCD-2345', autocomplete: 'off' }));
  invite.hidden = !(reg && info?.registration === 'invite');
  const form = h('form', { class: 'auth-form', novalidate: true });
  add(form,
    reg ? h('div', { class: 'name-row' },
      h('label', { class: 'field' }, h('span', {}, 'First name'), h('input', { name: 'firstName', autocomplete: 'given-name', required: true, value: bs?.firstName || '' })),
      h('label', { class: 'field' }, h('span', {}, 'Last name'), h('input', { name: 'lastName', autocomplete: 'family-name', required: true, value: bs?.lastName || '' }))) : null,
    reg ? h('div', { class: 'tip warn', role: 'note' },
      h('b', {}, '⚠ 姓名必须和 Brightspace 上完全一致'),
      h('span', {}, bs?.firstName
        ? `你的 Brightspace 显示的是：${bs.firstName} ${bs.lastName}。英文名、拼写和顺序都要一样，不一致的话注册后也无法使用。`
        : '包括英文名、拼写和顺序。插件会自动核对，不一致的话注册后也无法使用。')) : null,
    h('label', { class: 'field' }, h('span', {}, '邮箱'), h('input', { name: 'email', type: 'email', autocomplete: 'username', required: true, value: prefill?.email || '' })),
    reg ? h('p', { class: 'hint tight' }, '截止提醒会发到这个邮箱（截止前 24 小时和 3 小时），也用它登录。') : null,
    h('label', { class: 'field' }, h('span', {}, reg ? '密码（至少 8 位）' : '密码'), h('input', { name: 'password', type: 'password', autocomplete: reg ? 'new-password' : 'current-password', required: true })),
    invite,
    err,
    h('button', { type: 'submit', class: 'btn primary big' }, reg ? '注册' : '登录'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const f = new FormData(form);
    let url;
    try { url = normalizeServer(server); } catch (x) { err.textContent = x.message; return; }
    if (reg && (!String(f.get('firstName')).trim() || !String(f.get('lastName')).trim())) { err.textContent = 'First name 和 Last name 都要填'; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = reg ? '正在注册…' : '正在登录…';
    try {
      const body = { email: f.get('email'), password: f.get('password') };
      const r = reg
        ? await cloud.register(url, { ...body, firstName: f.get('firstName'), lastName: f.get('lastName'), invite: f.get('invite'), lang: getLang() })
        : await cloud.login(url, body);
      await ctx.store.set({ cloud: { server: url, token: r.token, user: r.user, flags: r.flags || {}, error: null } });
      toast(reg ? `注册成功，正在和 Brightspace 核对姓名…` : `欢迎回来，${r.user.firstName || r.user.name}`);
      lastKey = '';
      ctx.store.sync(); // 读一次 Brightspace，同步完自动核对姓名
    } catch (x) {
      // 邮箱已经注册过：直接用这个邮箱和密码登录；密码不对就切到登录页、把邮箱填好
      if (reg && x.status === 409) {
        try {
          const r = await cloud.login(url, { email: f.get('email'), password: f.get('password') });
          await ctx.store.set({ cloud: { server: url, token: r.token, user: r.user, flags: r.flags || {}, error: null } });
          toast(`这个邮箱已经注册过，已帮你登录：${r.user.firstName || r.user.name}`);
          lastKey = '';
          ctx.store.sync();
          return;
        } catch {
          mode = 'login'; prefill = { email: f.get('email'), msg: '这个邮箱已经注册过了，请输入当时设置的密码登录。' };
          lastKey = ''; ctx.rerender();
          return;
        }
      }
      err.textContent = x.message;
      if (x.code === 'INVITE_REQUIRED' || x.code === 'INVITE_INVALID') invite.hidden = false;
      btn.disabled = false;
      btn.textContent = reg ? '注册' : '登录';
    }
  });

  return card(
    h('h1', {}, reg ? '注册课程助手' : '登录课程助手'),
    h('p', { class: 'gate-sub' }, reg ? '注册后用 Brightspace 核对一次姓名就能用了。' : '只有登录并通过 Brightspace 姓名校验的同学才能使用。'),
    h('div', { class: 'seg', role: 'group', 'aria-label': '登录或注册' },
      h('button', { type: 'button', 'aria-pressed': String(!reg), onClick: () => { mode = 'login'; lastKey = ''; ctx.rerender(); } }, '登录'),
      h('button', { type: 'button', 'aria-pressed': String(reg), onClick: () => { mode = 'register'; lastKey = ''; if (!info) loadInfo(normalizeServer(server)).then(() => { lastKey = ''; ctx.rerender(); }); ctx.rerender(); } }, '注册')),
    form,
    info?.announcement ? h('p', { class: 'hint' }, `📣 ${info.announcement}`) : null,
    accountLine(ctx));
}

function message(ctx, { tone, title, body, actions = [] }) {
  return card(
    h('div', { class: `gate-icon ${tone}` }, icon(tone === 'ok' ? I.check : tone === 'danger' ? I.x : I.clock, 22)),
    h('h1', {}, title),
    ...[].concat(body).map((b) => (b instanceof Node ? b : h('p', { class: 'gate-sub' }, b))),
    actions.length ? h('div', { class: 'gate-actions' }, ...actions) : null,
    accountLine(ctx));
}

/** gate: { state, reason }；返回 true 表示已经画了门禁页 */
export function renderGate(root, ctx, gate) {
  const u = ctx.state.cloud?.user;
  const bs = ctx.state.data?.user;
  const syncing = ctx.state.status?.state === 'syncing';
  const bsAuth = ctx.state.status?.state === 'error' && ctx.state.status?.error?.code === 'AUTH_REQUIRED';
  // 登录页只在切换登录 / 注册、出错时重画，避免同步状态变化把正在输入的内容清掉
  const key = gate.state === 'login'
    ? JSON.stringify(['login', mode, !!info, ctx.state.cloud?.error, bs?.firstName])
    : JSON.stringify([gate.state, gate.reason, u?.email, u?.verify?.status, bs?.id, syncing, bsAuth]);
  if (key === lastKey && root.childElementCount) return;
  lastKey = key;

  if (gate.state === 'login') {
    if (!info && DEFAULT_SERVER) loadInfo(normalizeServer(DEFAULT_SERVER)).then(() => { lastKey = ''; ctx.rerender(); });
    fill(root, authForm(ctx));
    return;
  }
  const retry = h('button', { type: 'button', class: 'btn', disabled: syncing, onClick: () => ctx.store.sync() }, icon(I.refresh, 15), syncing ? '正在读取…' : '重新检查');
  if (gate.state === 'needBrightspace') {
    fill(root, message(ctx, {
      tone: 'wait', title: '还差一步：登录 Brightspace',
      body: [`你好 ${u?.firstName || u?.name || ''}！课程助手要读一下 Brightspace 上你的姓名，确认和注册的（${u?.name || ''}）一致。`,
        bsAuth ? 'Brightspace 还没登录或登录已过期，点下面的按钮去登录，登录完回来点"重新检查"。' : '正在读取 Brightspace…如果一直没反应，先确认 Brightspace 已经登录。'],
      actions: [h('a', { class: 'btn primary', href: `${BASE_URL}/d2l/home`, target: '_blank', rel: 'noopener' }, icon(I.external, 15), '打开 Brightspace 登录'), retry]
    }));
    return;
  }
  if (gate.state === 'checking') {
    fill(root, message(ctx, {
      tone: 'wait', title: '正在核对姓名…',
      body: [`Brightspace 上的姓名：${bs?.firstName || ''} ${bs?.lastName || ''}`, '连不上服务器时会一直停在这里，检查一下网络再点重新检查。'],
      actions: [h('button', { type: 'button', class: 'btn', onClick: () => ctx.store.cloudSync() }, icon(I.refresh, 15), '重新检查')]
    }));
    return;
  }
  if (gate.state === 'taken') {
    fill(root, message(ctx, {
      tone: 'danger', title: '这个 Brightspace 账号已经被绑定了',
      body: ['每个 Brightspace 账号只能绑定一个课程助手账号。如果之前用别的邮箱注册过，请用那个邮箱登录；如果不是你注册的，请联系管理员。'],
      actions: [retry]
    }));
    return;
  }
  // mismatch
  const differentAccount = /不是同一个人/.test(gate.reason || '');
  fill(root, message(ctx, {
    tone: 'danger', title: differentAccount ? 'Brightspace 账号不对' : '姓名和 Brightspace 不一致',
    body: [
      differentAccount
        ? '现在 Chrome 里登录的 Brightspace 账号，和你课程助手账号绑定的不是同一个人。请换回你自己的 Brightspace 账号登录。'
        : '课程助手只给本人使用：注册时填的姓名必须和 Brightspace 上的一模一样。',
      h('div', { class: 'name-compare' },
        h('div', {}, h('span', {}, '注册的姓名'), h('b', {}, u?.name || '—')),
        h('div', {}, h('span', {}, 'Brightspace 上的姓名'), h('b', {}, bs ? `${bs.firstName} ${bs.lastName}` : u?.verify?.bsName || '—'))),
      differentAccount || !bs?.firstName ? '' : '注册时名字填错了？点下面的按钮，把注册的姓名改成和 Brightspace 一样，马上重新核对。'
    ].filter(Boolean),
    actions: [
      differentAccount ? h('a', { class: 'btn primary', href: `${BASE_URL}/d2l/home`, target: '_blank', rel: 'noopener' }, icon(I.external, 15), '打开 Brightspace') : null,
      !differentAccount && bs?.firstName ? h('button', { type: 'button', class: 'btn primary', onClick: async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        b.textContent = '正在修改…';
        const c = ctx.state.cloud;
        try {
          const out = await cloud.updateProfile(c.server, c.token, { firstName: bs.firstName, lastName: bs.lastName });
          await ctx.store.set({ cloud: { ...c, user: out.user } });
          lastKey = '';
          await ctx.store.verify();
          toast(`已改成 ${bs.firstName} ${bs.lastName}，正在重新核对…`);
        } catch (x) {
          toast(x.message);
          b.disabled = false;
          b.textContent = `改成 ${bs.firstName} ${bs.lastName}`;
        }
      } }, `改成 ${bs.firstName} ${bs.lastName}`) : null,
      retry
    ].filter(Boolean)
  }));
}

export function resetGate() { lastKey = ''; }
