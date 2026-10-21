// 生成 .ics 文件，可以导入 Google 日历 / Apple 日历 / Outlook。
import { TYPE_LABEL } from './format.js';

function esc(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function stamp(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// RFC 5545：每行最多 75 个字节，超出要折行（续行以空格开头）
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75;
    if (curLen + len > limit) {
      parts.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function buildIcs(items, courseNames, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Course Helper//Brightspace Deadlines//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Brightspace 截止时间'
  ];
  for (const it of items) {
    const course = courseNames[it.courseId] || '';
    const label = TYPE_LABEL[it.type] || '';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${esc(it.id.replace(/[^\w:.-]/g, '_'))}@course-helper`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `DTSTART:${stamp(it.due)}`,
      `DTEND:${stamp(it.due)}`,
      `SUMMARY:${esc(`[${course}] ${it.title}${label ? `（${label}）` : ''}`)}`,
      `DESCRIPTION:${esc(`${course} · ${label}${it.url ? `\n${it.url}` : ''}`)}`,
      ...(it.url ? [`URL:${esc(it.url)}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`${it.title} 明天到期`)}`,
      'TRIGGER:-PT24H',
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
