// 界面共用：分组、时间显示、颜色。
import { isDoneStatus } from './merge.js';

export const TYPE_LABEL = {
  assignment: '作业', quiz: '测验', exam: '考试', presentation: '展示', discussion: '讨论', event: '日程', other: '其他'
};

export const COURSE_COLORS = ['#7C3AED', '#2563EB', '#EA580C', '#0D9488', '#CA8A04', '#DB2777', '#0891B2', '#65A30D'];

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function courseColorMap(courses) {
  const map = {};
  [...courses]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((c, i) => { map[c.id] = COURSE_COLORS[i % COURSE_COLORS.length]; });
  return map;
}

export function isDone(item, overrides = {}) {
  const o = item.ids?.map((id) => overrides[id]).find((v) => v != null) ?? overrides[item.id];
  if (o === true) return true;
  if (o === false) return false;
  return isDoneStatus(item.status);
}

export function isManualDone(item, overrides = {}) {
  return (item.ids || [item.id]).some((id) => overrides[id] === true);
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayDiff(due, now) {
  return Math.round((startOfDay(due) - startOfDay(now)) / (24 * 3600 * 1000));
}

const pad = (n) => String(n).padStart(2, '0');

export function formatDue(iso, now = new Date()) {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diff = dayDiff(d, now);
  if (diff === 0) return `今天 ${time}`;
  if (diff === 1) return `明天 ${time}`;
  if (diff === -1) return `昨天 ${time}`;
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${WEEKDAY[d.getDay()]} ${time}`;
}

export function formatRelative(iso, now = new Date()) {
  const ms = Date.parse(iso) - now.getTime();
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  let s;
  if (abs < 3600000) s = `${Math.max(m, 1)} 分钟`;
  else if (h < 48) s = `${h} 小时`;
  else s = `${Math.floor(h / 24)} 天`;
  return ms >= 0 ? `还剩 ${s}` : `已过 ${s}`;
}

export function formatAgo(iso, now = new Date()) {
  if (!iso) return '从未同步';
  const min = Math.floor((now.getTime() - Date.parse(iso)) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export const GROUPS = [
  { id: 'overdue', label: '已逾期 · 确认未提交' },
  { id: 'today', label: '今天' },
  { id: 'tomorrow', label: '明天' },
  { id: 'week', label: '7 天内' },
  { id: 'later', label: '之后' },
  { id: 'unverified', label: '已截止 · 无法确认是否提交' },
  { id: 'donePast', label: '最近已完成' }
];

// 已过截止时间的事项：只有确认"没交"才算逾期；查不到状态的单独放，不吓人
export function groupOf(item, now, done) {
  const t = Date.parse(item.due);
  if (t < now.getTime()) {
    if (done) return 'donePast';
    return item.status === 'open' ? 'overdue' : 'unverified';
  }
  const diff = dayDiff(new Date(t), now);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'week';
  return 'later';
}

export function groupItems(items, now, overrides) {
  const map = Object.fromEntries(GROUPS.map((g) => [g.id, []]));
  for (const it of items) map[groupOf(it, now, isDone(it, overrides))].push(it);
  map.donePast.reverse(); // 最近完成的排前面
  return GROUPS.map((g) => ({ ...g, items: map[g.id] })).filter((g) => g.items.length);
}

export function stats(items, now, overrides) {
  let upcoming = 0, soon = 0, overdue = 0, unverified = 0;
  const t = now.getTime();
  for (const it of items) {
    if (isDone(it, overrides)) continue;
    const due = Date.parse(it.due);
    if (due < t) {
      if (it.status === 'open') overdue++;
      else unverified++;
      continue;
    }
    upcoming++;
    if (due - t <= 7 * 24 * 3600 * 1000) soon++;
  }
  return { open: upcoming + overdue, soon, overdue, unverified };
}

// 浏览器图标上的数字：确认逾期 + 48 小时内到期且没完成
export function badgeCount(items, now, overrides) {
  const t = now.getTime();
  return items.filter((it) => {
    if (isDone(it, overrides)) return false;
    const d = Date.parse(it.due) - t;
    return d < 0 ? it.status === 'open' : d <= 48 * 3600 * 1000;
  }).length;
}
