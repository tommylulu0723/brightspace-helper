// 注册姓名 和 Brightspace 上的姓名 对比。
// 宽松但不糊弄：忽略大小写、重音、空格 / 连字符 / 点；
// 名字允许一边多中间名（"Tommy" 对 "Tommy J"），姓必须一致。

export function normName(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/[-_,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (s) => normName(s).split(' ').filter(Boolean);

function firstMatches(a, b) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return false;
  if (wa.join(' ') === wb.join(' ')) return true;
  // 一边是另一边的开头几个词（有中间名的情况）
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short.every((w, i) => w === long[i]);
}

function lastMatches(a, b) {
  const x = words(a).join('');
  const y = words(b).join('');
  return !!x && x === y;
}

/**
 * registered: { firstName, lastName }，bs: { firstName, lastName }
 * 返回 true 表示是同一个人
 */
export function namesMatch(registered, bs) {
  if (!registered || !bs) return false;
  if (lastMatches(registered.lastName, bs.lastName) && firstMatches(registered.firstName, bs.firstName)) return true;
  // 有的人在 Brightspace 里名和姓是反的（中文名常见）
  if (lastMatches(registered.lastName, bs.firstName) && firstMatches(registered.firstName, bs.lastName)) return true;
  return false;
}

export function displayName(first, last) {
  return [String(first || '').trim(), String(last || '').trim()].filter(Boolean).join(' ');
}
