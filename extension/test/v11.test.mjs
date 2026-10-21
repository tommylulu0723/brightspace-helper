// 1.1 新功能测试：今日计划、变化检测、动态、公告和成绩整理。node test/v11.test.mjs
import assert from 'node:assert/strict';
import { buildPlan, planReason } from '../src/lib/plan.js';
import { diffSync, mergeUpdates, describeUpdate } from '../src/lib/changes.js';
import { buildFeed, unreadCount } from '../src/lib/feed.js';
import { newsFrom, gradesFrom, averagePct, htmlToPlain, gradeTone } from '../src/lib/extras.js';

const NOW = new Date('2026-10-21T16:00:00Z');
const H = 3600 * 1000;
const iso = (h) => new Date(NOW.getTime() + h * H).toISOString();
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n`, e); process.exitCode = 1; }
}
const it = (id, type, h, status = 'open', courseId = '1') => ({ id, ids: [id], courseId, title: id, type, due: iso(h), status });

console.log('今日计划');
await test('只放 3 天内的事项、7 天内的考试、确认没交的逾期；已完成和查不到状态的过期不放', () => {
  const items = [
    it('hw-5h', 'assignment', 5), it('hw-2d', 'assignment', 48), it('hw-5d', 'assignment', 120),
    it('exam-6d', 'exam', 144), it('exam-9d', 'exam', 216), it('late', 'assignment', -10),
    it('late-unknown', 'quiz', -10, 'unknown'), it('done', 'assignment', 10, 'submitted'), it('very-late', 'assignment', -24 * 10)
  ];
  const ids = buildPlan(items, NOW, {}).map((x) => x.id);
  assert.deepEqual(new Set(ids), new Set(['late', 'hw-5h', 'hw-2d', 'exam-6d']));
  assert.equal(ids[0], 'late', '逾期的排最前');
});
await test('排序：同样还剩 60 小时，考试 > 作业 > 讨论', () => {
  const ids = buildPlan([it('d', 'discussion', 60), it('a', 'assignment', 60), it('e', 'exam', 60)], NOW, {}).map((x) => x.id);
  assert.deepEqual(ids, ['e', 'a', 'd']);
});
await test('排序：作业 10 小时后截止，排在 3 天后的考试前面', () => {
  const ids = buildPlan([it('e', 'exam', 72), it('a', 'assignment', 10)], NOW, {}).map((x) => x.id);
  assert.deepEqual(ids, ['a', 'e']);
});
await test('手动标记完成的不出现', () => {
  assert.equal(buildPlan([it('a', 'assignment', 5)], NOW, { a: true }).length, 0);
});
await test('原因文字', () => {
  assert.equal(planReason(it('x', 'assignment', -1), NOW).text, '已逾期，尽快补交');
  assert.match(planReason(it('x', 'assignment', 3), NOW).text, /小时内截止/);
  assert.match(planReason(it('x', 'exam', 24 * 4), NOW).text, /^4 天后考试/);
});

console.log('变化检测');
const base = () => ({
  courses: [{ id: '1', name: 'Web' }],
  items: [it('hw1', 'assignment', 24)],
  materials: { 1: { fetchedAt: 'a', modules: [{ id: 'm', path: ['Week 1'], topics: [{ id: 't1', title: 'Lecture 1', kind: 'file', ext: 'pdf', modified: iso(-100), open: 'o1' }] }] } },
  news: [{ id: 'news:1:1', courseId: '1', title: 'Welcome', text: 'hi', date: iso(-200) }],
  grades: { 1: { final: null, items: [{ id: 'g1', name: 'Quiz 1', displayed: '8 / 10', num: 8, den: 10, pct: 80 }] } }
});
await test('第一次同步（没有上次结果）不产生变化，避免一下子弹一堆通知', () => {
  assert.deepEqual(diffSync(null, base(), NOW), []);
});
await test('找出：新课件、课件更新、截止时间改动、新作业、新公告、出分、成绩改动、期末成绩', () => {
  const prev = base();
  const next = base();
  next.items = [{ ...it('hw1', 'assignment', 48) }, it('hw2', 'assignment', 72)];
  next.materials[1] = { fetchedAt: 'b', modules: [{ id: 'm', path: ['Week 1'], topics: [
    { id: 't1', title: 'Lecture 1', kind: 'file', ext: 'pdf', modified: iso(-1), open: 'o1' },
    { id: 't2', title: 'Lecture 2', kind: 'file', ext: 'pptx', modified: iso(-1), open: 'o2' }] }] };
  next.news = [{ id: 'news:1:2', courseId: '1', title: 'Midterm moved', text: 'now 10/30', date: iso(-2) }, ...prev.news];
  next.grades[1] = { final: { displayed: 'A', pct: 94 }, items: [
    { id: 'g1', name: 'Quiz 1', displayed: '9 / 10', num: 9, den: 10, pct: 90 },
    { id: 'g2', name: 'Lab 1', displayed: '20 / 20', num: 20, den: 20, pct: 100 }] };
  const kinds = diffSync(prev, next, NOW).map((e) => `${e.kind}:${e.title}`).sort();
  assert.deepEqual(kinds, [
    'due-changed:hw1', 'grade-changed:Quiz 1', 'grade-new:Lab 1', 'grade-new:期末成绩', 'item-new:hw2',
    'material-new:Lecture 2', 'material-updated:Lecture 1', 'news:Midterm moved'
  ].sort());
});
await test('课件目录用的是缓存（同一次读取）时不比较；新加的课不算"新作业"', () => {
  const prev = base();
  const next = base();
  next.courses = [...next.courses, { id: '2', name: 'LA' }];
  next.items = [...next.items, it('la-hw', 'assignment', 30, 'open', '2')];
  assert.deepEqual(diffSync(prev, next, NOW), []);
});
await test('合并：去重、只留 60 天', () => {
  const old = [{ id: 'x', at: iso(-24 * 70) }, { id: 'y', at: iso(-1) }];
  const merged = mergeUpdates(old, [{ id: 'y', at: iso(0) }, { id: 'z', at: iso(0) }], NOW);
  assert.deepEqual(merged.map((e) => e.id), ['z', 'y']);
});
await test('通知文字', () => {
  assert.equal(describeUpdate({ kind: 'due-changed', title: 'Lab 6', detail: { to: 'T' } }, 'Web', (x) => `<${x}>`), 'Web：Lab 6 截止时间改到 <T>');
  assert.equal(describeUpdate({ kind: 'grade-new', title: 'Quiz 1', detail: { displayed: '9 / 10' } }, 'Web'), 'Web：Quiz 1 出分了：9 / 10');
});

console.log('动态');
await test('公告 + 变化合在一起按时间倒序；公告类变化不重复；看过之后不算未读；移除的课不显示', () => {
  const data = { news: [{ id: 'news:1:1', courseId: '1', title: 'A', text: '', date: iso(-5) }, { id: 'news:2:1', courseId: '2', title: 'B', text: '', date: iso(-1) }] };
  const updates = [{ id: 'news:1:1', kind: 'news', courseId: '1', title: 'A', at: iso(-4) }, { id: 'mat:1:t', kind: 'material-new', courseId: '1', title: 'L2', at: iso(-2) }];
  const feed = buildFeed(data, updates, NOW.getTime() - 3 * H, new Set(['2']));
  assert.deepEqual(feed.map((e) => e.id), ['mat:1:t', 'news:1:1']);
  assert.deepEqual(feed.map((e) => e.unread), [true, false]);
  assert.equal(unreadCount(data, updates, NOW.getTime() - 3 * H, new Set()), 2);
});

console.log('公告和成绩整理');
await test('公告：去掉隐藏 / 未发布，HTML 转文字，按时间倒序', () => {
  const list = newsFrom([
    { Id: 1, Title: 'Old', Body: { Text: 'x', Html: '' }, StartDate: iso(-50), IsHidden: false, IsPublished: true },
    { Id: 2, Title: 'New', Body: { Text: '', Html: '<p>Hello&nbsp;<b>class</b></p><ul><li>one</li><li>two</li></ul>' }, StartDate: iso(-1), IsPinned: true, Attachments: [{}] },
    { Id: 3, Title: 'Hidden', Body: {}, StartDate: iso(-1), IsHidden: true },
    { Id: 4, Title: 'Draft', Body: {}, StartDate: iso(-1), IsPublished: false }
  ], '7');
  assert.deepEqual(list.map((n) => n.title), ['New', 'Old']);
  assert.equal(list[0].id, 'news:7:2');
  assert.equal(list[0].text, 'Hello class\n• one\n• two');
  assert.equal(list[0].pinned, true);
  assert.equal(list[0].attachments, 1);
});
await test('成绩：跳过类别 / 计算项 / 还没出分的；期末成绩单独拿；得分率按分数加总', () => {
  const r = gradesFrom([
    { GradeObjectIdentifier: '1', GradeObjectName: 'Quiz 1', GradeObjectType: 1, PointsNumerator: 9, PointsDenominator: 10, DisplayedGrade: '9 / 10', LastModified: iso(-5) },
    { GradeObjectIdentifier: '2', GradeObjectName: 'Lab 1', GradeObjectType: 1, PointsNumerator: 18, PointsDenominator: 20, DisplayedGrade: '18 / 20', LastModified: iso(-1), Comments: { Text: 'Nice' } },
    { GradeObjectIdentifier: '3', GradeObjectName: 'Lab 2', GradeObjectType: 1, PointsNumerator: null, PointsDenominator: 20 },
    { GradeObjectIdentifier: '4', GradeObjectName: 'Homework', GradeObjectType: 9, PointsNumerator: 27, PointsDenominator: 30 },
    { GradeObjectIdentifier: '5', GradeObjectName: 'Participation', GradeObjectType: 4, DisplayedGrade: 'Good' }
  ], { PointsNumerator: 88, PointsDenominator: 100, DisplayedGrade: 'B+' });
  assert.deepEqual(r.items.map((x) => x.name), ['Lab 1', 'Quiz 1', 'Participation']);
  assert.equal(r.items[0].feedback, true);
  assert.equal(r.items[0].pct, 90);
  assert.deepEqual(r.final, { displayed: 'B+', pct: 88, date: null });
  assert.equal(averagePct(r.items), 90);
  assert.equal(gradesFrom([], { PointsNumerator: null, DisplayedGrade: '' }).final, null, '没公布期末成绩');
});
await test('辅助函数', () => {
  assert.equal(htmlToPlain('a<br>b &amp; c'), 'a\nb & c');
  assert.equal(gradeTone(95), 'ok');
  assert.equal(gradeTone(55), 'danger');
  assert.equal(gradeTone(null), 'neutral');
});

console.log(process.exitCode ? '\n有测试失败' : `\n全部 ${passed} 个测试通过`);
