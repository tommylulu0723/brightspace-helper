// 公告和成绩：把 Brightspace 返回的原始数据整理成界面要用的样子。

const TEXT_MAX = 4000;

export function htmlToPlain(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 公告 → { id, courseId, title, text, date, modified, pinned, attachments } */
export function newsFrom(list, courseId) {
  const out = [];
  for (const n of list || []) {
    if (!n || n.IsHidden || n.IsPublished === false) continue;
    const date = n.StartDate || n.CreatedDate || n.LastModifiedDate;
    if (!date) continue;
    let text = n.Body?.Text || htmlToPlain(n.Body?.Html);
    text = htmlToPlain(text);
    if (text.length > TEXT_MAX) text = `${text.slice(0, TEXT_MAX)}…`;
    out.push({
      id: `news:${courseId}:${n.Id}`,
      courseId: String(courseId),
      title: String(n.Title || '（无标题）').trim(),
      text,
      date,
      modified: n.LastModifiedDate || null,
      pinned: !!n.IsPinned,
      attachments: (n.Attachments || []).length
    });
  }
  return out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 25);
}

// 5 = 计算项，6 = 公式，7 / 8 = 期末，9 = 类别：这些不是单独的作业成绩
const SKIP_TYPES = new Set([5, 6, 7, 8, 9]);

/** 成绩 → { final, items: [...] } */
export function gradesFrom(values, final) {
  const items = [];
  for (const v of values || []) {
    if (!v || SKIP_TYPES.has(v.GradeObjectType)) continue;
    const num = v.PointsNumerator;
    const den = v.PointsDenominator;
    const graded = num != null || (v.DisplayedGrade && String(v.DisplayedGrade).trim() !== '' && v.GradeObjectType === 4);
    if (!graded) continue;
    items.push({
      id: String(v.GradeObjectIdentifier ?? v.GradeObjectName),
      name: String(v.GradeObjectName || '').trim(),
      type: v.GradeObjectType,
      displayed: String(v.DisplayedGrade || '').trim(),
      num: num ?? null,
      den: den ?? null,
      pct: num != null && den ? Math.round((num / den) * 1000) / 10 : null,
      date: v.ReleasedDate || v.LastModified || null,
      feedback: !!(v.Comments?.Text || v.Comments?.Html)
    });
  }
  items.sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
  let fin = null;
  if (final && (final.PointsNumerator != null || (final.DisplayedGrade && String(final.DisplayedGrade).trim()))) {
    const n = final.PointsNumerator;
    const d = final.PointsDenominator;
    fin = {
      displayed: String(final.DisplayedGrade || '').trim(),
      pct: n != null && d ? Math.round((n / d) * 1000) / 10 : null,
      date: final.ReleasedDate || final.LastModified || null
    };
  }
  return { final: fin, items };
}

/** 已出分项目的总得分率（按分数加总，不考虑权重，只作参考） */
export function averagePct(items) {
  let n = 0, d = 0;
  for (const it of items || []) {
    if (it.num == null || !it.den) continue;
    n += it.num;
    d += it.den;
  }
  return d ? Math.round((n / d) * 1000) / 10 : null;
}

export function gradeTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 90) return 'ok';
  if (pct >= 75) return 'accent';
  if (pct >= 60) return 'warn';
  return 'danger';
}
