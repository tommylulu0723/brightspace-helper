// 把不同来源（作业箱 / 测验 / 课件进度 / 日历）的条目整理成统一格式并去重。

export const SOURCE_PRIORITY = { dropbox: 3, quiz: 3, content: 2, calendar: 1 };

const EXAM_RE = /\b(mid-?term|final exam|exam|examination|test)\b|期中|期末|考试/i;
const SUFFIX_RE = /\s*[-–—:：(（]\s*(due( date)?|deadline|availability (ends|end date)|ends?|end date|closes?|截止|到期)\s*[)）]?\s*$/i;
const START_RE = /\s*[-–—:：(（]\s*(availability (starts|start date)|starts?|start date|opens?|available|开放|开始)\s*[)）]?\s*$/i;

export function isStartEvent(title) {
  return START_RE.test(title || '');
}

export function cleanTitle(title) {
  return String(title || '').replace(SUFFIX_RE, '').trim();
}

export function normTitle(title) {
  return cleanTitle(title)
    .toLowerCase()
    .replace(/[\s_\-–—:：·.,，。()（）[\]【】"'“”‘’]+/g, ' ')
    .trim();
}

export function detectType(baseType, title) {
  if (EXAM_RE.test(title || '') && baseType !== 'discussion' && baseType !== 'assignment') return 'exam';
  return baseType;
}

const STATUS_RANK = { submitted: 3, completed: 3, open: 1, unknown: 0 };

function better(a, b) {
  return (SOURCE_PRIORITY[a.source] || 0) >= (SOURCE_PRIORITY[b.source] || 0) ? a : b;
}

const DEDUPE_WINDOW_MS = 36 * 3600 * 1000;

/**
 * raw 条目格式：
 * { source, courseId, entityId, title, type, due (ISO), status, url }
 */
export function mergeItems(raw) {
  const groups = new Map(); // courseId|normTitle -> merged[]
  const sorted = [...raw]
    .filter((r) => r && r.due && r.title)
    .sort((a, b) => (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0));

  for (const r of sorted) {
    const item = {
      id: `${r.source}:${r.courseId}:${r.entityId}`,
      ids: [`${r.source}:${r.courseId}:${r.entityId}`],
      courseId: String(r.courseId),
      title: cleanTitle(r.title),
      type: detectType(r.type, r.title),
      due: r.due,
      status: r.status || 'unknown',
      url: r.url || null,
      source: r.source,
      sources: [r.source],
      signals: [...(r.signals || [])]
    };
    const key = `${item.courseId}|${normTitle(r.title)}`;
    const bucket = groups.get(key) || [];
    const t = Date.parse(item.due);
    const match = bucket.find((m) => Math.abs(Date.parse(m.due) - t) <= DEDUPE_WINDOW_MS);
    if (!match) {
      bucket.push(item);
      groups.set(key, bucket);
      continue;
    }
    // 合并：保留优先级高的来源的标题/时间/链接，状态取"最完成"的那个
    const primary = better(match, item);
    const other = primary === match ? item : match;
    match.id = primary.id;
    match.title = primary.title;
    match.due = primary.due;
    match.url = primary.url || other.url;
    match.type = primary.type === 'other' || primary.type === 'event' ? other.type : primary.type;
    match.source = primary.source;
    if ((STATUS_RANK[item.status] || 0) > (STATUS_RANK[match.status] || 0)) match.status = item.status;
    match.ids.push(...item.ids);
    match.sources.push(...item.sources);
    match.signals.push(...item.signals);
  }

  const out = [];
  for (const bucket of groups.values()) out.push(...bucket);
  return out.sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
}

export function isDoneStatus(status) {
  return status === 'submitted' || status === 'completed';
}
