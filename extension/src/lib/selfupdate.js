// 从 config.js 的源码里读出第一条更新说明（新版本还没加载，不能 import，只能当文本解析）
const STR = /'((?:[^'\\]|\\.)*)'/g;
const unq = (x) => x.replace(/\\'/g, "'");

function arrayAfter(block, key) {
  const i = block.search(new RegExp(`\\b${key}:\\s*\\[`));
  if (i < 0) return null;
  const start = block.indexOf('[', i);
  const end = block.indexOf(']', start); // 说明文字里不会出现 ]
  if (end < 0) return null;
  return [...block.slice(start + 1, end).matchAll(STR)].map((x) => unq(x[1]));
}

export function parseFirstNotes(configText) {
  const text = configText || '';
  const vm = /\{\s*v:\s*'([^']+)'/.exec(text);
  if (!vm) return null;
  // 找到和这个 { 配对的 }（跳过字符串里的括号）
  let depth = 0, inStr = false, end = -1;
  for (let i = vm.index; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === '\\') i++; else if (c === "'") inStr = false; continue; }
    if (c === "'") inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return null;
  const block = text.slice(vm.index, end);
  const items = arrayAfter(block, 'items');
  if (!items) return null;
  const en = arrayAfter(block, 'en');
  return en ? { v: vm[1], items, en } : { v: vm[1], items };
}
