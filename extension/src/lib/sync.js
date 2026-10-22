// 一次完整同步：课程列表 → 每门课的作业 / 测验 / 日历 / 课件 → 合并去重。
import { AuthRequiredError, ApiError } from './api.js';
import { mergeItems, isStartEvent } from './merge.js';
import { parseQuizListHtml, parseDropboxListHtml, gradeIndex, combineStatus } from './status.js';
import { flattenToc, tocFromStructure } from './materials.js';
import { gradesFrom, newsFrom } from './extras.js';

const DAY = 24 * 3600 * 1000;
export const WINDOW_PAST_DAYS = 14;
export const WINDOW_FUTURE_DAYS = 120;
const MAX_COURSES = 15;
const MATERIALS_TTL = 2 * 3600 * 1000; // 课件目录 2 小时刷新一次就够了
const CALENDAR_KEEP_RE = /due|deadline|exam|mid-?term|final|quiz|test|presentation|project|paper|essay|submission|report|截止|考试|期中|期末|作业|测验/i;

const MAX_ACTIVE = 25;

/** 所有选过的课（课程类型、可访问），带学期信息，按"是否当前学期 → 最近访问"排序 */
export function listAllCourses(enrollments, now) {
  const t = now.getTime();
  const list = [];
  const seen = new Set();
  for (const e of enrollments || []) {
    const ou = e.OrgUnit || {};
    const acc = e.Access || {};
    if (!ou.Id || seen.has(String(ou.Id))) continue;
    if (ou.Type && ou.Type.Id != null && ou.Type.Id !== 3) continue;
    if (acc.CanAccess === false) continue;
    seen.add(String(ou.Id));
    const end = acc.EndDate ? Date.parse(acc.EndDate) : null;
    const start = acc.StartDate ? Date.parse(acc.StartDate) : null;
    const current = acc.IsActive !== false && !(end && end < t - 21 * DAY) && !(start && start > t + 45 * DAY);
    list.push({
      id: String(ou.Id),
      name: ou.Name || ou.Code || `Course ${ou.Id}`,
      code: ou.Code || '',
      start: acc.StartDate || null,
      end: acc.EndDate || null,
      lastAccessed: acc.LastAccessed || null,
      current,
      hasDates: !!(start || end)
    });
  }
  list.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    if (a.hasDates !== b.hasDates) return a.hasDates ? -1 : 1;
    return (Date.parse(b.lastAccessed || 0) || 0) - (Date.parse(a.lastAccessed || 0) || 0);
  });
  return list;
}

/** 自动挑选的"本学期课程"（最多 15 门） */
export function pickCurrentCourses(enrollments, now) {
  return listAllCourses(enrollments, now).filter((c) => c.current).slice(0, MAX_COURSES);
}

/**
 * 实际要同步的课程 = 自动挑选的 + 你手动添加的 − 你移除的
 * @returns {{ all, auto:Set, active }}
 */
export function resolveCourses(enrollments, now, settings = {}) {
  const all = listAllCourses(enrollments, now);
  const auto = new Set(pickCurrentCourses(enrollments, now).map((c) => c.id));
  const added = new Set((settings.addedCourseIds || []).map(String));
  const hidden = new Set((settings.hiddenCourseIds || []).map(String));
  const active = all.filter((c) => (auto.has(c.id) || added.has(c.id)) && !hidden.has(c.id)).slice(0, MAX_ACTIVE);
  return { all, auto, added, hidden, active };
}

export function submissionStatus(data) {
  if (data == null) return 'unknown';
  const list = Array.isArray(data) ? data : [data];
  for (const e of list) {
    if (!e) continue;
    if (Array.isArray(e.Submissions) && e.Submissions.length) return 'submitted';
    if (e.Status === 1 || e.Status === 3) return 'submitted'; // 1 = 已提交，3 = 已出反馈
  }
  return 'open';
}

const CONTENT_TYPE = { 3: 'assignment', 4: 'quiz', 5: 'discussion', 6: 'discussion' };

function calendarType(ev) {
  const t = String(ev.AssociatedEntity?.AssociatedEntityType || '');
  if (/dropbox/i.test(t)) return 'assignment';
  if (/quiz/i.test(t)) return 'quiz';
  if (/discuss/i.test(t)) return 'discussion';
  return 'event';
}

function inWindow(iso, from, to) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t) && t >= from.getTime() && t <= to.getTime();
}

function absUrl(base, url) {
  if (!url) return null;
  try { return new URL(url, base).href; } catch { return null; }
}

async function pool(items, size, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

function soft(err, warnings, label) {
  if (err instanceof AuthRequiredError) throw err;
  if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return;
  warnings.push(`${label}：${err.message}`);
}

function lazy(fn) {
  let p = null;
  return () => (p ||= fn());
}

async function syncCourse(c, ctx) {
  const { client, base, from, to, prevSubmitted, submittedKeys, raw, warnings } = ctx;

  // 成绩、作业列表页、测验列表页：只有需要时才读，而且每门课最多读一次
  // 成绩：判断交没交要用，成绩页也要用，所以每门课都读一次（读不到就当没有）
  const gradeValues = ctx.gradeValuesOf.bind(null, c.id);
  const grades = lazy(() => gradeValues().then((v) => gradeIndex(v || [])));
  const dropboxPage = lazy(() => client.dropboxListPage(c.id).then(parseDropboxListHtml).catch((e) => { soft(e, warnings, `${c.name} 作业列表页`); return new Map(); }));
  const quizPage = lazy(() => client.quizListPage(c.id).then(parseQuizListHtml).catch((e) => { soft(e, warnings, `${c.name} 测验列表页`); return new Map(); }));

  // 作业箱
  try {
    const folders = await client.dropboxFolders(c.id);
    for (const f of folders) {
      if (f.IsHidden) continue;
      const due = f.DueDate || f.Availability?.EndDate || null;
      if (!inWindow(due, from, to)) continue;
      const key = `${c.id}:${f.Id}`;
      const signals = [];
      const votes = [];
      if (prevSubmitted.has(key)) {
        votes.push('submitted');
        signals.push('之前已确认提交');
      } else {
        try {
          const s = submissionStatus(await client.mySubmissions(c.id, f.Id));
          votes.push(s);
          signals.push(`提交记录接口：${s}`);
        } catch (e) {
          soft(e, warnings, `${c.name} 提交记录`);
          signals.push('提交记录接口：读不到');
        }
        if (!votes.includes('submitted')) {
          const page = (await dropboxPage()).get(String(f.Id));
          if (page) { votes.push(page); signals.push(`作业列表页：${page}`); }
          const g = (await grades()).find(f.GradeItemId, f.Name);
          if (g?.positive) { votes.push('submitted'); signals.push(`已有成绩：${g.text}`); }
        }
      }
      const status = combineStatus(votes);
      if (status === 'submitted') submittedKeys.add(key);
      raw.push({
        source: 'dropbox', courseId: c.id, entityId: f.Id, title: f.Name, type: 'assignment', due, status, signals,
        url: `${base}/d2l/lms/dropbox/user/folder_submit_files.d2l?db=${f.Id}&ou=${c.id}`
      });
    }
  } catch (e) {
    soft(e, warnings, `${c.name} 作业`);
  }

  // 测验：学生账号查不到作答记录，用测验列表页的"已用次数"和成绩判断
  try {
    const quizzes = (await client.quizzes(c.id)).filter((q) => q.IsActive !== false && inWindow(q.DueDate || q.EndDate, from, to));
    for (const q of quizzes) {
      const due = q.DueDate || q.EndDate;
      const signals = [];
      const votes = [];
      const att = (await quizPage()).get(String(q.QuizId));
      if (att) {
        votes.push(att.used > 0 ? 'completed' : 'open');
        signals.push(`作答次数：${att.used} / ${att.allowed}`);
      }
      if (!votes.includes('completed')) {
        const g = (await grades()).find(q.GradeItemId, q.Name);
        if (g?.positive) { votes.push('completed'); signals.push(`已有成绩：${g.text}`); }
      }
      raw.push({
        source: 'quiz', courseId: c.id, entityId: q.QuizId, title: q.Name, type: 'quiz', due, status: combineStatus(votes), signals,
        url: `${base}/d2l/lms/quizzing/user/quiz_summary.d2l?qi=${q.QuizId}&ou=${c.id}`
      });
    }
  } catch (e) {
    soft(e, warnings, `${c.name} 测验`);
  }

  // 日历：补上老师手动加的考试、项目截止等
  try {
    const events = await client.calendarEvents(c.id, from, to);
    for (const ev of events) {
      const title = ev.Title || ev.Name || '';
      if (!title || isStartEvent(title)) continue;
      const due = ev.EndDateTime || ev.StartDateTime || null;
      if (!inWindow(due, from, to)) continue;
      const type = calendarType(ev);
      if (type === 'event' && !CALENDAR_KEEP_RE.test(title)) continue;
      raw.push({
        source: 'calendar', courseId: c.id, entityId: ev.CalendarEventId ?? title, title, type, due, status: 'unknown', signals: [],
        url: absUrl(base, ev.CalendarEventViewUrl) || `${base}/d2l/le/calendar/${c.id}`
      });
    }
  } catch (e) {
    soft(e, warnings, `${c.name} 日历`);
  }
}

async function syncExtras(c, ctx) {
  const { client, now, warnings, gradeValuesOf } = ctx;
  // 公告：最近 45 天
  try {
    const list = await client.news(c.id, new Date(now.getTime() - 45 * DAY));
    ctx.news.push(...newsFrom(list, c.id));
  } catch (e) {
    soft(e, warnings, `${c.name} 公告`);
  }
  // 成绩：每个成绩项 + 期末成绩（老师没公布时读不到，正常）
  const values = await gradeValuesOf(c.id);
  let final = null;
  try { final = await client.finalGrade(c.id); } catch (e) { if (e instanceof AuthRequiredError) throw e; }
  if (values || final) ctx.grades[c.id] = gradesFrom(values || [], final);
}

async function syncMaterials(c, ctx) {
  const { client, base, prevMaterials, materials, now, warnings } = ctx;
  const prev = prevMaterials[c.id];
  if (prev && prev.fetchedAt && now.getTime() - Date.parse(prev.fetchedAt) < MATERIALS_TTL && !ctx.forceMaterials) {
    materials[c.id] = prev;
    return;
  }
  const flatCtx = { base, ou: c.id, fileUrl: (id) => client.topicFileUrl(c.id, id) };
  try {
    let toc;
    try {
      toc = await client.contentToc(c.id);
    } catch (e) {
      if (e instanceof AuthRequiredError) throw e;
      toc = await tocFromStructure(client, c.id);
    }
    materials[c.id] = { ...flattenToc(toc, flatCtx), fetchedAt: now.toISOString() };
  } catch (e) {
    soft(e, warnings, `${c.name} 课件`);
    if (prev) materials[c.id] = prev;
  }
}

/**
 * @param {object} p
 * @param {ReturnType<import('./api.js').createClient>} p.client
 * @param {Date} [p.now]
 * @param {object} [p.prev]      上一次同步结果
 * @param {object} [p.settings]  { hiddenCourseIds: [], addedCourseIds: [] }
 * @param {boolean} [p.forceMaterials] 忽略缓存，重新读课件目录
 */
export async function runSync({ client, now = new Date(), prev = {}, settings = {}, forceMaterials = false }) {
  const warnings = [];
  const base = client.base;
  const me = await client.init();

  const enrollments = await client.myEnrollments();
  const { all, auto, active } = resolveCourses(enrollments, now, settings);
  const activeIds = new Set(active.map((c) => c.id));

  const ctx = {
    client, base, now, warnings, forceMaterials,
    from: new Date(now.getTime() - WINDOW_PAST_DAYS * DAY),
    to: new Date(now.getTime() + WINDOW_FUTURE_DAYS * DAY),
    prevSubmitted: new Set(prev.submittedKeys || []),
    prevMaterials: prev.materials || {},
    submittedKeys: new Set(),
    news: [],
    grades: {},
    gradeValuesOf: null,
    raw: [],
    materials: {}
  };
  const gradeMemo = new Map();
  ctx.gradeValuesOf = (ou) => {
    if (!gradeMemo.has(ou)) {
      const c = active.find((x) => x.id === ou);
      gradeMemo.set(ou, client.myGradeValues(ou).catch((e) => { soft(e, warnings, `${c?.name || ou} 成绩`); return null; }));
    }
    return gradeMemo.get(ou);
  };

  await pool(active, 3, async (c) => {
    await syncCourse(c, ctx);
    await syncExtras(c, ctx);
    await syncMaterials(c, ctx);
  });

  // 课件里带截止时间的活动：有完成时间就算完成；没有完成时间不代表没交（很多课没开完成追踪）
  if (active.length) {
    try {
      for (let i = 0; i < active.length; i += 100) {
        const ids = active.slice(i, i + 100).map((c) => c.id);
        const list = await client.contentItems(ids, ctx.from, ctx.to);
        for (const it of list) {
          if (!it.DueDate || it.IsExempt || it.ActivityType === 0) continue;
          if (!inWindow(it.DueDate, ctx.from, ctx.to)) continue;
          ctx.raw.push({
            source: 'content', courseId: String(it.OrgUnitId), entityId: it.ItemId, title: it.ItemName,
            type: CONTENT_TYPE[it.ActivityType] || 'other', due: it.DueDate,
            status: it.DateCompleted ? 'completed' : 'unknown',
            signals: it.DateCompleted ? ['课件进度：已完成'] : [],
            url: absUrl(base, it.ItemUrl) || `${base}/d2l/le/content/${it.OrgUnitId}/viewContent/${it.ItemId}/View`
          });
        }
      }
    } catch (e) {
      soft(e, warnings, '课件进度');
    }
  }

  const known = new Set(active.map((c) => c.id));
  const items = mergeItems(ctx.raw.filter((r) => known.has(String(r.courseId))));

  return {
    user: me ? {
      name: [me.FirstName, me.LastName].filter(Boolean).join(' ') || me.UniqueName || '',
      firstName: me.FirstName || '', lastName: me.LastName || '',
      id: me.Identifier != null ? String(me.Identifier) : '', uniqueName: me.UniqueName || ''
    } : null,
    // courses = 正在同步的课；allCourses = 所有选过的课（课程管理里用）
    courses: active.map((c) => ({
      id: c.id, name: c.name, code: c.code, hidden: false, auto: auto.has(c.id),
      count: items.filter((it) => it.courseId === c.id).length
    })),
    allCourses: all.map((c) => ({
      id: c.id, name: c.name, code: c.code, start: c.start, end: c.end, current: c.current,
      auto: auto.has(c.id), active: activeIds.has(c.id)
    })),
    items,
    materials: ctx.materials,
    news: ctx.news.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    grades: ctx.grades,
    submittedKeys: [...ctx.submittedKeys],
    lastSync: now.toISOString(),
    warnings,
    requestCount: client.requestCount,
    usingFallback: client.usingFallback
  };
}
