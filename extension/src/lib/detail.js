// 作业详情：点开一项时，从 Brightspace 读老师写的要求、附件、评分标准、分值、我的提交和老师反馈。
// 只在点开时读（每项几个请求），读到的结果缓存在本机。
import { AuthRequiredError, ApiError } from './api.js';

const MAX_HTML = 60000;
const ORDER = { dropbox: 0, quiz: 1, content: 2, calendar: 3 };

const rich = (r) => {
  if (!r) return { html: '', text: '' };
  if (typeof r === 'string') return { html: '', text: r.trim() };
  return { html: String(r.Html || '').slice(0, MAX_HTML), text: String(r.Text || '').trim().slice(0, MAX_HTML) };
};
const hasRich = (r) => !!(r && (r.html.replace(/<[^>]*>|&nbsp;|\s/g, '') || r.text));
const cut = (s, n) => { const t = String(s || '').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 合并后的一项可能来自好几个地方（作业箱 + 日历 + 课件进度），按信息多少排好 */
export function detailTargets(item) {
  const out = [];
  const seen = new Set();
  for (const id of item?.ids || [item?.id]) {
    const m = /^(dropbox|quiz|content|calendar):([^:]+):(.+)$/.exec(String(id || ''));
    if (!m || seen.has(id)) continue;
    seen.add(id);
    out.push({ source: m[1], courseId: m[2], entityId: m[3] });
  }
  return out.sort((a, b) => ORDER[a.source] - ORDER[b.source]);
}

export function normalizeRubrics(list) {
  return (Array.isArray(list) ? list : []).slice(0, 4).map((r) => ({
    name: cut(r.Name, 120),
    description: cut(rich(r.Description).text, 600),
    groups: (r.CriteriaGroups || []).slice(0, 6).map((g) => {
      const levels = (g.Levels || []).slice(0, 8).map((l) => ({ name: cut(l.Name, 60), points: num(l.Points) }));
      return {
        name: cut(g.Name, 80),
        levels,
        criteria: (g.Criteria || []).slice(0, 30).map((c) => ({
          name: cut(c.Name, 200),
          cells: (c.Cells || []).slice(0, levels.length || 8).map((cell) => ({
            text: cut(rich(cell.Description).text || rich(cell.Feedback).text, 400),
            points: num(cell.Points)
          }))
        }))
      };
    })
  })).filter((r) => r.groups.some((g) => g.criteria.length));
}

/** 作业箱 */
export function fromDropbox(f, { fileUrl } = {}) {
  if (!f) return {};
  const due = f.DueDate || null;
  const end = f.Availability?.EndDate || null;
  return {
    instructions: rich(f.CustomInstructions),
    attachments: (f.Attachments || []).slice(0, 30).map((a) => ({
      name: cut(a.FileName, 160), size: num(a.Size), url: fileUrl ? fileUrl(a.FileId) : null
    })),
    links: (f.LinkAttachments || []).slice(0, 20).map((l) => ({ name: cut(l.LinkName || l.Href, 160), url: l.Href })).filter((l) => /^https?:/i.test(l.url || '')),
    points: num(f.Assessment?.ScoreDenominator),
    rubrics: normalizeRubrics(f.Assessment?.Rubrics),
    start: f.Availability?.StartDate || null,
    due,
    // 截止后还能交到什么时候（一般算迟交）
    lateUntil: end && due && Date.parse(end) > Date.parse(due) + 60 * 1000 ? end : null,
    closes: end && !due ? end : null,
    group: f.DropboxType === 1 || (f.GroupTypeId != null && f.DropboxType !== 2),
    submitType: { 0: 'file', 1: 'text', 2: 'paper', 3: 'observed' }[f.SubmissionType] || null,
    fileTypes: Array.isArray(f.CustomAllowableFileTypes) && f.CustomAllowableFileTypes.length ? f.CustomAllowableFileTypes.slice(0, 12).map(String) : null,
    gradeItemId: f.GradeItemId ?? null
  };
}

/** 我的提交记录 + 老师在作业箱里写的反馈 */
export function fromSubmissions(data, { fileUrl } = {}) {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  const subs = [];
  let feedback = null;
  for (const e of list) {
    for (const s of e?.Submissions || []) {
      subs.push({
        at: s.SubmissionDate || null,
        comment: cut(rich(s.Comment).text, 400),
        files: (s.Files || []).slice(0, 20).map((x) => ({ name: cut(x.FileName, 160), size: num(x.Size), url: fileUrl ? fileUrl(s.Id, x.FileId) : null }))
      });
    }
    const fb = e?.Feedback;
    if (fb && (fb.Score != null || rich(fb.Feedback).text || rich(fb.Feedback).html)) {
      feedback = { score: num(fb.Score), outOf: num(fb.OutOf), text: rich(fb.Feedback) };
    }
  }
  subs.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
  return { submissions: subs.slice(0, 10), feedback };
}

/** 测验 */
export function fromQuiz(q) {
  if (!q) return {};
  const ins = q.Instructions?.Text ?? q.Instructions;
  const desc = q.Description?.Text ?? q.Description;
  const instructions = hasRich(rich(ins)) ? rich(ins) : rich(desc);
  const tl = q.SubmissionTimeLimit || q.TimeLimit || null;
  const att = q.AttemptsAllowed || null;
  return {
    instructions,
    start: q.StartDate || null,
    due: q.DueDate || null,
    closes: q.EndDate || null,
    timeLimit: tl && tl.IsEnforced !== false && num(tl.TimeLimitValue) ? tl.TimeLimitValue : null,
    attempts: att ? (att.IsUnlimited ? 'unlimited' : num(att.NumberOfAttemptsAllowed)) : null,
    password: !!q.Password,
    gradeItemId: q.GradeItemId ?? null
  };
}

/** 课件里的一个页面 / 活动 */
export function fromTopic(t, { fileUrl } = {}) {
  if (!t) return {};
  const isFile = t.TopicType === 1;
  return {
    instructions: rich(t.Description),
    attachments: isFile && fileUrl ? [{ name: cut(t.Title, 160), size: null, url: fileUrl(t.Id ?? t.Identifier) }] : [],
    links: t.TopicType === 3 && /^https?:/i.test(t.Url || '') ? [{ name: cut(t.Title, 160), url: t.Url }] : [],
    start: t.StartDate || null,
    due: t.DueDate || null,
    closes: t.EndDate || null
  };
}

/** 日历事件（考试、老师手动加的截止） */
export function fromEvent(ev) {
  if (!ev) return {};
  const d = ev.Description;
  const looksHtml = typeof d === 'string' && /<\/?[a-z][^>]*>/i.test(d);
  return {
    instructions: looksHtml ? { html: d.slice(0, MAX_HTML), text: '' } : rich(d),
    location: cut(ev.Location, 160) || null,
    start: ev.StartDateTime && ev.EndDateTime && ev.StartDateTime !== ev.EndDateTime ? ev.StartDateTime : null,
    allDay: !!ev.IsAllDayEvent
  };
}

/** 把几个来源的信息合成一份：前面的（作业箱 / 测验）优先 */
export function combineDetails(parts) {
  const out = { instructions: { html: '', text: '' }, attachments: [], links: [], rubrics: [], submissions: [], feedback: null, grade: null };
  for (const p of parts) {
    if (!p) continue;
    if (!hasRich(out.instructions) && hasRich(p.instructions)) out.instructions = p.instructions;
    for (const k of ['attachments', 'links', 'rubrics', 'submissions']) {
      for (const x of p[k] || []) if (!out[k].some((y) => (y.url && y.url === x.url) || (y.name && y.name === x.name && k !== 'submissions'))) out[k].push(x);
    }
    for (const k of ['points', 'start', 'due', 'closes', 'lateUntil', 'group', 'submitType', 'fileTypes', 'timeLimit', 'attempts', 'password', 'location', 'allDay', 'gradeItemId', 'feedback', 'grade']) {
      if (out[k] == null && p[k] != null && p[k] !== false) out[k] = p[k];
    }
  }
  out.empty = !hasRich(out.instructions) && !out.attachments.length && !out.links.length && !out.rubrics.length;
  return out;
}

export function fromGradeValue(v) {
  if (!v) return null;
  const n = num(v.PointsNumerator);
  const d = num(v.PointsDenominator);
  const shown = String(v.DisplayedGrade || '').trim();
  if (n == null && !shown) return null;
  return { num: n, den: d, displayed: shown, comments: rich(v.Comments) };
}

function soft(e, warnings, label) {
  if (e instanceof AuthRequiredError) throw e;
  if (!(e instanceof ApiError && (e.status === 403 || e.status === 404))) warnings.push(`${label}：${e.message}`);
  return null;
}

/**
 * 读一项的详情。client 要先 init()（拿到 API 版本号）。
 * 返回 combineDetails 的结果 + { fetchedAt, warnings }
 */
export async function fetchDetail(client, item, { now = new Date() } = {}) {
  const warnings = [];
  const parts = [];
  for (const t of detailTargets(item).slice(0, 3)) {
    const { courseId: ou, entityId: id } = t;
    if (t.source === 'dropbox') {
      const f = await client.dropboxFolder(ou, id).catch((e) => soft(e, warnings, '作业箱'));
      if (f) parts.push(fromDropbox(f, { fileUrl: (fid) => client.dropboxAttachmentUrl(ou, id, fid) }));
      const subs = await client.mySubmissions(ou, id).catch((e) => soft(e, warnings, '提交记录'));
      if (subs) parts.push(fromSubmissions(subs, { fileUrl: (sid, fid) => client.submissionFileUrl(ou, id, sid, fid) }));
    } else if (t.source === 'quiz') {
      const q = await client.quiz(ou, id).catch((e) => soft(e, warnings, '测验'));
      if (q) parts.push(fromQuiz(q));
    } else if (t.source === 'content') {
      const tp = await client.contentTopic(ou, id).catch((e) => soft(e, warnings, '课件'));
      if (tp) parts.push(fromTopic(tp, { fileUrl: (tid) => client.topicFileUrl(ou, tid) }));
    } else if (t.source === 'calendar' && /^\d+$/.test(id)) {
      const ev = await client.calendarEvent(ou, id).catch((e) => soft(e, warnings, '日历'));
      if (ev) parts.push(fromEvent(ev));
    }
  }
  const d = combineDetails(parts);
  // 分值（测验没写在测验里）和我的成绩、老师评语
  const ou = item.courseId;
  if (d.gradeItemId != null && client.gradeObject) {
    if (d.points == null) {
      const g = await client.gradeObject(ou, d.gradeItemId).catch((e) => soft(e, warnings, '成绩项'));
      if (g && num(g.MaxPoints)) d.points = g.MaxPoints;
    }
    const v = await client.myGradeValue(ou, d.gradeItemId).catch((e) => soft(e, warnings, '我的成绩'));
    d.grade = fromGradeValue(v);
  }
  d.fetchedAt = now.toISOString();
  d.warnings = warnings;
  return d;
}

/** 本机缓存：最多留 60 项，最近看的优先 */
export function putCache(cache = {}, key, detail, max = 60) {
  const next = { ...cache, [key]: detail };
  const keys = Object.keys(next).sort((a, b) => Date.parse(next[b]?.fetchedAt || 0) - Date.parse(next[a]?.fetchedAt || 0));
  for (const k of keys.slice(max)) delete next[k];
  return next;
}
