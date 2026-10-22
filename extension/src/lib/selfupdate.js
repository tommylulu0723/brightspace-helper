// 从 config.js 的源码里读出第一条更新说明（新版本还没加载，不能 import，只能当文本解析）
const NOTES_RE = /v:\s*'([^']+)'[\s\S]*?items:\s*\[([\s\S]*?)\]\s*\}/;

export function parseFirstNotes(configText) {
  const m = NOTES_RE.exec(configText || '');
  if (!m) return null;
  const items = [...m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"));
  return { v: m[1], items };
}

