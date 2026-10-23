// 反馈 / 报告问题：写一句话，自动附上诊断信息，发到管理后台；还能看到管理员的回复
import { h, toast } from './ui.js';
import { cloud } from '../lib/cloud.js';
import { DEFAULT_SERVER } from '../config.js';
import { getLang } from '../lib/i18n.js';

/** 诊断信息：课程、截止事项的判断依据、同步状态（不含任何密码 / 登录信息） */
export function buildDiagnostics(state, store) {
  const d = state.data;
  const names = Object.fromEntries([...(d?.allCourses || []), ...(d?.courses || [])].map((c) => [c.id, c.name]));
  const report = {
    version: store.version(),
    lang: getLang(),
    browser: navigator.userAgent,
    lastSync: d?.lastSync, status: state.status, requestCount: d?.requestCount, usingFallback: d?.usingFallback,
    warnings: d?.warnings,
    account: state.cloud?.token ? { user: state.cloud.user?.email, verify: state.cloud.user?.verify?.status, error: state.cloud.error, verifyError: state.cloud.verifyError, lastCloudSync: state.cloud.lastCloudSync } : null,
    courses: { syncing: (d?.courses || []).map((c) => c.name), hidden: state.settings?.hiddenCourseIds, added: state.settings?.addedCourseIds },
    items: (d?.items || []).map((it) => ({ course: names[it.courseId], title: it.title, type: it.type, due: it.due, status: it.status, manual: state.overrides?.[it.id] ?? null, sources: it.sources, signals: it.signals, custom: it.custom || undefined })),
    materials: Object.fromEntries(Object.entries(d?.materials || {}).map(([k, m]) => [names[k] || k, { files: m.files, lectures: m.lectures, modules: m.modules?.length }]))
  };
  // 太大就去掉每一项的判断依据（一般不会）
  if (JSON.stringify(report).length > 400 * 1024) report.items = report.items.map(({ signals, ...rest }) => rest);
  return report;
}

const KIND_LABEL = { bug: '遇到问题', idea: '功能建议', other: '其他' };
const STATUS_LABEL = { open: '已收到', done: '已处理' };

export function openFeedback({ state, store, page = '' }) {
  const c = state.cloud;
  const loggedIn = !!(c?.token && c.user);
  let kind = 'bug';
  const err = h('p', { class: 'form-error', role: 'alert' });
  const kinds = h('div', { class: 'seg', role: 'group' });
  const paintKinds = () => kinds.replaceChildren(...Object.entries(KIND_LABEL).map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(kind === k), onClick: () => { kind = k; paintKinds(); } }, label)));
  paintKinds();
  const msg = h('textarea', { name: 'message', rows: 4, maxlength: 2000, required: true, placeholder: '比如：Web Design 的 Quiz 3 我已经交了，还显示没交' });
  const diag = h('input', { type: 'checkbox', checked: true });
  const contact = h('input', { name: 'contact', type: 'email', placeholder: 'you@nyu.edu' });
  const mine = h('div', { class: 'fb-mine' });
  const form = h('form', { method: 'dialog', class: 'custom-form' },
    h('h2', {}, '反馈 / 报告问题'),
    h('p', { class: 'hint' }, '写一句话说说遇到了什么，开发者会在后台看到并尽快处理。'),
    kinds,
    h('label', { class: 'field' }, h('span', {}, '发生了什么'), msg),
    loggedIn ? null : h('label', { class: 'field' }, h('span', {}, '你的邮箱（可选，方便回复你）'), contact),
    h('label', { class: 'check-row' }, diag, h('span', {}, h('b', {}, '附上诊断信息'), h('span', { class: 'muted' }, ' · 课程名、截止事项和同步状态，不包含任何密码'))),
    err,
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn', onClick: () => dlg.close() }, '取消'),
      h('button', { type: 'submit', class: 'btn primary' }, '发送')),
    loggedIn ? mine : null);
  const dlg = h('dialog', { class: 'dialog' }, form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const text = msg.value.trim();
    if (text.length < 2) { err.textContent = '先写一句话说说遇到了什么'; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '正在发送…';
    try {
      await cloud.feedback(c?.server || DEFAULT_SERVER, loggedIn ? c.token : null, {
        kind, message: text, contact: contact.value, version: store.version(), lang: getLang(), page,
        diagnostics: diag.checked ? buildDiagnostics(state, store) : null
      });
      dlg.close();
      toast('已发送，谢谢！处理后会在这里回复你');
    } catch (x) {
      err.textContent = x.message;
      btn.disabled = false;
      btn.textContent = '发送';
    }
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  msg.focus();

  // 之前提交过的反馈和回复
  if (loggedIn) {
    cloud.myFeedback(c.server, c.token).then(({ feedback = [] }) => {
      if (!feedback.length) return;
      mine.replaceChildren(h('h3', {}, '我之前的反馈'), ...feedback.slice(0, 5).map((f) => h('div', { class: 'fb-item' },
        h('div', { class: 'fb-top' }, h('span', { class: `chip ${f.status === 'done' ? 'ok' : 'neutral'}` }, STATUS_LABEL[f.status] || f.status), h('span', { class: 'muted' }, new Date(f.at).toLocaleDateString())),
        h('p', {}, f.message),
        f.reply ? h('p', { class: 'fb-reply' }, h('b', {}, '回复：'), f.reply) : null)));
    }).catch(() => {});
  }
}
