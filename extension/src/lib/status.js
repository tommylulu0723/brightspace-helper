// 判断"交没交"的几个补充来源：
// 1. 测验列表网页里的"已用次数 / 允许次数"（学生账号用接口查不到作答记录）
// 2. 作业列表网页里的"1 Submission, 1 File" / "Not Submitted"
// 3. 自己的成绩：测验或作业有了大于 0 的分数，说明肯定做过

import { normTitle } from './merge.js';

export function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#47;|&#x2f;/gi, '/')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ');
}

// 按某个链接参数（qi= / db=）把网页切成一行一行
function segmentsBy(html, param) {
  const re = new RegExp(`[?&;]${param}=(\\d+)`, 'g');
  const segs = [];
  let m;
  while ((m = re.exec(html))) {
    const last = segs[segs.length - 1];
    if (last && last.id === m[1]) continue;
    if (last) last.end = m.index;
    segs.push({ id: m[1], start: m.index, end: html.length });
  }
  return segs.map((s) => ({ id: s.id, text: stripTags(html.slice(s.start, Math.min(s.end, s.start + 20000))) }));
}

const ATTEMPTS_RE = /(?:^|[^\d/])(\d+)\s+\/\s+(\d+|unlimited|无限制|不限)(?![\d/])/i;

/** @returns {Map<string, {used:number, allowed:string}>} */
export function parseQuizListHtml(html) {
  const out = new Map();
  for (const s of segmentsBy(html, 'qi')) {
    if (out.has(s.id)) continue;
    const a = s.text.match(ATTEMPTS_RE);
    if (a) out.set(s.id, { used: Number(a[1]), allowed: a[2] });
  }
  return out;
}

/** @returns {Map<string, 'submitted'|'open'>} */
export function parseDropboxListHtml(html) {
  const out = new Map();
  for (const s of segmentsBy(html, 'db')) {
    if (out.has(s.id)) continue;
    const t = s.text;
    if (/not submitted|未提交|no submissions?/i.test(t)) { out.set(s.id, 'open'); continue; }
    const n = t.match(/(\d+)\s+submissions?/i);
    if (n) { out.set(s.id, Number(n[1]) > 0 ? 'submitted' : 'open'); continue; }
    if (/\bsubmitted\b|已提交/i.test(t)) out.set(s.id, 'submitted');
  }
  return out;
}

/** 把成绩按"成绩项 ID"和"名称"两种方式建索引 */
export function gradeIndex(values) {
  const byId = new Map();
  const byName = new Map();
  for (const v of values || []) {
    const num = v.PointsNumerator;
    const g = {
      graded: num != null,
      positive: typeof num === 'number' && num > 0,
      text: v.DisplayedGrade || (num != null && v.PointsDenominator != null ? `${num} / ${v.PointsDenominator}` : '')
    };
    if (v.GradeObjectIdentifier != null) byId.set(String(v.GradeObjectIdentifier), g);
    if (v.GradeObjectName) byName.set(normTitle(v.GradeObjectName), g);
  }
  return {
    find(gradeItemId, name) {
      return (gradeItemId != null && byId.get(String(gradeItemId))) || byName.get(normTitle(name)) || null;
    }
  };
}

/** 多个来源合成一个状态：只要有一个来源说"交了"就算交了 */
export function combineStatus(list) {
  if (list.includes('submitted')) return 'submitted';
  if (list.includes('completed')) return 'completed';
  if (list.includes('open')) return 'open';
  return 'unknown';
}
