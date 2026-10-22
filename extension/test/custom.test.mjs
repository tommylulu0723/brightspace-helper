import assert from 'node:assert/strict';
import { withCustom, upsertCustom, removeCustom, pruneCustom, MINE } from '../src/lib/custom.js';
import { buildPlan } from '../src/lib/plan.js';
import { compactSnapshot, publicSettings } from '../src/lib/cloud.js';
let n = 0;
const t = (name, fn) => { fn(); n++; };
const data = { courses: [{ id: '1', name: 'Web' }], items: [{ id: 'a', courseId: '1', title: 'HW', type: 'assignment', due: '2026-10-25T03:59:00Z', status: 'open' }] };

t('没有自己添加的事项时原样返回', () => assert.equal(withCustom(data, {}), data));
t('添加 / 修改 / 删除', () => {
  let list = upsertCustom([], { title: ' Final presentation ', type: 'presentation', due: '2026-10-24T15:00:00Z' });
  assert.equal(list.length, 1);
  assert.match(list[0].id, /^custom:/);
  assert.equal(list[0].title, 'Final presentation');
  assert.equal(list[0].courseId, MINE);
  list = upsertCustom(list, { ...list[0], title: 'Final pres', courseId: '1' });
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Final pres');
  assert.equal(removeCustom(list, list[0].id).length, 0);
});
t('合并进数据：没选课程放进"我的事项"，按截止时间排序', () => {
  const list = upsertCustom([], { title: 'Pres', type: 'presentation', due: '2026-10-24T15:00:00Z' });
  const m = withCustom(data, { customItems: list });
  assert.equal(m.items[0].title, 'Pres');
  assert.equal(m.items[0].courseId, MINE);
  assert.ok(m.courses.some((c) => c.id === MINE));
  assert.equal(data.items.length, 1, '不改原数据');
});
t('选的课被移除 / 不存在时也放进"我的事项"', () => {
  const list = upsertCustom([], { title: 'X', courseId: '999', due: '2026-10-24T15:00:00Z' });
  assert.equal(withCustom(data, { customItems: list }).items.find((i) => i.custom).courseId, MINE);
});
t('出现在今日计划里，presentation 提前一周', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const list = upsertCustom([], { title: 'Pres', type: 'presentation', due: '2026-10-25T15:00:00Z' });
  const plan = buildPlan(withCustom(data, { customItems: list }).items, now, {});
  assert.ok(plan.some((p) => p.title === 'Pres' && /展示/.test(p.reason.text)));
});
t('会上传到服务器（快照 + 设置），截止 60 天以上的自动清理', () => {
  const list = upsertCustom([], { title: 'Pres', due: '2026-10-24T15:00:00Z' });
  const snap = compactSnapshot(withCustom(data, { customItems: list }));
  assert.ok(snap.items.some((i) => i.title === 'Pres') && snap.courses.some((c) => c.id === MINE));
  assert.equal(publicSettings({ customItems: list }).customItems.length, 1);
  assert.equal(pruneCustom(list, new Date('2027-02-01')).length, 0);
});
console.log(`全部 ${n} 个测试通过`);
