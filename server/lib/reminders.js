// 截止提醒邮件：挑出该提醒的事项、组装邮件内容。纯函数，方便测试。
// 规则：
//   - 截止前 24 小时提醒一次，截止前 3 小时再提醒一次（可以在设置里关掉其中一个）
//   - 已完成（Brightspace 显示已交，或者自己勾了完成）的不提醒；被移除的课不提醒
//   - 同一时间段到期的几项合并成一封邮件
//   - 如果进入 3 小时窗口时 24 小时那封还没发（比如刚注册），只发 3 小时的
export const WINDOWS = [
  { key: '24h', hours: 24, label: '24 小时内到期' },
  { key: '3h', hours: 3, label: '3 小时内到期' }
];

const TZ = 'America/New_York';
const H = 3600 * 1000;

export function itemKey(it) {
  return String(it.id || (it.ids && it.ids[0]) || `${it.courseId}:${it.title}:${it.due}`);
}

/**
 * snapshot: 插件上传的快照；overrides: 手动标记完成；hiddenCourseIds: 移除的课
 * sent: { [itemKey|window]: ISO }；prefs: { h24: true, h3: true }
 * isDone(item, overrides): 和插件共用的判断
 * 返回 [{ item, courseName, window }]，按截止时间排序
 */
export function pickReminders({ snapshot, overrides = {}, hiddenCourseIds = [], sent = {}, prefs = {}, now = new Date(), isDone }) {
  if (!snapshot || !Array.isArray(snapshot.items)) return [];
  const hidden = new Set(hiddenCourseIds || []);
  const courses = new Map((snapshot.courses || []).map((c) => [c.id, c]));
  const on = { '24h': prefs.h24 !== false, '3h': prefs.h3 !== false };
  const t = now.getTime();
  const out = [];
  for (const it of snapshot.items) {
    if (!it || !it.due) continue;
    const course = courses.get(it.courseId);
    if (!course || course.hidden || hidden.has(it.courseId)) continue;
    const due = Date.parse(it.due);
    if (!Number.isFinite(due) || due <= t) continue;
    if (isDone && isDone(it, overrides)) continue;
    const left = due - t;
    const key = itemKey(it);
    // 从最紧的窗口往外找：落在哪个窗口里就发哪个
    const win = [...WINDOWS].sort((a, b) => a.hours - b.hours).find((w) => on[w.key] && left <= w.hours * H);
    if (!win) continue;
    if (sent[`${key}|${win.key}`]) continue;
    // 3 小时窗口里，如果 24 小时那封刚发过（1 小时内），不要连发两封
    if (win.key === '3h' && sent[`${key}|24h`] && t - Date.parse(sent[`${key}|24h`]) < H) continue;
    out.push({ item: it, courseName: course.name || '', window: win.key });
  }
  return out.sort((a, b) => Date.parse(a.item.due) - Date.parse(b.item.due));
}

/** 删掉两周前的发送记录，免得越积越多 */
export function pruneSent(sent = {}, now = new Date()) {
  const out = {};
  for (const [k, v] of Object.entries(sent)) if (now.getTime() - Date.parse(v) < 14 * 24 * H) out[k] = v;
  return out;
}

const TYPE = { assignment: '作业', quiz: '测验', exam: '考试', discussion: '讨论', checklist: '清单', survey: '问卷', content: '课程内容', other: '事项' };

const TYPE_EN = { assignment: 'Assignment', quiz: 'Quiz', exam: 'Exam', discussion: 'Discussion', checklist: 'Checklist', survey: 'Survey', content: 'Content', other: 'Item' };

export function fmtDue(iso, now = new Date(), lang = 'zh') {
  const d = new Date(iso);
  const left = d.getTime() - now.getTime();
  const en = lang === 'en';
  const when = new Intl.DateTimeFormat(en ? 'en-US' : 'zh-CN', { timeZone: TZ, month: en ? 'short' : 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: en }).format(d);
  const hrs = Math.floor(left / H);
  const mins = Math.max(0, Math.round((left % H) / 60000));
  const rel = en
    ? (hrs >= 1 ? `${hrs} h${mins ? ` ${mins} min` : ''} left` : `${mins} min left`)
    : (hrs >= 1 ? `还剩 ${hrs} 小时${mins ? ` ${mins} 分` : ''}` : `还剩 ${mins} 分钟`);
  return { when: en ? `${when} (New York time)` : `${when}（纽约时间）`, rel };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 一封提醒邮件 */
export function buildReminderEmail({ name, picks, now = new Date(), siteUrl = '', snapshotAt = 0, lang = 'zh' }) {
  if (lang === 'en') return buildReminderEmailEn({ name, picks, now, siteUrl, snapshotAt });
  const urgent = picks.some((p) => p.window === '3h');
  const first = picks[0];
  const subject = picks.length === 1
    ? `${urgent ? '⏰ 3 小时内' : '📌 明天'}截止：${first.item.title}`
    : `${urgent ? '⏰' : '📌'} ${picks.length} 项${urgent ? '快要' : '24 小时内'}截止：${first.item.title} 等`;
  const stale = snapshotAt && now.getTime() - snapshotAt > 36 * H
    ? `注意：这些数据来自 ${Math.round((now.getTime() - snapshotAt) / (24 * H))} 天前的同步，电脑上的插件这几天没有同步过，老师之后改的截止时间可能没包含进来。`
    : '';

  const lines = picks.map((p) => {
    const d = fmtDue(p.item.due, now);
    return `• [${p.courseName}] ${p.item.title}（${TYPE[p.item.type] || '事项'}）\n  ${d.when}，${d.rel}${p.item.url ? `\n  ${p.item.url}` : ''}`;
  });
  const text = [
    `${name || '同学'}，你好：`,
    '',
    `下面 ${picks.length} 项快到截止时间了，还没有提交：`,
    '',
    ...lines,
    '',
    stale,
    '已经交了？在课程助手里勾选"完成"，就不会再提醒这一项。',
    siteUrl ? `手机上查看：${siteUrl}/m/` : '',
    '',
    '—— 课程助手（不想收提醒：插件 → 设置 → 账号 → 邮件提醒）'
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');

  const rows = picks.map((p) => {
    const d = fmtDue(p.item.due, now);
    const tone = p.window === '3h' ? '#B91C1C' : '#B45309';
    return `<tr><td style="padding:12px 14px;border-bottom:1px solid #eee">
      <div style="font-size:12px;color:#6b7280">${esc(p.courseName)} · ${esc(TYPE[p.item.type] || '事项')}</div>
      <div style="font-size:15px;font-weight:600;color:#111827;margin:2px 0">${p.item.url ? `<a href="${esc(p.item.url)}" style="color:#111827;text-decoration:none">${esc(p.item.title)}</a>` : esc(p.item.title)}</div>
      <div style="font-size:13px;color:${tone}">${esc(d.when)} · ${esc(d.rel)}</div>
    </td></tr>`;
  }).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-size:13px;color:#57068C;font-weight:700;margin-bottom:10px">课程助手 · 截止提醒</div>
  <div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee">
    <div style="padding:16px 14px;border-bottom:1px solid #eee;font-size:15px;color:#111827">${esc(name || '同学')}，下面 ${picks.length} 项快到截止时间了，还没有提交：</div>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
  </div>
  ${stale ? `<p style="font-size:12px;color:#B45309;margin:12px 4px">${esc(stale)}</p>` : ''}
  <p style="font-size:12px;color:#6b7280;margin:12px 4px;line-height:1.6">已经交了？在课程助手里勾选"完成"，就不会再提醒这一项。${siteUrl ? `<br><a href="${esc(siteUrl)}/m/" style="color:#57068C">在手机上查看全部截止时间</a>` : ''}<br>不想收提醒：插件 → 设置 → 账号 → 邮件提醒。</p>
</div></body></html>`;
  return { subject, text, html };
}

function buildReminderEmailEn({ name, picks, now, siteUrl, snapshotAt }) {
  const urgent = picks.some((p) => p.window === '3h');
  const first = picks[0];
  const subject = picks.length === 1
    ? `${urgent ? '⏰ Due in 3 hours' : '📌 Due tomorrow'}: ${first.item.title}`
    : `${urgent ? '⏰' : '📌'} ${picks.length} items due ${urgent ? 'soon' : 'within 24 hours'}: ${first.item.title} and more`;
  const days = Math.round((now.getTime() - snapshotAt) / (24 * H));
  const stale = snapshotAt && now.getTime() - snapshotAt > 36 * H
    ? `Note: this is based on a sync from ${days} day${days === 1 ? '' : 's'} ago — the extension on your computer hasn't synced since, so recent due-date changes may be missing.`
    : '';
  const lines = picks.map((p) => {
    const d = fmtDue(p.item.due, now, 'en');
    return `• [${p.courseName}] ${p.item.title} (${TYPE_EN[p.item.type] || 'Item'})\n  ${d.when}, ${d.rel}${p.item.url ? `\n  ${p.item.url}` : ''}`;
  });
  const text = [
    `Hi ${name || 'there'},`, '',
    `${picks.length === 1 ? 'This item is' : `These ${picks.length} items are`} due soon and not submitted yet:`, '',
    ...lines, '', stale,
    'Already submitted? Mark it done in Course Helper and you won\'t be reminded again.',
    siteUrl ? `On your phone: ${siteUrl}/m/` : '', '',
    '— Course Helper (to stop these emails: extension → Settings → Account → Email reminders)'
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  const rows = picks.map((p) => {
    const d = fmtDue(p.item.due, now, 'en');
    const tone = p.window === '3h' ? '#B91C1C' : '#B45309';
    return `<tr><td style="padding:12px 14px;border-bottom:1px solid #eee">
      <div style="font-size:12px;color:#6b7280">${esc(p.courseName)} · ${esc(TYPE_EN[p.item.type] || 'Item')}</div>
      <div style="font-size:15px;font-weight:600;color:#111827;margin:2px 0">${p.item.url ? `<a href="${esc(p.item.url)}" style="color:#111827;text-decoration:none">${esc(p.item.title)}</a>` : esc(p.item.title)}</div>
      <div style="font-size:13px;color:${tone}">${esc(d.when)} · ${esc(d.rel)}</div>
    </td></tr>`;
  }).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-size:13px;color:#57068C;font-weight:700;margin-bottom:10px">Course Helper · Deadline reminder</div>
  <div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee">
    <div style="padding:16px 14px;border-bottom:1px solid #eee;font-size:15px;color:#111827">Hi ${esc(name || 'there')}, ${picks.length === 1 ? 'this item is' : `these ${picks.length} items are`} due soon and not submitted yet:</div>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
  </div>
  ${stale ? `<p style="font-size:12px;color:#B45309;margin:12px 4px">${esc(stale)}</p>` : ''}
  <p style="font-size:12px;color:#6b7280;margin:12px 4px;line-height:1.6">Already submitted? Mark it done in Course Helper and you won't be reminded again.${siteUrl ? `<br><a href="${esc(siteUrl)}/m/" style="color:#57068C">See all deadlines on your phone</a>` : ''}<br>To stop these emails: extension → Settings → Account → Email reminders.</p>
</div></body></html>`;
  return { subject, text, html };
}
