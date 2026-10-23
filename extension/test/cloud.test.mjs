// 云同步模块测试：node test/cloud.test.mjs
import assert from 'node:assert/strict';
import { mergeState, compactSnapshot, publicSettings, normalizeServer } from '../src/lib/cloud.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n`, e); process.exitCode = 1; }
}

console.log('云同步');
await test('谁新用谁：服务器的"标记完成"更新时拉下来，本机更新时保留本机', () => {
  const local = { overrides: { a: true }, overridesAt: 100, settings: { hiddenCourseIds: ['1'], notify: false }, settingsAt: 300 };
  const remote = { overrides: { b: true }, overridesAt: 200, settings: { hiddenCourseIds: ['2'] }, settingsAt: 250 };
  const m = mergeState(local, remote);
  assert.deepEqual(m.overrides, { b: true });
  assert.deepEqual(m.settings.hiddenCourseIds, ['1']);
  assert.equal(m.changedLocal, true);
  assert.equal(mergeState(local, null).changedLocal, false);
});
await test('设置逐项合并：这边移除课程、那边改语言，两边都保留', () => {
  const local = { settings: { hiddenCourseIds: ['1', '2'], lang: 'zh' }, settingsTs: { hiddenCourseIds: 500, lang: 100 }, settingsAt: 500 };
  const remote = { settings: { hiddenCourseIds: ['1'], lang: 'en', _ts: { hiddenCourseIds: 300, lang: 400 } }, settingsAt: 400 };
  const m = mergeState(local, remote);
  assert.deepEqual(m.settings.hiddenCourseIds, ['1', '2'], '本机刚移除的课不会被服务器上旧的列表覆盖');
  assert.equal(m.settings.lang, 'en');
  assert.equal(m.changedLocal, true);
  assert.ok(!('_ts' in m.settings));
});
await test('旧服务器数据没有逐项时间：按整份时间比较，不会把本机更新的覆盖掉', () => {
  const local = { settings: { hiddenCourseIds: ['1', '2'] }, settingsAt: 900 };
  const remote = { settings: { hiddenCourseIds: [] }, settingsAt: 800 };
  assert.deepEqual(mergeState(local, remote).settings.hiddenCourseIds, ['1', '2']);
  assert.equal(mergeState(local, remote).changedLocal, false);
});
await test('上传时带上逐项时间', () => {
  const p = publicSettings({ hiddenCourseIds: ['1'] }, { hiddenCourseIds: 42 });
  assert.equal(p._ts.hiddenCourseIds, 42);
  assert.equal(p._ts.lang, 0);
});
await test('上传的设置只有白名单字段（不会带上 API key）', () => {
  const p = publicSettings({ hiddenCourseIds: ['1'], notify: true, anthropicKey: 'sk-ant-secret', somethingElse: 1 });
  assert.ok(!JSON.stringify(p).includes('secret'));
  assert.deepEqual(Object.keys(p).sort(), ['addedCourseIds', 'customItems', 'hiddenCourseIds', 'lang', 'notify', 'theme']);
});
await test('快照去掉下载地址和判断依据，体积更小', () => {
  const s = compactSnapshot({
    lastSync: 'x', courses: [], items: [{ id: 'a', signals: ['作答次数：1 / 1'] }],
    materials: { 1: { files: 1, modules: [{ id: 'm', path: ['W1'], topics: [{ id: 't', title: 'L1', kind: 'file', download: 'https://brightspace.nyu.edu/d2l/api/x', open: 'o' }] }] } }
  });
  assert.ok(!('signals' in s.items[0]));
  assert.ok(!('download' in s.materials[1].modules[0].topics[0]));
});
await test('服务器地址规范化', () => {
  assert.equal(normalizeServer('study.example.com/'), 'https://study.example.com');
  assert.equal(normalizeServer('http://1.2.3.4:3100/m/'), 'http://1.2.3.4:3100');
  assert.equal(normalizeServer(''), '');
});

console.log(process.exitCode ? '\n有测试失败' : `\n全部 ${passed} 个测试通过`);
