// 今日计划：从所有没完成的事项里挑出这几天该做的，按"离截止多近 + 类型"排序。
import { isDone, formatDue } from './format.js';

const HOUR = 3600 * 1000;
export const PLAN_WINDOW_H = 72;          // 截止前 3 天开始出现在计划里
export const EXAM_WINDOW_H = 7 * 24;      // 考试提前 7 天开始复习

// 越重要的类型系数越大：同样还剩 72 小时，考试会排在作业前面
const WEIGHT = { exam: 3, presentation: 2.5, assignment: 1.5, quiz: 1.5, discussion: 1, event: 1, other: 1 };

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function planReason(it, now = new Date()) {
  const ms = Date.parse(it.due) - now.getTime();
  if (ms < 0) return { text: '已逾期，尽快补交', tone: 'danger' };
  const days = Math.round((startOfDay(Date.parse(it.due)) - startOfDay(now)) / (24 * HOUR));
  if (it.type === 'presentation') {
    if (days <= 0) return { text: `今天展示 · ${formatDue(it.due, now).replace('今天 ', '')}`, tone: 'danger' };
    if (days === 1) return { text: '明天展示，最后准备', tone: 'warn' };
    return { text: `${days} 天后展示，开始准备`, tone: 'accent' };
  }
  if (it.type === 'exam') {
    if (days <= 0) return { text: `今天考试 · ${formatDue(it.due, now).replace('今天 ', '')}`, tone: 'danger' };
    if (days === 1) return { text: '明天考试，最后复习', tone: 'warn' };
    return { text: `${days} 天后考试，开始复习`, tone: 'accent' };
  }
  if (ms < 6 * HOUR) return { text: `${Math.max(1, Math.round(ms / HOUR))} 小时内截止`, tone: 'danger' };
  if (days <= 0) return { text: `今天 ${formatDue(it.due, now).replace('今天 ', '')} 截止`, tone: 'warn' };
  if (days === 1) return { text: `明天 ${formatDue(it.due, now).replace('明天 ', '')} 截止`, tone: 'warn' };
  return { text: `${days} 天后截止`, tone: 'neutral' };
}

/**
 * @returns {Array<item & { score, reason }>} 排好序的今日计划
 */
export function buildPlan(items, now = new Date(), overrides = {}) {
  const t = now.getTime();
  const out = [];
  for (const it of items || []) {
    if (isDone(it, overrides)) continue;
    const ms = Date.parse(it.due) - t;
    if (Number.isNaN(ms)) continue;
    let score;
    if (ms < 0) {
      if (it.status !== 'open') continue;            // 查不到状态的过期事项不放进计划
      if (ms < -7 * 24 * HOUR) continue;             // 过期太久的不再催
      score = -1e6 + ms / HOUR;
    } else {
      const window = it.type === 'exam' || it.type === 'presentation' ? EXAM_WINDOW_H : PLAN_WINDOW_H;
      if (ms > window * HOUR) continue;
      score = ms / HOUR / (WEIGHT[it.type] || 1);
    }
    out.push({ ...it, score, reason: planReason(it, now) });
  }
  return out.sort((a, b) => a.score - b.score);
}
