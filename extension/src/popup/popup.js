import { courseColorMap, isDone, formatDue, formatAgo, groupOf } from '../lib/format.js';
import { BASE_URL } from '../lib/api.js';
import { createStore } from '../store.js';
import { buildPlan } from '../lib/plan.js';
import { unreadCount } from '../lib/feed.js';

const store = createStore();
const $ = (id) => document.getElementById(id);
const MAX = 6;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

async function render() {
  const { data, status = {}, overrides = {}, settings = {}, updates = [], seenAt = 0, pendingUpdate } = await store.get(['data', 'status', 'overrides', 'settings', 'updates', 'seenAt', 'pendingUpdate']);
  const now = new Date();
  const syncing = status.state === 'syncing';

  $('syncBtn').disabled = syncing;
  $('syncIcon').classList.toggle('spin', syncing);
  $('syncText').textContent = syncing ? '正在同步…' : data?.lastSync ? `已同步 · ${formatAgo(data.lastSync, now)}` : '尚未同步';

  const banner = $('banner');
  if (status.state === 'error') {
    const auth = status.error?.code === 'AUTH_REQUIRED';
    banner.className = 'pbanner error';
    banner.replaceChildren(
      h('span', {}, auth ? 'Brightspace 没登录或登录已过期。' : `同步失败：${status.error?.message || ''}`),
      auth ? h('a', { class: 'btn small', href: `${BASE_URL}/d2l/home`, target: '_blank', rel: 'noopener' }, '去登录') : null
    );
    banner.hidden = false;
  } else if (pendingUpdate) {
    banner.className = 'pbanner update';
    const btn = h('button', { class: 'btn small primary', type: 'button' }, '立即更新');
    btn.addEventListener('click', () => { btn.disabled = true; btn.textContent = '正在更新…'; store.applyUpdate(); setTimeout(() => window.close(), 600); });
    banner.replaceChildren(
      h('strong', {}, `检测到更新 ${pendingUpdate.to}（当前 ${pendingUpdate.from}）`),
      pendingUpdate.notes?.length ? h('ul', { class: 'up-notes' }, ...pendingUpdate.notes.slice(0, 3).map((x) => h('li', {}, x))) : null,
      btn);
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }

  const hiddenSet = new Set(settings.hiddenCourseIds || []);
  const visible = new Set((data?.courses || []).filter((c) => !c.hidden && !hiddenSet.has(c.id)).map((c) => c.id));
  // 过了截止时间但查不到状态的不放这里（汇总页里有单独的"待确认"分组）
  const items = (data?.items || []).filter((it) => visible.has(it.courseId) && !isDone(it, overrides) && groupOf(it, now, false) !== 'unverified');
  const overdue = items.filter((it) => Date.parse(it.due) < now.getTime());
  const soon = items.filter((it) => {
    const d = Date.parse(it.due) - now.getTime();
    return d >= 0 && d <= 48 * 3600 * 1000;
  });

  $('summary').replaceChildren(
    h('div', { class: 'pill danger' }, h('b', {}, data ? overdue.length : '–'), h('span', {}, '已逾期')),
    h('div', { class: 'pill warn' }, h('b', {}, data ? soon.length : '–'), h('span', {}, '48 小时内')),
    h('div', { class: 'pill' }, h('b', {}, data ? items.length : '–'), h('span', {}, '未完成'))
  );

  const colors = courseColorMap(data?.courses || []);
  const names = Object.fromEntries((data?.courses || []).map((c) => [c.id, c.name]));
  // 优先显示今日计划；计划是空的就显示最近要到期的
  const plan = buildPlan(items, now, overrides);
  const next = plan.length ? plan.slice(0, MAX) : items.filter((it) => Date.parse(it.due) >= now.getTime()).slice(0, MAX);
  $('listTitle').textContent = plan.length ? `今日计划 · ${plan.length} 件` : '接下来';
  $('listTitle').hidden = !data || !next.length;
  const unread = data ? unreadCount(data, updates, seenAt, hiddenSet) : 0;
  $('updatesBtn').hidden = !unread;
  $('updatesBtn').textContent = `${unread} 条新动态：公告、新课件、截止时间改动、出分 →`;
  const list = $('list');
  if (!data) {
    list.replaceChildren(h('li', { class: 'empty' }, syncing ? '正在第一次同步…' : '还没有数据，先登录 Brightspace 再同步。'));
  } else if (!next.length) {
    list.replaceChildren(h('li', { class: 'empty' }, '没有待办，休息一下。'));
  } else {
    list.replaceChildren(
      ...next.map((it) => {
        const g = groupOf(it, now, false);
        const tone = it.reason ? it.reason.tone : g === 'overdue' ? 'danger' : g === 'today' || g === 'tomorrow' ? 'warn' : 'neutral';
        return h('li', {},
          h('a', { href: it.url || `${BASE_URL}/d2l/home/${it.courseId}`, target: '_blank', rel: 'noopener' },
            h('span', { class: 'bar', style: `background:${colors[it.courseId] || 'var(--muted)'}` }),
            h('span', { class: 'body' }, h('span', { class: 't' }, it.title), h('span', { class: 'c' }, names[it.courseId] || '')),
            h('span', { class: `chip ${tone}` }, it.reason ? it.reason.text : formatDue(it.due, now))));
      })
    );
  }
}

$('syncBtn').addEventListener('click', async () => {
  $('syncBtn').disabled = true;
  $('syncIcon').classList.add('spin');
  await store.sync();
  render();
});
$('openBtn').addEventListener('click', async () => {
  await store.openDashboard('deadlines');
  window.close();
});
$('updatesBtn').addEventListener('click', async () => {
  await store.openDashboard('updates');
  window.close();
});
$('matBtn').addEventListener('click', async () => {
  await store.openDashboard('materials');
  window.close();
});

store.onChanged(render);
render();
store.checkUpdate?.();
