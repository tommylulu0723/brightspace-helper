// 对比两次同步的结果，找出变化：新课件、课件更新、截止时间改动、新作业、新公告、出分。
import { TYPE_LABEL } from './format.js';

const MIN = 60 * 1000;
const DAY = 24 * 3600 * 1000;
export const UPDATE_KINDS = {
  'news': '公告',
  'material-new': '新课件',
  'material-updated': '课件更新',
  'due-changed': '截止时间改动',
  'item-new': '新作业',
  'grade-new': '出分了',
  'grade-changed': '成绩变动'
};

/**
 * @param {object|null} prev 上一次同步结果
 * @param {object} next 这一次同步结果
 * @returns {Array<{ id, kind, courseId, title, detail, at, ref? }>}
 */
export function diffSync(prev, next, now = new Date()) {
  if (!prev || !next) return [];
  const at = now.toISOString();
  const out = [];
  const prevCourses = new Set((prev.courses || []).map((c) => c.id));

  // 截止事项
  const prevItems = new Map();
  for (const it of prev.items || []) for (const id of it.ids || [it.id]) prevItems.set(id, it);
  for (const it of next.items || []) {
    const old = (it.ids || [it.id]).map((id) => prevItems.get(id)).find(Boolean);
    if (old) {
      if (Math.abs(Date.parse(old.due) - Date.parse(it.due)) > MIN) {
        out.push({ id: `due:${it.id}:${it.due}`, kind: 'due-changed', courseId: it.courseId, title: it.title, detail: { from: old.due, to: it.due, type: it.type }, at, ref: it.url });
      }
    } else if (prevCourses.has(it.courseId) && Date.parse(it.due) > now.getTime()) {
      out.push({ id: `new:${it.id}`, kind: 'item-new', courseId: it.courseId, title: it.title, detail: { due: it.due, type: it.type, typeLabel: TYPE_LABEL[it.type] }, at, ref: it.url });
    }
  }

  // 课件：只比较两次都读到了目录的课（新加的课不算"新课件"）
  for (const [cid, m] of Object.entries(next.materials || {})) {
    const pm = prev.materials?.[cid];
    if (!pm || pm === m || pm.fetchedAt === m.fetchedAt) continue;
    const old = new Map();
    for (const mod of pm.modules || []) for (const t of mod.topics) old.set(t.id, t);
    for (const mod of m.modules || []) {
      for (const t of mod.topics) {
        const o = old.get(t.id);
        if (!o) {
          out.push({ id: `mat:${cid}:${t.id}`, kind: 'material-new', courseId: cid, title: t.title, detail: { path: mod.path.join(' / '), ext: t.ext, kind: t.kind }, at, ref: t.open });
        } else if (t.modified && o.modified && Date.parse(t.modified) - Date.parse(o.modified) > MIN) {
          out.push({ id: `matu:${cid}:${t.id}:${t.modified}`, kind: 'material-updated', courseId: cid, title: t.title, detail: { path: mod.path.join(' / '), ext: t.ext }, at, ref: t.open });
        }
      }
    }
  }

  // 公告：上次读到过这门课的公告才比较
  if (Array.isArray(prev.news)) {
    const prevNewsCourses = new Set(prev.news.map((n) => n.courseId));
    const oldNews = new Map(prev.news.map((n) => [n.id, n]));
    for (const n of next.news || []) {
      const o = oldNews.get(n.id);
      if (!o && (prevNewsCourses.has(n.courseId) || prevCourses.has(n.courseId)) && now.getTime() - Date.parse(n.date) < 3 * DAY) {
        out.push({ id: n.id, kind: 'news', courseId: n.courseId, title: n.title, detail: { text: n.text.slice(0, 140) }, at });
      }
    }
  }

  // 成绩
  for (const [cid, g] of Object.entries(next.grades || {})) {
    const pg = prev.grades?.[cid];
    if (!pg) continue;
    const old = new Map(pg.items.map((x) => [x.id, x]));
    for (const it of g.items) {
      const o = old.get(it.id);
      if (!o) out.push({ id: `grade:${cid}:${it.id}`, kind: 'grade-new', courseId: cid, title: it.name, detail: { displayed: it.displayed, pct: it.pct }, at });
      else if (o.displayed !== it.displayed) out.push({ id: `grade:${cid}:${it.id}:${it.displayed}`, kind: 'grade-changed', courseId: cid, title: it.name, detail: { from: o.displayed, displayed: it.displayed, pct: it.pct }, at });
    }
    if (g.final && (!pg.final || pg.final.displayed !== g.final.displayed)) {
      out.push({ id: `final:${cid}:${g.final.displayed}`, kind: 'grade-new', courseId: cid, title: '期末成绩', detail: { displayed: g.final.displayed, pct: g.final.pct }, at });
    }
  }
  return out;
}

/** 合并进已保存的动态：去重、最多 200 条、只留 60 天 */
export function mergeUpdates(existing, events, now = new Date()) {
  const seen = new Set((existing || []).map((e) => e.id));
  const merged = [...events.filter((e) => !seen.has(e.id)), ...(existing || [])];
  return merged.filter((e) => now.getTime() - Date.parse(e.at) < 60 * DAY).slice(0, 200);
}

/** 通知里的一句话 */
export function describeUpdate(e, courseName = '', fmtDue = (x) => x) {
  const c = courseName ? `${courseName}：` : '';
  switch (e.kind) {
    case 'news': return `${c}新公告《${e.title}》`;
    case 'material-new': return `${c}新课件《${e.title}》`;
    case 'material-updated': return `${c}课件更新《${e.title}》`;
    case 'due-changed': return `${c}${e.title} 截止时间改到 ${fmtDue(e.detail.to)}`;
    case 'item-new': return `${c}新${e.detail.typeLabel || '作业'}《${e.title}》，${fmtDue(e.detail.due)} 截止`;
    case 'grade-new': return `${c}${e.title} 出分了${e.detail.displayed ? `：${e.detail.displayed}` : ''}`;
    case 'grade-changed': return `${c}${e.title} 成绩改为 ${e.detail.displayed}`;
    default: return `${c}${e.title}`;
  }
}
