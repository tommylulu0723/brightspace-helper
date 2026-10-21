// 动态列表 = 各门课的公告 + 同步时发现的变化（新课件、截止时间改动、新作业、出分）。

/**
 * @param {object} data 同步结果（含 news）
 * @param {Array} updates 已保存的变化
 * @param {number} seenAt 上次看动态的时间（毫秒），之后的算未读
 * @param {Set<string>} hidden 移除了的课程
 */
export function buildFeed(data, updates = [], seenAt = 0, hidden = new Set()) {
  const out = [];
  for (const n of data?.news || []) {
    if (hidden.has(n.courseId)) continue;
    const at = n.date;
    out.push({ id: n.id, kind: 'news', courseId: n.courseId, title: n.title, text: n.text, pinned: n.pinned, attachments: n.attachments, at, unread: Date.parse(at) > seenAt });
  }
  for (const e of updates || []) {
    if (e.kind === 'news' || hidden.has(e.courseId)) continue;
    out.push({ ...e, unread: Date.parse(e.at) > seenAt });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function unreadCount(data, updates, seenAt, hidden = new Set()) {
  return buildFeed(data, updates, seenAt, hidden).filter((e) => e.unread).length;
}

export const FEED_FILTERS = [
  { id: 'all', label: '全部', kinds: null },
  { id: 'news', label: '公告', kinds: ['news'] },
  { id: 'material', label: '课件', kinds: ['material-new', 'material-updated'] },
  { id: 'deadline', label: '截止时间', kinds: ['due-changed', 'item-new'] },
  { id: 'grade', label: '成绩', kinds: ['grade-new', 'grade-changed'] }
];
