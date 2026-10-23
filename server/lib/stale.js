// "课程助手好久没同步了"提醒：纯函数，方便测试。
// 规则：
//   - 数据（插件最后一次成功读到 Brightspace 的时间）超过 48 小时：发第 1 封
//   - 还是没同步，超过 7 天：再发第 2 封，之后不再打扰（重新同步后重新计算）
//   - 只在纽约时间 9:00–21:00 发，不半夜吵人
//   - 从来没同步过的、超过 30 天没同步的（多半不用了）不发
//   - 插件最近还连过服务器、但数据是旧的 → 多半是 Brightspace 登录过期；连都没连 → 电脑 / Chrome 没开
const H = 3600 * 1000;
const TZ = 'America/New_York';
export const STALE_AFTER_H = 48;
export const SECOND_AFTER_H = 7 * 24;
const GIVE_UP_H = 30 * 24;

export function nyHour(now) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(now));
}

/**
 * user: { reminders: { stale }, health: { code, at }, pingAt }
 * state: { snapshotAt, staleNotice: { for, count, lastAt } }
 * 返回 null（不用发）或 { stage, hours, reason: 'login' | 'offline' }
 */
export function staleCheck({ user, state, now = new Date() }) {
  if (!user || user.reminders?.stale === false) return null;
  const at = Number(state?.snapshotAt) || 0;
  if (!at) return null;
  const t = now.getTime();
  const hours = (t - at) / H;
  if (hours < STALE_AFTER_H || hours > GIVE_UP_H) return null;
  const n = state.staleNotice && state.staleNotice.for === at ? state.staleNotice.count || 0 : 0;
  if (n >= 2) return null;
  if (n === 1 && hours < SECOND_AFTER_H) return null;
  const hr = nyHour(now);
  if (hr < 9 || hr >= 21) return null;
  const ping = Date.parse(user.pingAt || 0) || 0;
  const recent = t - ping < 24 * H;
  // 插件 24 小时内还连过服务器（会顺便报告同步状态），数据却是旧的：读不到 Brightspace
  const reason = recent ? 'login' : 'offline';
  return { stage: n + 1, hours, reason };
}

/** 上次同步时，接下来 7 天还没完成的事项（最多 5 项），放进邮件里让人心里有数 */
export function upcomingFrom({ snapshot, overrides = {}, hiddenCourseIds = [], now = new Date(), isDone, days = 7, max = 5 }) {
  if (!snapshot || !Array.isArray(snapshot.items)) return [];
  const hidden = new Set(hiddenCourseIds || []);
  const courses = new Map((snapshot.courses || []).map((c) => [c.id, c]));
  const t = now.getTime();
  return snapshot.items
    .filter((it) => {
      const c = courses.get(it.courseId);
      const due = Date.parse(it.due);
      return c && !c.hidden && !hidden.has(it.courseId) && Number.isFinite(due) && due > t && due - t <= days * 24 * H && !(isDone && isDone(it, overrides));
    })
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due))
    .slice(0, max)
    .map((it) => ({ item: it, courseName: courses.get(it.courseId)?.name || '' }));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function when(iso, lang) {
  const en = lang === 'en';
  return new Intl.DateTimeFormat(en ? 'en-US' : 'zh-CN', { timeZone: TZ, month: en ? 'short' : 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: en }).format(new Date(iso));
}

export function buildStaleEmail({ name, hours, reason, upcoming = [], siteUrl = '', lang = 'zh' }) {
  const en = lang === 'en';
  const d = Math.max(2, Math.floor(hours / 24));
  const subject = en
    ? `Course Helper hasn't synced for ${d} days`
    : `课程助手已经 ${d} 天没更新数据了`;
  const why = reason === 'login'
    ? (en
      ? 'The extension is running, but it can\'t read Brightspace — your Brightspace login has most likely expired.'
      : '电脑上的插件在运行，但读不到 Brightspace，多半是 Brightspace 登录过期了。')
    : (en
      ? 'The extension on your computer hasn\'t run for a while (the computer or Chrome hasn\'t been open).'
      : '电脑上的插件这几天没有运行（电脑或 Chrome 没打开）。');
  const fix = reason === 'login'
    ? (en ? 'Fix: on your computer, open Brightspace in Chrome and sign in. Course Helper picks up automatically within a minute.' : '解决：在电脑上用 Chrome 打开 Brightspace 登录一下，课程助手一分钟内会自动继续同步。')
    : (en ? 'Fix: open Chrome on your computer and sign in to Brightspace if asked. Course Helper syncs automatically.' : '解决：在电脑上打开 Chrome，如果 Brightspace 要求登录就登录一下，课程助手会自动同步。');
  const risk = en
    ? 'Until then, deadline reminders are based on old data — new assignments or changed due dates won\'t be included.'
    : '在这之前，截止提醒用的都是旧数据：老师新布置的作业、改过的截止时间都不会包含进来。';
  const upTitle = en ? 'As of the last sync, coming up in the next 7 days:' : '按上次同步的数据，接下来 7 天要交：';
  const stop = en
    ? 'To stop these emails: extension → Settings → Account → Email reminders.'
    : '不想收这类邮件：插件 → 设置 → 账号 → 邮件提醒。';
  const hi = en ? `Hi ${name || 'there'},` : `${name || '同学'}，你好：`;

  const text = [
    hi, '',
    why, fix, '',
    risk,
    upcoming.length ? '' : null,
    upcoming.length ? upTitle : null,
    ...upcoming.map((p) => `• [${p.courseName}] ${p.item.title} — ${when(p.item.due, lang)}`),
    '',
    siteUrl ? (en ? `On your phone: ${siteUrl}/m/` : `手机上查看：${siteUrl}/m/`) : null,
    en ? `— Course Helper (${stop})` : `—— 课程助手（${stop}）`
  ].filter((x) => x != null).join('\n');

  const rows = upcoming.map((p) => `<tr><td style="padding:10px 14px;border-top:1px solid #eee">
      <div style="font-size:12px;color:#6b7280">${esc(p.courseName)}</div>
      <div style="font-size:14px;font-weight:600;color:#111827">${esc(p.item.title)}</div>
      <div style="font-size:12px;color:#6b7280">${esc(when(p.item.due, lang))}</div></td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-size:13px;color:#57068C;font-weight:700;margin-bottom:10px">${en ? 'Course Helper · Sync check' : '课程助手 · 同步检查'}</div>
  <div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee">
    <div style="padding:16px 14px;font-size:15px;color:#111827;line-height:1.6">
      <p style="margin:0 0 8px">${esc(hi)}</p>
      <p style="margin:0 0 8px"><b>${esc(subject)}${en ? '.' : '。'}</b>${esc(why)}</p>
      <p style="margin:0 0 8px;padding:10px 12px;background:#F3E8FF;border-radius:10px;color:#3B0764">${esc(fix)}</p>
      <p style="margin:0;font-size:13px;color:#B45309">${esc(risk)}</p>
    </div>
    ${upcoming.length ? `<div style="padding:10px 14px 4px;font-size:13px;color:#6b7280;border-top:1px solid #eee">${esc(upTitle)}</div><table style="width:100%;border-collapse:collapse">${rows}</table>` : ''}
  </div>
  <p style="font-size:12px;color:#6b7280;margin:12px 4px;line-height:1.6">${siteUrl ? `<a href="${esc(siteUrl)}/m/" style="color:#57068C">${en ? 'See your deadlines on your phone' : '在手机上查看截止时间'}</a><br>` : ''}${esc(stop)}</p>
</div></body></html>`;
  return { subject, text, html };
}
