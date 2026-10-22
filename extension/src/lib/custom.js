// 自己添加的截止事项（presentation、小组讨论、自己定的 deadline……）
// 存在 settings.customItems 里：跟着设置一起保存在本机、云同步到别的设备，也会进快照（手机网页、提醒邮件都能看到）。
export const MINE = '__mine';                 // 没选课程时放在"我的事项"下面
export const CUSTOM_TYPES = ['presentation', 'assignment', 'exam', 'quiz', 'other'];

export function newCustomId() {
  return `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function valid(c) {
  return c && typeof c.id === 'string' && c.id.startsWith('custom:') && c.title && Number.isFinite(Date.parse(c.due));
}

/** 把自己添加的事项合进同步来的数据里；界面、计划、通知、快照都用合并后的结果 */
export function withCustom(data, settings = {}) {
  const list = (settings?.customItems || []).filter(valid);
  if (!data || !list.length) return data;
  const known = new Set((data.courses || []).map((c) => c.id));
  const items = list.map((c) => ({
    id: c.id, ids: [c.id], courseId: c.courseId && known.has(c.courseId) ? c.courseId : MINE,
    title: c.title, type: CUSTOM_TYPES.includes(c.type) ? c.type : 'other', due: c.due, status: 'open',
    note: c.note || '', custom: true, sources: ['custom']
  }));
  const courses = [...(data.courses || [])];
  if (items.some((it) => it.courseId === MINE)) {
    courses.push({ id: MINE, name: '我的事项', code: '', hidden: false, auto: false, mine: true, count: items.filter((it) => it.courseId === MINE).length });
  }
  const all = [...(data.items || []), ...items].sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
  return { ...data, courses, items: all };
}

/** 新增或修改一条；返回新的 customItems 数组 */
export function upsertCustom(list = [], item) {
  const clean = {
    id: item.id || newCustomId(),
    title: String(item.title || '').trim().slice(0, 120),
    type: CUSTOM_TYPES.includes(item.type) ? item.type : 'other',
    courseId: item.courseId || MINE,
    due: new Date(item.due).toISOString(),
    note: String(item.note || '').trim().slice(0, 500),
    createdAt: item.createdAt || new Date().toISOString()
  };
  const i = list.findIndex((x) => x.id === clean.id);
  return i >= 0 ? list.map((x, j) => (j === i ? clean : x)) : [...list, clean];
}

export function removeCustom(list = [], id) {
  return list.filter((x) => x.id !== id);
}

/** 截止超过 60 天的自动清掉，免得越积越多 */
export function pruneCustom(list = [], now = new Date()) {
  return list.filter((x) => now.getTime() - Date.parse(x.due) < 60 * 24 * 3600 * 1000);
}
