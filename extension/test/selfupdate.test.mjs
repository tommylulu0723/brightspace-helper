import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFirstNotes } from '../src/lib/selfupdate.js';

const cfg = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
let n = 0;
const t = (name, fn) => { fn(); n++; };

t('读出最新一条更新说明，且和 manifest 版本一致', () => {
  const r = parseFirstNotes(cfg);
  assert.equal(r.v, manifest.version);
  assert.ok(r.items.length >= 1 && r.items.every((x) => x.length > 5));
});
t('支持转义的单引号', () => {
  const r = parseFirstNotes("export const VERSION_NOTES = [\n  { v: '9.9.9', d: 'x', items: ['it\\'s ok', 'b'] },\n  { v: '1', d: 'y', items: ['z'] }\n];");
  assert.deepEqual(r, { v: '9.9.9', items: ["it's ok", 'b'] });
});
t('内容不完整时返回 null', () => {
  assert.equal(parseFirstNotes(''), null);
  assert.equal(parseFirstNotes("export const VERSION_NOTES = [\n  { v: '1.2"), null);
});
console.log(`全部 ${n} 个测试通过`);
