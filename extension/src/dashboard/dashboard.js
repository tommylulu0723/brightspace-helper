import {
  TYPE_LABEL, courseColorMap, isDone, isManualDone, formatDue, formatRelative, formatAgo,
  groupItems, groupOf, stats
} from '../lib/format.js';
import { isDoneStatus } from '../lib/merge.js';
import { buildIcs } from '../lib/ics.js';
import { BASE_URL } from '../lib/api.js';
import { downloadPath } from '../lib/materials.js';
import { createStore, KEYS } from '../store.js';
import { h, fill, add, icon, I, toast, initials, shortDate, EXT_COLOR, confirmDialog } from './ui.js';
import { renderSettingsView, setCourseSynced } from './settings.js';
import { buildPlan } from '../lib/plan.js';
import { buildFeed, FEED_FILTERS } from '../lib/feed.js';
import { UPDATE_KINDS } from '../lib/changes.js';
import { averagePct, gradeTone } from '../lib/extras.js';
import { gateState, isBlocking } from '../lib/gate.js';
import { withCustom, upsertCustom, removeCustom, pruneCustom, MINE, CUSTOM_TYPES } from '../lib/custom.js';
import { cloud as cloudApi } from '../lib/cloud.js';
import { renderGate, resetGate } from './gate.js';
import { REQUIRE_LOGIN } from '../config.js';
import { loadLang } from '../lang.js';
import { translatePage, getLang, setLang } from '../lib/i18n.js';

const store = createStore();
const $ = (id) => document.getElementById(id);
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const NEW_MS = 7 * 24 * 3600 * 1000;
const VIEWS = ['deadlines', 'updates', 'materials', 'grades', 'settings'];

let state = { data: null, status: {}, overrides: {}, settings: {}, cloud: null, updates: [], seenAt: 0 };
let viewSeenAt = null; // 打开动态页时的"已读"时间点：这次打开期间，新的那几条一直高亮
let ui = loadUi();
const moduleOpen = new Map();

function loadUi() {
  const d = { view: 'deadlines', course: 'all', type: 'all', hideDone: false, lectureOnly: false, feed: 'all', planOpen: true, q: '' };
  try { Object.assign(d, JSON.parse(localStorage.getItem('ui') || '{}')); } catch { /* ignore */ }
  const hash = location.hash.slice(1);
  if (VIEWS.includes(hash)) d.view = hash;
  d.q = '';
  return d;
}
function saveUi() {
  const { view, course, type, hideDone, lectureOnly, feed, planOpen } = ui;
  try { localStorage.setItem('ui', JSON.stringify({ view, course, type, hideDone, lectureOnly, feed, planOpen })); } catch { /* ignore */ }
}


// ---------------- 公共 ----------------
function courses() {
  const hidden = new Set(state.settings?.hiddenCourseIds || []);
  return (state.data?.courses || []).filter((c) => !c.hidden && !hidden.has(c.id));
}

function ctxFor(now) {
  const list = courses();
  const ids = new Set(list.map((c) => c.id));
  return {
    now,
    courses: list,
    colors: courseColorMap(state.data?.courses || []),
    names: Object.fromEntries([...(state.data?.allCourses || []), ...(state.data?.courses || [])].map((c) => [c.id, c.name])),
    items: (state.data?.items || []).filter((it) => ids.has(it.courseId))
  };
}

const appCtx = () => ({
  state, store,
  rerender: render,
  scheduleResync,
  copyDiagnostics,
  openSettings
});

function render() {
  const now = new Date();
  // 要求登录时：没登录 / 没通过 Brightspace 姓名校验，只显示登录页
  const gate = store.demo ? { state: 'ok' } : gateState({ requireLogin: REQUIRE_LOGIN, cloud: state.cloud, data: state.data });
  const locked = isBlocking(gate.state);
  ui.gate = gate;
  document.body.classList.toggle('locked', locked);
  $('gate').hidden = !locked;
  if (locked) {
    renderGate($('gate'), { state, store, rerender: render }, gate);
    return;
  }
  resetGate();
  if (!VIEWS.includes(ui.view)) ui.view = 'deadlines';
  const ctx = ctxFor(now);
  const ids = new Set(ctx.courses.map((c) => c.id));
  if (ui.course !== 'all' && !ids.has(ui.course)) ui.course = 'all';

  for (const [tab, view] of [['tabDeadlines', 'deadlines'], ['tabUpdates', 'updates'], ['tabMaterials', 'materials'], ['tabGrades', 'grades']]) $(tab).setAttribute('aria-selected', String(ui.view === view));
  $('viewDeadlines').hidden = ui.view !== 'deadlines';
  $('viewUpdates').hidden = ui.view !== 'updates';
  $('viewMaterials').hidden = ui.view !== 'materials';
  $('viewGrades').hidden = ui.view !== 'grades';
  $('viewSettings').hidden = ui.view !== 'settings';
  $('side').hidden = ui.view === 'settings';
  $('searchBox').hidden = ui.view === 'settings' || ui.view === 'grades';
  document.body.dataset.view = ui.view;
  $('q').placeholder = ui.view === 'materials' ? '搜索课件…' : ui.view === 'updates' ? '搜索公告、动态…' : '搜索作业、测验…';
  const unread = feedFor(new Set()).filter((e) => e.unread && Date.parse(e.at) > (state.seenAt || 0)).length;
  $('unreadBadge').hidden = !unread || ui.view === 'updates';
  $('unreadBadge').textContent = unread > 99 ? '99+' : String(unread);

  renderTop(now);
  renderBanner();
  renderSide(ctx);
  if (ui.view === 'deadlines') renderDeadlines(ctx);
  else if (ui.view === 'updates') renderUpdates(ctx);
  else if (ui.view === 'materials') renderMaterials(ctx);
  else if (ui.view === 'grades') renderGrades(ctx);
  else renderSettingsView($('settingsRoot'), appCtx());
}

function renderTop(now) {
  const st = state.status || {};
  const syncing = st.state === 'syncing';
  $('syncBtn').disabled = syncing;
  $('syncIcon').classList.toggle('spin', syncing);
  $('syncText').textContent = syncing ? '正在同步…' : state.data?.lastSync ? `${formatAgo(state.data.lastSync, now)}同步` : '尚未同步';
  const c = state.cloud;
  const btn = $('accountBtn');
  if (c?.token && c.user) {
    fill(btn, h('span', { class: 'avatar', style: '--cc:#57068C' }, initials(c.user.name)));
    btn.title = `${c.user.name} · 设置`;
    btn.classList.toggle('has-error', !!c.error);
  } else {
    fill(btn, icon(I.gear, 17), h('span', { class: 'account-label' }, c?.error ? '重新登录' : '设置'));
    btn.title = '设置与登录';
    btn.classList.toggle('has-error', !!c?.error);
  }
  btn.setAttribute('aria-pressed', String(ui.view === 'settings'));
}

let verifyTried = false;
function renderBanner() {
  const b = $('banner');
  const st = state.status || {};
  const g = ui.gate || { state: 'ok' };
  const syncing = st.state === 'syncing';
  // 登录了课程助手、但还没完成 Brightspace 姓名核对：照常使用，顶部提示进度
  if (g.state === 'needBrightspace' || g.state === 'checking') {
    const bsAuth = st.state === 'error' && st.error?.code === 'AUTH_REQUIRED';
    const vErr = state.cloud?.verifyError;
    const bs = state.data?.user;
    if (g.state === 'checking' && !verifyTried && !vErr) { verifyTried = true; store.verify(); }
    b.className = `banner ${bsAuth || vErr ? 'error' : 'info'}`;
    if (g.state === 'needBrightspace' && bsAuth) {
      fill(b, h('span', {}, h('b', {}, '还差一步：登录 Brightspace'), ' · 登录后课程助手会自动读取你的课程，并核对姓名。'),
        h('a', { class: 'btn small primary', href: `${BASE_URL}/d2l/home`, target: '_blank', rel: 'noopener' }, '打开 Brightspace 登录'));
    } else if (g.state === 'needBrightspace') {
      fill(b, h('span', {}, syncing ? '正在读取 Brightspace…' : '还没读取 Brightspace。确认 Chrome 里已经登录 Brightspace，然后点"读取"。'),
        syncing ? null : h('button', { type: 'button', class: 'btn small', onClick: () => doSync() }, '读取'));
    } else {
      fill(b, h('span', {}, vErr ? `核对姓名失败：${vErr}` : `正在核对姓名（Brightspace：${bs?.firstName || ''} ${bs?.lastName || ''}）…`),
        h('button', { type: 'button', class: 'btn small', onClick: async (e) => { e.currentTarget.disabled = true; await store.verify(); } }, '重试'));
    }
    b.hidden = false;
  } else if (st.state !== 'error') { b.hidden = true; fill(b, ); }
  else {
    b.className = 'banner error';
    if (st.error?.code === 'AUTH_REQUIRED') {
      fill(b, 
        h('span', {}, 'Brightspace 还没登录或登录已过期，暂时同步不了。登录后会自动继续。'),
        h('a', { class: 'btn small', href: `${BASE_URL}/d2l/home`, target: '_blank', rel: 'noopener' }, '打开 Brightspace 登录'));
    } else {
      fill(b, 
        h('span', {}, st.error?.code === 'OFFLINE' ? st.error.message : `同步失败：${st.error?.message || '未知错误'}`),
        h('button', { type: 'button', class: 'btn small', onClick: () => doSync() }, '重试'));
    }
    b.hidden = false;
  }
  const ann = state.cloud?.token ? state.cloud.announcement : '';
  const up = state.pendingUpdate;
  const a = $('announce');
  if (up) {
    a.className = 'banner update';
    fill(a,
      h('span', { class: 'up-text' },
        h('strong', {}, `检测到更新：${up.from} → ${up.to}`),
        up.notes?.length ? h('span', {}, ((getLang() === 'en' && up.notesEn) || up.notes).slice(0, 3).join(getLang() === 'en' ? '; ' : '；')) : null),
      h('button', { type: 'button', class: 'btn small primary', onClick: (e) => { e.target.disabled = true; e.target.textContent = '正在更新…'; store.applyUpdate(); setTimeout(() => location.reload(), 2500); } }, '立即更新'));
    a.hidden = false;
  } else {
    a.className = 'banner info';
    a.hidden = !ann;
    a.textContent = ann ? `📣 ${ann}` : '';
  }
}

function renderSide(ctx) {
  if (ui.view === 'settings') return;
  const name = state.cloud?.user?.name || state.data?.user?.name?.split(' ')[0];
  const hour = ctx.now.getHours();
  const greet = hour < 5 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  fill($('hello'), document.createTextNode(greet), h('strong', {}, name || '同学'));

  const count = (cid) => {
    if (ui.view === 'materials') {
      if (cid === 'all') return ctx.courses.reduce((n, c) => n + (state.data?.materials?.[c.id]?.files || 0), 0);
      return state.data?.materials?.[cid]?.files || 0;
    }
    if (ui.view === 'updates') {
      const seen = viewSeenAt ?? state.seenAt ?? 0;
      return feedFor(new Set()).filter((e) => (cid === 'all' || e.courseId === cid) && Date.parse(e.at) > seen).length || null;
    }
    if (ui.view === 'grades') {
      const g = state.data?.grades || {};
      if (cid === 'all') return null;
      const f = g[cid]?.final;
      const p = f?.pct ?? averagePct(g[cid]?.items);
      return p == null ? null : `${Math.round(p)}%`;
    }
    return ctx.items.filter((it) => (cid === 'all' || it.courseId === cid) && !isDone(it, state.overrides) && groupOf(it, ctx.now, false) !== 'unverified').length;
  };
  const list = [{ id: 'all', name: '全部课程' }, ...ctx.courses];
  fill($('courseList'), ...list.map((c) => {
    const n = count(c.id);
    return h('div', { class: 'course-item' },
      h('button', {
        type: 'button', class: 'course-btn', 'aria-pressed': String(ui.course === c.id), title: c.name,
        onClick: () => { ui.course = c.id; saveUi(); render(); }
      },
      h('span', { class: `avatar${c.id === 'all' ? ' all' : ''}`, style: c.id === 'all' ? null : `--cc:${ctx.colors[c.id]}` }, c.id === 'all' ? '全' : initials(c.name)),
      h('span', { class: 'name' }, c.name),
      n == null ? null : h('span', { class: 'count' }, String(n))),
      c.id === 'all' ? null : h('button', {
        type: 'button', class: 'course-x', 'aria-label': `移除课程：${c.name}`, title: '移除这门课',
        onClick: async () => {
          if (!(await confirmDialog({ title: `移除「${c.name}」？`, body: '不再同步这门课的截止时间和课件。之后可以在 设置 → 课程管理 里加回来。', ok: '移除', danger: true }))) return;
          await setCourseSynced(appCtx(), { ...c, auto: c.auto !== false }, false);
          toast(`已移除 ${c.name}`);
        }
      }, icon(I.x, 13)));
  }));
}

// ---------------- 截止时间 ----------------
function setDone(it, done) {
  const next = { ...state.overrides };
  for (const id of it.ids || [it.id]) delete next[id];
  if (done !== isDoneStatus(it.status)) next[it.id] = done;
  store.set({ overrides: next, overridesAt: Date.now() });
}

function renderDeadlines(ctx) {
  const { now, names, colors } = ctx;
  const ov = state.overrides;
  const data = state.data;
  const byCourse = ctx.items.filter((it) => ui.course === 'all' || it.courseId === ui.course);
  const q = ui.q.trim().toLowerCase();
  const filtered = byCourse.filter((it) => {
    if (ui.type !== 'all' && it.type !== ui.type) return false;
    if (ui.hideDone && isDone(it, ov)) return false;
    if (q && !`${it.title} ${names[it.courseId] || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const label = ui.course === 'all' ? `全部 ${ctx.courses.length} 门课` : names[ui.course];
  $('subtitle').textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 ${WEEKDAY[now.getDay()]} · ${label}`;
  const s = stats(byCourse, now, ov);
  $('statOpen').textContent = data ? s.open : '–';
  $('statSoon').textContent = data ? s.soon : '–';
  $('statOverdue').textContent = data ? s.overdue : '–';
  $('statUnverified').textContent = data ? s.unverified : '–';

  renderPlan(byCourse, ctx);

  const types = ['all', ...Object.keys(TYPE_LABEL).filter((t) => byCourse.some((it) => it.type === t))];
  if (!types.includes(ui.type)) ui.type = 'all';
  fill($('typeChips'), ...types.map((t) => h('button', {
    type: 'button', 'aria-pressed': String(ui.type === t),
    onClick: () => { ui.type = t; saveUi(); render(); }
  }, t === 'all' ? '全部' : TYPE_LABEL[t])));
  $('hideDone').checked = ui.hideDone;

  const groupsEl = $('groups');
  if (!data) {
    const syncing = state.status.state === 'syncing';
    fill(groupsEl, h('div', { class: 'empty' },
      h('strong', {}, syncing ? '正在第一次同步…' : '还没有数据'),
      h('span', {}, syncing ? '通常十几秒就好。' : '先在浏览器里登录 Brightspace，然后点"同步"。'),
      syncing ? null : h('a', { class: 'btn', href: `${BASE_URL}/d2l/home`, target: '_blank', rel: 'noopener' }, '打开 Brightspace 登录')));
    return;
  }
  if (!filtered.length) {
    fill(groupsEl, h('div', { class: 'empty' }, h('strong', {}, '这里没有待办'), h('span', {}, '换个筛选条件，或者休息一下。')));
    return;
  }
  const HINT = { overdue: 'Brightspace 上确认没有提交记录', unverified: '插件查不到这些的提交状态。交了的话点左边圆圈标记一下' };
  fill(groupsEl, ...groupItems(filtered, now, ov).map((g) => h('section', {},
    h('div', { class: 'group-head' },
      h('h2', { class: g.id === 'overdue' ? 'danger' : '' }, g.label),
      h('span', { class: 'n' }, `${g.items.length} 项`),
      HINT[g.id] ? h('span', { class: 'hint' }, `· ${HINT[g.id]}`) : null),
    h('div', { class: 'card-list' }, ...g.items.map((it) => renderRow(it, ctx))))));
}

function renderRow(it, { now, colors, names }) {
  const ov = state.overrides;
  const done = isDone(it, ov);
  const manual = isManualDone(it, ov);
  const g = groupOf(it, now, done);
  const tone = done ? 'neutral' : g === 'overdue' ? 'danger' : g === 'today' || g === 'tomorrow' ? 'warn' : 'neutral';
  const cc = colors[it.courseId] || '#888';
  let status = null;
  const mine = it.custom ? h('span', { class: 'chip accent' }, '我添加的') : null;
  if (done) status = h('span', { class: 'chip ok' }, manual ? '手动标记完成' : it.status === 'submitted' ? '已提交' : '已完成');
  else if (g === 'unverified') status = h('span', { class: 'chip neutral' }, '待确认');
  return h('div', { class: `row${done ? ' done' : ''}` },
    h('button', {
      type: 'button', class: 'check', style: `--cc:${cc}`, 'aria-pressed': String(done),
      'aria-label': `${done ? '标为未完成' : '标记完成'}：${it.title}`, title: done ? '标为未完成' : '标记完成',
      onClick: () => setDone(it, !done)
    }, icon(I.check, 14)),
    h('div', { class: 'body' },
      it.url ? h('a', { class: 'title', href: it.url, target: '_blank', rel: 'noopener' }, it.title)
        : it.custom ? h('button', { type: 'button', class: 'title link-title', title: '编辑', onClick: () => customDialog(it) }, it.title)
        : h('span', { class: 'title' }, it.title),
      h('div', { class: 'meta' },
        h('span', { class: 'course-tag', style: `--cc:${cc}` }, names[it.courseId] || ''),
        h('span', {}, TYPE_LABEL[it.type] || '其他'),
        mine, status),
      it.custom && it.note ? h('div', { class: 'note' }, it.note) : null),
    h('div', { class: 'due' },
      h('span', { class: `chip ${tone}` }, formatDue(it.due, now)),
      done || g === 'unverified' ? null : h('span', { class: 'rel' }, formatRelative(it.due, now))));
}

// ---------------- 自己添加截止事项 ----------------
const pad2 = (n) => String(n).padStart(2, '0');
function customDialog(existing = null) {
  const raw = existing ? (state.settings.customItems || []).find((x) => x.id === existing.id) : null;
  const d = raw ? new Date(raw.due) : (() => { const x = new Date(Date.now() + 24 * 3600e3); x.setHours(23, 59, 0, 0); return x; })();
  const courses = (state.data?.courses || []).filter((c) => c.id !== MINE && !c.hidden && !(state.settings?.hiddenCourseIds || []).includes(c.id));
  const err = h('p', { class: 'form-error', role: 'alert' });
  const typeSel = h('select', { name: 'type' }, ...CUSTOM_TYPES.map((t) => h('option', { value: t, selected: (raw?.type || 'presentation') === t }, TYPE_LABEL[t])));
  const courseSel = h('select', { name: 'courseId' },
    h('option', { value: MINE }, '我的事项（不属于某门课）'),
    ...courses.map((c) => h('option', { value: c.id, selected: raw?.courseId === c.id || (!raw && ui.course === c.id) }, c.name)));
  const form = h('form', { method: 'dialog', class: 'custom-form' },
    h('h2', {}, raw ? '编辑截止事项' : '添加截止事项'),
    h('p', { class: 'hint' }, '比如 presentation、小组讨论、自己定的 deadline。会和 Brightspace 的截止时间一起显示、提醒，也会同步到手机和提醒邮件。'),
    h('label', { class: 'field' }, h('span', {}, '标题'), h('input', { name: 'title', required: true, maxlength: 120, value: raw?.title || '', placeholder: '例如 Final presentation' })),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, '类型'), typeSel),
      h('label', { class: 'field' }, h('span', {}, '课程'), courseSel)),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, '日期'), h('input', { name: 'date', type: 'date', required: true, value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` })),
      h('label', { class: 'field' }, h('span', {}, '时间'), h('input', { name: 'time', type: 'time', required: true, value: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }))),
    h('label', { class: 'field' }, h('span', {}, '备注（可选）'), h('textarea', { name: 'note', rows: 2, maxlength: 500, placeholder: '例如 第 3 组，10 分钟' }, raw?.note || '')),
    err,
    h('div', { class: 'dialog-actions' },
      raw ? h('button', { type: 'button', class: 'btn danger left', onClick: async () => {
        await saveCustom(removeCustom(state.settings.customItems, raw.id));
        dlg.close(); toast('已删除');
      } }, '删除') : null,
      h('button', { type: 'button', class: 'btn', onClick: () => dlg.close() }, '取消'),
      h('button', { type: 'submit', class: 'btn primary' }, '保存')));
  const dlg = h('dialog', { class: 'dialog' }, form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const title = String(f.get('title') || '').trim();
    const due = new Date(`${f.get('date')}T${f.get('time') || '23:59'}`);
    if (!title) { err.textContent = '先写个标题'; return; }
    if (!Number.isFinite(due.getTime())) { err.textContent = '日期或时间不对'; return; }
    const list = upsertCustom(pruneCustom(state.settings.customItems || []), { ...(raw || {}), title, type: f.get('type'), courseId: f.get('courseId'), due, note: f.get('note') });
    await saveCustom(list);
    dlg.close();
    toast(raw ? '已保存' : `已添加：${title}`);
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  form.querySelector('input[name=title]').focus();
}

async function saveCustom(list) {
  await store.set({ settings: { ...(state.settings || {}), customItems: list }, settingsAt: Date.now() });
}

// ---------------- 主页的语言切换 ----------------
async function switchLang(l) {
  if (l === getLang()) return;
  await store.set({ settings: { ...(state.settings || {}), lang: l }, settingsAt: Date.now() });
  const c = state.cloud;
  if (c?.token) { try { await cloudApi.updateProfile(c.server, c.token, { lang: l }); } catch { /* 下次同步再改 */ } }
  location.reload();
}

// ---------------- 课件库 ----------------
function filesFor(courseId, { lectureOnly = ui.lectureOnly, q = ui.q } = {}) {
  const m = state.data?.materials?.[courseId];
  if (!m) return [];
  const needle = q.trim().toLowerCase();
  const out = [];
  for (const mod of m.modules) {
    const topics = mod.topics.filter((t) => {
      if (lectureOnly && !t.lecture) return false;
      if (needle && !`${t.title} ${t.filename} ${mod.path.join(' ')}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    if (topics.length) out.push({ ...mod, topics });
  }
  return out;
}

async function startDownload(courseId, modules) {
  const name = state.data?.courses?.find((c) => c.id === courseId)?.name || courseId;
  const files = [];
  for (const m of modules) for (const t of m.topics) if (t.kind === 'file' && t.download) files.push({ url: t.download, filename: downloadPath(name, m.path, t) });
  if (!files.length) { toast('没有可以下载的文件'); return; }
  if (files.length > 40 && !(await confirmDialog({ title: `下载 ${files.length} 个文件？`, body: `会保存到 下载/Brightspace/${name}/`, ok: '开始下载' }))) return;
  toast(`开始下载 ${files.length} 个文件 → 下载/Brightspace/${name}/`);
  const res = await store.download(files);
  if (res?.failed?.length) toast(`${res.ok} 个下载成功，${res.failed.length} 个失败（可能需要先登录 Brightspace）`);
}

function renderMaterials(ctx) {
  const { now, colors } = ctx;
  $('lectureOnly').checked = ui.lectureOnly;
  const box = $('materials');
  const mats = state.data?.materials || {};
  const dlAll = $('matDownloadAll');

  if (!state.data) {
    $('matTitle').textContent = '课件库';
    $('matSubtitle').textContent = '';
    dlAll.hidden = true;
    fill(box, h('div', { class: 'empty' }, h('strong', {}, '还没有数据'), h('span', {}, '登录 Brightspace 并同步后，这里会按课程和章节列出所有课件。')));
    return;
  }

  if (ui.course === 'all') {
    $('matTitle').textContent = '课件库';
    const total = ctx.courses.reduce((n, c) => n + (mats[c.id]?.files || 0), 0);
    $('matSubtitle').textContent = `${ctx.courses.length} 门课 · ${total} 个文件 · 点课程查看章节`;
    dlAll.hidden = true;
    fill(box, h('div', { class: 'course-cards' }, ...ctx.courses.map((c) => {
      const m = mats[c.id];
      const latest = m?.modules.flatMap((x) => x.topics).filter((t) => t.modified).sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified))[0];
      const mods = filesFor(c.id, { q: '' });
      const n = mods.reduce((k, x) => k + x.topics.filter((t) => t.kind === 'file').length, 0);
      return h('div', { class: 'course-card' },
        h('div', { class: 'course-card-head' },
          h('span', { class: 'avatar', style: `--cc:${colors[c.id]}` }, initials(c.name)),
          h('span', { class: 'course-card-name' }, c.name)),
        m
          ? h('div', { class: 'course-card-nums' },
            h('span', {}, h('b', {}, m.files), '个文件'),
            h('span', {}, h('b', {}, m.lectures), '份讲义'),
            m.links ? h('span', {}, h('b', {}, m.links), '个链接') : null)
          : h('div', { class: 'course-card-nums' }, '还没读到课件'),
        latest ? h('div', { class: 'course-card-latest', title: latest.title }, `最近更新：${latest.title}（${shortDate(latest.modified)}）`) : null,
        h('div', { class: 'course-card-actions' },
          h('button', { type: 'button', class: 'btn', onClick: () => { ui.course = c.id; saveUi(); render(); } }, '查看章节'),
          h('button', { type: 'button', class: 'btn', disabled: !n, onClick: () => startDownload(c.id, mods) },
            icon(I.download, 15), ui.lectureOnly ? `讲义（${n}）` : `全部（${n}）`)));
    })));
    return;
  }

  const c = ctx.courses.find((x) => x.id === ui.course);
  const m = mats[ui.course];
  $('matTitle').textContent = c?.name || '课件库';
  $('matSubtitle').textContent = m
    ? `${m.files} 个文件 · ${m.lectures} 份讲义${m.links ? ` · ${m.links} 个链接` : ''} · ${formatAgo(m.fetchedAt, now)}读取`
    : '还没读到这门课的课件，点"重新读取课件"试试';
  const mods = filesFor(ui.course);
  const fileCount = mods.reduce((k, x) => k + x.topics.filter((t) => t.kind === 'file').length, 0);
  dlAll.hidden = !fileCount;
  dlAll.textContent = ui.lectureOnly ? `下载全部讲义（${fileCount}）` : `下载全部（${fileCount}）`;
  dlAll.onclick = () => startDownload(ui.course, mods);

  if (!mods.length) {
    fill(box, h('div', { class: 'empty' },
      h('strong', {}, m ? '没有符合条件的课件' : '暂无课件'),
      h('span', {}, ui.lectureOnly ? '关掉"只看讲义"可以看到全部文件。' : '老师可能还没上传，或者课件放在别的地方（比如 Google Drive 链接）。')));
    return;
  }

  fill(box, ...mods.map((mod, i) => {
    const files = mod.topics.filter((t) => t.kind === 'file').length;
    const crumbs = mod.path.slice(0, -1);
    const key = `${ui.course}:${mod.id}`;
    const open = ui.q ? true : moduleOpen.has(key) ? moduleOpen.get(key) : i < 8;
    const det = h('details', { class: 'module', open: open || null },
      h('summary', {},
        h('span', { class: 'chev' }, icon(I.chevron, 16)),
        h('span', { class: 'module-path' },
          crumbs.length ? h('span', { class: 'crumb' }, `${crumbs.join(' / ')} /`) : null,
          h('span', { class: 'leaf' }, mod.path[mod.path.length - 1])),
        h('span', { class: 'module-count' }, `${mod.topics.length} 项`),
        files ? h('button', { type: 'button', class: 'btn small', onClick: (e) => { e.preventDefault(); e.stopPropagation(); startDownload(ui.course, [mod]); } }, icon(I.download, 14), '下载本章') : null),
      ...mod.topics.map((t) => renderFile(t, mod, now)));
    det.addEventListener('toggle', () => { if (!ui.q) moduleOpen.set(key, det.open); });
    return det;
  }));
}

function renderFile(t, mod, now) {
  const isNew = t.modified && now.getTime() - Date.parse(t.modified) < NEW_MS;
  const xc = t.kind === 'link' ? '#0891B2' : EXT_COLOR[t.ext] || '#64748B';
  const label = t.kind === 'link' ? '链接' : t.ext || '文件';
  return h('div', { class: 'file' },
    h('span', { class: 'ext', style: `--xc:${xc}` }, label.slice(0, 4)),
    h('div', { class: 'body' },
      h('a', { class: 'fname', href: t.open, target: '_blank', rel: 'noopener' }, t.title),
      h('div', { class: 'fmeta' },
        t.kind === 'file' && t.filename && t.filename !== t.title ? h('span', {}, t.filename) : null,
        t.modified ? h('span', {}, `更新于 ${shortDate(t.modified)}`) : null,
        isNew ? h('span', { class: 'chip accent' }, '新') : null,
        t.lecture ? h('span', { class: 'chip neutral' }, '讲义') : null)),
    h('div', { class: 'actions' },
      h('a', { class: 'btn ghost icon small', href: t.open, target: '_blank', rel: 'noopener', 'aria-label': `在 Brightspace 打开：${t.title}`, title: '打开' }, icon(I.external, 15)),
      t.kind === 'file' && t.download
        ? h('button', { type: 'button', class: 'btn icon small', 'aria-label': `下载：${t.title}`, title: '下载', onClick: () => startDownload(ui.course, [{ ...mod, topics: [t] }]) }, icon(I.download, 15))
        : null));
}

// ---------------- 今日计划 ----------------
function renderPlan(byCourse, ctx) {
  const { now, colors, names } = ctx;
  const box = $('planBox');
  if (!state.data) { fill(box); return; }
  const plan = buildPlan(byCourse, now, state.overrides);
  const doneToday = byCourse.filter((it) => isManualDone(it, state.overrides) || (isDone(it, state.overrides) && Math.abs(Date.parse(it.due) - now.getTime()) < 24 * 3600 * 1000)).length;
  const MAX = 6;
  const shown = ui.planOpen ? plan : plan.slice(0, MAX);
  const head = h('div', { class: 'plan-head' },
    h('div', {},
      h('span', { class: 'plan-kicker' }, `${WEEKDAY[now.getDay()]} · 今日计划`),
      h('h2', { class: 'plan-title' }, plan.length ? `今天先做这 ${Math.min(plan.length, MAX)} 件事` : '这几天没有要赶的'),
      h('p', { class: 'plan-sub' }, plan.length
        ? '截止前 3 天开始出现，考试提前 7 天；越急、越重要的越靠前（考试 > 作业 > 讨论）。'
        : `接下来 3 天没有截止事项${doneToday ? `，今天已完成 ${doneToday} 件` : ''}。可以提前看看"之后"的作业，或者休息一下。`)),
    plan.length ? h('div', { class: 'plan-count' }, h('b', {}, String(plan.length)), h('span', {}, '件待办')) : h('span', { class: 'plan-done', 'aria-hidden': 'true' }, icon(I.check, 22)));
  if (!plan.length) { fill(box, h('section', { class: 'plan empty-plan', 'aria-label': '今日计划' }, head)); return; }
  const rows = shown.slice(0, ui.planOpen ? undefined : MAX).map((it, i) => {
    const cc = colors[it.courseId] || '#888';
    return h('div', { class: 'plan-row' },
      h('span', { class: 'plan-rank', 'aria-hidden': 'true' }, String(i + 1)),
      h('button', { type: 'button', class: 'check', style: `--cc:${cc}`, 'aria-pressed': 'false', 'aria-label': `标记完成：${it.title}`, title: '标记完成', onClick: () => setDone(it, true) }, icon(I.check, 14)),
      h('div', { class: 'body' },
        it.url ? h('a', { class: 'title', href: it.url, target: '_blank', rel: 'noopener' }, it.title) : h('span', { class: 'title' }, it.title),
        h('div', { class: 'meta' }, h('span', { class: 'course-tag', style: `--cc:${cc}` }, names[it.courseId] || ''), h('span', {}, TYPE_LABEL[it.type] || '其他'))),
      h('span', { class: `chip ${it.reason.tone}` }, it.reason.text));
  });
  const more = plan.length > MAX
    ? h('button', { type: 'button', class: 'link-btn plan-more', onClick: () => { ui.planOpen = !ui.planOpen; saveUi(); render(); } }, ui.planOpen ? '收起' : `还有 ${plan.length - MAX} 件，全部展开`)
    : null;
  fill(box, h('section', { class: 'plan', 'aria-label': '今日计划' }, head, h('div', { class: 'plan-list' }, ...rows), more));
}

// ---------------- 动态 ----------------
function feedFor(hiddenExtra) {
  const hidden = new Set([...(state.settings?.hiddenCourseIds || []), ...hiddenExtra]);
  const active = new Set(courses().map((c) => c.id));
  return buildFeed(state.data, state.updates, viewSeenAt ?? state.seenAt ?? 0, hidden).filter((e) => active.has(e.courseId));
}

function markFeedSeen() {
  viewSeenAt = state.seenAt || 0;
  store.set({ seenAt: Date.now() });
}

const KIND_ICON = { news: I.chat, 'material-new': I.file, 'material-updated': I.file, 'due-changed': I.clock, 'item-new': I.plus, 'grade-new': I.chart, 'grade-changed': I.chart };

function dayLabel(iso, now) {
  const d = new Date(iso);
  const a = new Date(now); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${WEEKDAY[d.getDay()]}`;
}

function feedDetail(e, now) {
  const d = e.detail || {};
  switch (e.kind) {
    case 'material-new': return `新上传 · ${d.path || ''}`;
    case 'material-updated': return `文件更新了 · ${d.path || ''}`;
    case 'due-changed': return `截止时间从 ${formatDue(d.from, now)} 改到 ${formatDue(d.to, now)}`;
    case 'item-new': return `新${d.typeLabel || '作业'} · ${formatDue(d.due, now)} 截止`;
    case 'grade-new': return d.displayed ? `出分了：${d.displayed}` : '出分了';
    case 'grade-changed': return `成绩从 ${d.from || '—'} 改为 ${d.displayed}`;
    default: return '';
  }
}

function renderUpdates(ctx) {
  const { now, colors, names } = ctx;
  if (viewSeenAt == null) markFeedSeen();
  const q = ui.q.trim().toLowerCase();
  const filter = FEED_FILTERS.find((f) => f.id === ui.feed) || FEED_FILTERS[0];
  const all = feedFor(new Set()).filter((e) => ui.course === 'all' || e.courseId === ui.course);
  const list = all.filter((e) => (!filter.kinds || filter.kinds.includes(e.kind)) && (!q || `${e.title} ${e.text || ''} ${names[e.courseId] || ''}`.toLowerCase().includes(q)));
  const unread = all.filter((e) => e.unread).length;
  $('updSubtitle').textContent = `${ui.course === 'all' ? `全部 ${ctx.courses.length} 门课` : names[ui.course]} · 最近的公告、新课件、截止时间改动和出分${unread ? ` · ${unread} 条新的` : ''}`;
  fill($('updChips'), ...FEED_FILTERS.map((f) => {
    const n = all.filter((e) => !f.kinds || f.kinds.includes(e.kind)).length;
    return h('button', { type: 'button', 'aria-pressed': String(ui.feed === f.id), onClick: () => { ui.feed = f.id; saveUi(); render(); } }, `${f.label}${n ? ` ${n}` : ''}`);
  }));
  const box = $('updList');
  if (!state.data) { fill(box, h('div', { class: 'empty' }, h('strong', {}, '还没有数据'), h('span', {}, '同步一次后这里会显示各门课的公告和变化。'))); return; }
  if (!list.length) {
    fill(box, h('div', { class: 'empty' }, h('strong', {}, '暂时没有动态'),
      h('span', {}, filter.id === 'all' || filter.id === 'news' ? '最近 45 天各门课都没有公告。之后有新课件、截止时间改动、出分也会出现在这里。' : '插件会在每次同步时对比，发现变化就记在这里并提醒你。')));
    return;
  }
  const groups = [];
  for (const e of list) {
    const label = dayLabel(e.at, now);
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  fill(box, ...groups.map((g) => h('section', {},
    h('div', { class: 'group-head' }, h('h2', {}, g.label), h('span', { class: 'n' }, `${g.items.length} 条`)),
    h('div', { class: 'card-list' }, ...g.items.map((e) => feedRow(e, now, colors, names))))));
}

function feedRow(e, now, colors, names) {
  const cc = colors[e.courseId] || '#888';
  const time = new Date(e.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const isNews = e.kind === 'news';
  let textEl = null;
  if (isNews && e.text) {
    const long = e.text.length > 220 || e.text.split('\n').length > 4;
    const p = h('p', { class: `feed-text${long ? ' clamp' : ''}` }, e.text);
    textEl = long
      ? h('div', {}, p, h('button', { type: 'button', class: 'link-btn', onClick: (ev) => { p.classList.toggle('clamp'); ev.currentTarget.textContent = p.classList.contains('clamp') ? '展开全文' : '收起'; } }, '展开全文'))
      : p;
  }
  const link = isNews ? `${BASE_URL}/d2l/home/${e.courseId}` : e.ref;
  return h('div', { class: `feed-row${e.unread ? ' unread' : ''}` },
    h('span', { class: `feed-icon k-${e.kind}`, 'aria-hidden': 'true' }, icon(KIND_ICON[e.kind] || I.chat, 16)),
    h('div', { class: 'body' },
      h('div', { class: 'feed-top' },
        link ? h('a', { class: 'title', href: link, target: '_blank', rel: 'noopener' }, e.title) : h('span', { class: 'title' }, e.title),
        e.pinned ? h('span', { class: 'chip warn' }, '置顶') : null,
        e.unread ? h('span', { class: 'chip accent' }, '新') : null),
      h('div', { class: 'meta' },
        h('span', { class: 'course-tag', style: `--cc:${cc}` }, names[e.courseId] || ''),
        h('span', {}, isNews ? UPDATE_KINDS.news : feedDetail(e, now)),
        e.attachments ? h('span', {}, `${e.attachments} 个附件`) : null,
        h('span', { class: 'feed-time' }, time)),
      textEl));
}

// ---------------- 成绩 ----------------
function scoreText(it) {
  if (it.num != null && it.den != null) return `${+it.num.toFixed(2)} / ${+it.den.toFixed(2)}`;
  return it.displayed || '—';
}

function renderGrades(ctx) {
  const { colors, names } = ctx;
  const g = state.data?.grades || {};
  const box = $('grades');
  if (!state.data) { $('grSubtitle').textContent = ''; fill(box, h('div', { class: 'empty' }, h('strong', {}, '还没有数据'), h('span', {}, '同步一次后这里会显示各门课的成绩。'))); return; }
  if (!state.data.grades) { $('grSubtitle').textContent = ''; fill(box, h('div', { class: 'empty' }, h('strong', {}, '还没读取成绩'), h('span', {}, '点右上角"同步"，这一版开始会顺便读取成绩。'))); return; }

  const courseCard = (c) => {
    const cg = g[c.id];
    const avg = averagePct(cg?.items);
    const fin = cg?.final;
    const main = fin ? (fin.pct != null ? `${fin.pct}%` : fin.displayed) : avg != null ? `${avg}%` : '—';
    const tone = gradeTone(fin?.pct ?? avg);
    const latest = cg?.items?.[0];
    return h('button', { type: 'button', class: 'course-card grade-card', onClick: () => { ui.course = c.id; saveUi(); render(); } },
      h('div', { class: 'course-card-head' }, h('span', { class: 'avatar', style: `--cc:${colors[c.id]}` }, initials(c.name)), h('span', { class: 'course-card-name' }, c.name)),
      h('div', { class: 'grade-main' },
        h('b', { class: `grade-num tone-${tone}` }, main),
        h('span', { class: 'muted' }, fin ? '期末成绩（老师已公布）' : avg != null ? '已出分项目的得分率' : '还没有出分')),
      h('div', { class: 'grade-bar' }, h('span', { class: `tone-bg-${tone}`, style: `width:${Math.max(0, Math.min(100, fin?.pct ?? avg ?? 0))}%` })),
      h('div', { class: 'course-card-nums' }, h('span', {}, h('b', {}, cg?.items?.length || 0), '项已出分'), latest?.date ? h('span', {}, `最近 ${shortDate(latest.date)}`) : null));
  };

  if (ui.course === 'all') {
    $('grTitle').textContent = '成绩';
    $('grSubtitle').textContent = '"得分率"是把已出分项目的分数直接加总算的，没算各项权重，只作参考；以 Brightspace 成绩册为准。';
    const recent = [];
    for (const c of ctx.courses) for (const it of g[c.id]?.items || []) recent.push({ ...it, courseId: c.id });
    recent.sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
    fill(box,
      h('div', { class: 'course-cards' }, ...ctx.courses.map(courseCard)),
      h('section', {},
        h('div', { class: 'group-head' }, h('h2', {}, '最近出分'), h('span', { class: 'n' }, `${Math.min(recent.length, 15)} 项`)),
        recent.length
          ? h('div', { class: 'card-list' }, ...recent.slice(0, 15).map((it) => gradeRow(it, colors, names, true)))
          : h('div', { class: 'empty' }, h('span', {}, '还没有出分的项目。'))));
    return;
  }

  const c = ctx.courses.find((x) => x.id === ui.course);
  const cg = g[ui.course];
  const avg = averagePct(cg?.items);
  $('grTitle').textContent = c?.name || '成绩';
  $('grSubtitle').textContent = cg?.final
    ? `期末成绩：${cg.final.displayed || `${cg.final.pct}%`} · ${cg.items.length} 项已出分`
    : `${cg?.items?.length || 0} 项已出分${avg != null ? ` · 得分率 ${avg}%（未算权重，仅供参考）` : ''}`;
  fill(box,
    h('div', { class: 'grade-actions' }, h('a', { class: 'btn', href: `${BASE_URL}/d2l/lms/grades/my_grades/main.d2l?ou=${ui.course}`, target: '_blank', rel: 'noopener' }, icon(I.external, 15), '在 Brightspace 打开成绩册')),
    cg?.items?.length
      ? h('div', { class: 'card-list' }, ...cg.items.map((it) => gradeRow({ ...it, courseId: ui.course }, colors, names, false)))
      : h('div', { class: 'empty' }, h('strong', {}, '这门课还没有出分'), h('span', {}, '老师发布成绩后，下一次同步就会出现在这里，并提醒你。')));
}

function gradeRow(it, colors, names, showCourse) {
  const tone = gradeTone(it.pct);
  return h('div', { class: 'row grade-row' },
    h('div', { class: 'body' },
      h('span', { class: 'title' }, it.name),
      h('div', { class: 'meta' },
        showCourse ? h('span', { class: 'course-tag', style: `--cc:${colors[it.courseId] || '#888'}` }, names[it.courseId] || '') : null,
        it.date ? h('span', {}, `${shortDate(it.date)} 出分`) : null,
        it.feedback ? h('span', { class: 'chip neutral' }, '有评语') : null)),
    h('div', { class: 'grade-score' },
      h('b', {}, scoreText(it)),
      it.pct != null ? h('span', { class: `chip ${tone}` }, `${it.pct}%`) : it.displayed && it.num != null ? h('span', { class: 'muted' }, it.displayed) : null));
}

// ---------------- 其他 ----------------
let resyncTimer = null;
function scheduleResync() {
  clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => doSync(), 1200);
}

async function doSync(opts = {}) {
  state.status = { ...state.status, state: 'syncing' };
  render();
  await store.sync(opts);
}

function exportIcs() {
  const now = new Date();
  const ids = new Set(courses().map((c) => c.id));
  const items = (state.data?.items || []).filter((it) => ids.has(it.courseId) && !isDone(it, state.overrides) && Date.parse(it.due) > now.getTime());
  if (!items.length) { toast('没有未来的待办可以导出'); return; }
  const names = Object.fromEntries((state.data?.courses || []).map((c) => [c.id, c.name]));
  const blob = new Blob([buildIcs(items, names, now)], { type: 'text/calendar;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `brightspace-deadlines-${now.toISOString().slice(0, 10)}.ics` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`已导出 ${items.length} 项，打开文件即可导入日历`);
}

async function copyDiagnostics() {
  const d = state.data;
  const names = Object.fromEntries((d?.allCourses || d?.courses || []).map((c) => [c.id, c.name]));
  const report = {
    version: store.version(),
    lastSync: d?.lastSync, status: state.status, requestCount: d?.requestCount, usingFallback: d?.usingFallback,
    warnings: d?.warnings,
    cloud: state.cloud?.token ? { server: state.cloud.server, user: state.cloud.user?.email, flags: state.cloud.flags, error: state.cloud.error, lastCloudSync: state.cloud.lastCloudSync } : null,
    courses: { syncing: (d?.courses || []).map((c) => c.name), hidden: state.settings?.hiddenCourseIds, added: state.settings?.addedCourseIds },
    items: (d?.items || []).map((it) => ({ course: names[it.courseId], title: it.title, type: it.type, due: it.due, status: it.status, manual: state.overrides?.[it.id] ?? null, sources: it.sources, signals: it.signals })),
    materials: Object.fromEntries(Object.entries(d?.materials || {}).map(([k, m]) => [names[k] || k, { files: m.files, lectures: m.lectures, modules: m.modules.length }]))
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast('诊断信息已复制，直接粘贴给我就行');
  } catch {
    toast('复制失败，请再点一次');
  }
}

function setView(v) {
  if (v === 'updates' && ui.view !== 'updates') markFeedSeen();
  if (v !== 'updates') viewSeenAt = null;
  ui.view = v;
  history.replaceState(null, '', `#${v}`);
  saveUi();
  render();
  window.scrollTo({ top: 0 });
}

function openSettings(sectionId) {
  setView('settings');
  if (sectionId) requestAnimationFrame(() => document.getElementById(`set-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function load() {
  const got = await store.get(KEYS);
  state = {
    data: withCustom(got.data || null, got.settings || {}), status: got.status || {}, overrides: got.overrides || {}, settings: got.settings || {},
    cloud: got.cloud || null, updates: got.updates || [], seenAt: got.seenAt || 0,
    pendingUpdate: got.pendingUpdate || null
  };
  render();
}

$('tabDeadlines').addEventListener('click', () => setView('deadlines'));
$('tabMaterials').addEventListener('click', () => setView('materials'));
$('tabUpdates').addEventListener('click', () => setView('updates'));
$('tabGrades').addEventListener('click', () => setView('grades'));
$('accountBtn').addEventListener('click', () => (ui.view === 'settings' ? setView('deadlines') : openSettings('account')));
$('manageCourses').addEventListener('click', () => openSettings('courses'));
$('syncBtn').addEventListener('click', () => doSync());
$('icsBtn').addEventListener('click', exportIcs);
$('addBtn').addEventListener('click', () => customDialog());
for (const b of document.querySelectorAll('#langMini [data-lang]')) b.addEventListener('click', () => switchLang(b.dataset.lang));
$('matRefresh').addEventListener('click', () => { toast('正在重新读取所有课程的课件…'); doSync({ forceMaterials: true }); });
$('hideDone').addEventListener('change', (e) => { ui.hideDone = e.target.checked; saveUi(); render(); });
$('lectureOnly').addEventListener('change', (e) => { ui.lectureOnly = e.target.checked; saveUi(); render(); });
$('q').addEventListener('input', (e) => { ui.q = e.target.value; render(); });

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if (VIEWS.includes(v) && v !== ui.view) setView(v);
});

// 演示模式（直接打开 html）可以用 ?lang=en 预览英文
const LANG = store.demo ? (setLang(new URLSearchParams(location.search).get('lang') || 'zh'), getLang()) : await loadLang();
for (const b of document.querySelectorAll('#langMini [data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()));
translatePage(document.body);
store.onChanged((ch) => {
  // 在别处（比如另一个标签页）切换了语言：整页重新加载
  if (ch?.settings && (ch.settings.newValue?.lang || 'x') !== (ch.settings.oldValue?.lang || 'x') && ch.settings.newValue?.lang && ch.settings.newValue.lang !== LANG) { location.reload(); return; }
  load();
});
store.checkUpdate?.();
store.maybeSync?.();
// 页面一直开着时：切回这个标签页也补一次
document.addEventListener('visibilitychange', () => { if (!document.hidden) store.maybeSync?.(); });
setInterval(() => { if (ui.view !== 'settings') render(); }, 60 * 1000);
load();
