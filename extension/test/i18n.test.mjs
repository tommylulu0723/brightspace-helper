import assert from 'node:assert/strict';
import { tr, setLang } from '../src/lib/i18n.js';
let n = 0;
const t = (name, fn) => { fn(); n++; };
t('中文模式原样返回', () => { setLang('zh'); assert.equal(tr('今天 20:40'), '今天 20:40'); });
t('整句、带变量、嵌套', () => {
  setLang('en');
  assert.equal(tr('今天 20:40'), 'Today 20:40');
  assert.equal(tr('已过 15 小时'), '15 h ago');
  assert.equal(tr('还剩 4 天'), '4 days left');
  assert.equal(tr('已同步 · 3 分钟前'), 'Synced · 3 min ago');
  assert.equal(tr('检测到更新 1.3.3（当前 1.3.2）'), 'Update available: 1.3.3 (current 1.3.2)');
  assert.equal(tr('10/25 周日 03:01'), '10/25 Sun 03:01');
  assert.equal(tr('{} 个下载成功，{} 个失败（可能需要先登录 Brightspace）'.replace('{}', '3').replace('{}', '1')), '3 downloaded, 1 failed (you may need to log in to Brightspace first)');
});
t('用 · 拼接的句子两边分别翻译', () => {
  assert.equal(tr('本学期 · 未同步 · 2'), 'This term · not synced · 2');
  assert.equal(tr('DEMO-101 · 自动识别为本学期'), 'DEMO-101 · Detected as this term');
});
t('开头带"· "的片段：分隔符不会被句型吞掉；作业详情的字段', () => {
  assert.equal(tr(' · 还剩 15 小时'), ' · 15 h left');
  assert.equal(tr('附件（2）'), 'Attachments (2)');
  assert.equal(tr('20 分'), '20 pts');
  assert.equal(tr('更新于 3 分钟前'), 'Updated 3 min ago');
});
t('用 · 拼起来的整句不会被"{} 次"这类短句型吞掉；以 · 开头的句型照常', () => {
  assert.equal(tr('上次同步 x · 13 项截止 · 请求 0 次'), 'Last sync x · 13 deadlines · 0 requests');
  assert.equal(tr('其他学期 / 其他 · 1'), 'Other terms / other · 1');
  assert.equal(tr(' · 发到 a@b.com'), ' · sent to a@b.com');
  assert.equal(tr('接下来 3 天没有截止事项，今天已完成 2 件。可以提前看看"之后"的作业，或者休息一下。'), 'Nothing due in the next 3 days, 2 done today. Get ahead on "Later" items, or take a break.');
});
t('英文单复数：1 用单数，其他用复数', () => {
  assert.equal(tr('1 项'), '1 item');
  assert.equal(tr('2 项'), '2 items');
  assert.equal(tr('11 项'), '11 items');
  assert.equal(tr('1 天'), '1 day');
  assert.equal(tr('1 分'), '1 pt');
  assert.equal(tr('{} 项待完成 · {}'.replace('{}', '1').replace('{}', '最多的一天是明天（1 项）。')), '1 to do · Busiest day: Tomorrow (1).');
});
t('不认识的中文不报错，常见词尽量替换', () => {
  assert.equal(typeof tr('完全没见过的一句话'), 'string');
  assert.equal(tr('English stays'), 'English stays');
});
setLang('zh');
console.log(`全部 ${n} 个测试通过`);
