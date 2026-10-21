// 用模拟的 Brightspace 接口跑一遍同步逻辑：node test/run-tests.mjs
import assert from 'node:assert/strict';
import { createClient, interpretResponse, AuthRequiredError } from '../src/lib/api.js';
import { runSync, pickCurrentCourses, submissionStatus } from '../src/lib/sync.js';
import { mergeItems, cleanTitle, isStartEvent } from '../src/lib/merge.js';
import { groupItems, stats, badgeCount, formatDue } from '../src/lib/format.js';
import { buildIcs } from '../src/lib/ics.js';
import { parseQuizListHtml, parseDropboxListHtml, gradeIndex, combineStatus } from '../src/lib/status.js';
import { safeName, downloadPath, flattenToc } from '../src/lib/materials.js';

const BASE = 'https://brightspace.nyu.edu';
const NOW = new Date('2026-10-21T16:00:00Z'); // 周三中午（纽约）
const iso = (h) => new Date(NOW.getTime() + h * 3600 * 1000).toISOString();

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n`, e);
    process.exitCode = 1;
  }
}

const json = (obj, status = 200) => ({ status, url: '', contentType: 'application/json; charset=utf-8', text: JSON.stringify(obj) });
const html = (text, status = 200) => ({ status, url: '', contentType: 'text/html; charset=utf-8', text });

// 模仿截图里的测验列表：标题链接 + Due/Available + "Feedback: On Attempt" + "1 / 1"
function quizRow(id, name, used, allowed) {
  return `<tr><th scope="row"><a class="d2l-link" href="/d2l/lms/quizzing/user/quiz_summary.d2l?qi=${id}&amp;ou=101">${name}</a>
    <d2l-dropdown><d2l-menu-item href="/d2l/lms/quizzing/user/quiz_submissions_history.d2l?qi=${id}&amp;ou=101">Submissions</d2l-menu-item></d2l-dropdown>
    <div>Due on Oct 7, 2026 11:00 AM</div><div>Available on Sep 30, 2026 11:00 AM</div></th>
    <td>Feedback: <a href="#">On Attempt</a></td><td><label>${used} / ${allowed}</label></td></tr>`;
}

function mockServer({ loggedIn = true } = {}) {
  const calls = [];
  const routes = {
    '/d2l/api/versions/': () => json([{ ProductCode: 'lp', LatestVersion: '1.47' }, { ProductCode: 'le', LatestVersion: '1.85' }]),
    '/d2l/api/lp/1.47/users/whoami': () => json({ FirstName: 'Tommy', LastName: 'Lu', UniqueName: 'tl0000' }),
    '/d2l/api/lp/1.47/enrollments/myenrollments/?orgUnitTypeId=3': () => json({
      PagingInfo: { Bookmark: 'p2', HasMoreItems: true },
      Items: [
        { OrgUnit: { Id: 101, Type: { Id: 3 }, Name: 'Intro to Web Design', Code: 'WEB' }, Access: { IsActive: true, CanAccess: true, StartDate: '2026-09-01T00:00:00Z', EndDate: '2026-12-20T00:00:00Z' } },
        { OrgUnit: { Id: 102, Type: { Id: 3 }, Name: 'Linear Algebra', Code: 'LA' }, Access: { IsActive: true, CanAccess: true, StartDate: '2026-09-01T00:00:00Z', EndDate: '2026-12-20T00:00:00Z' } }
      ]
    }),
    '/d2l/api/lp/1.47/enrollments/myenrollments/?orgUnitTypeId=3&bookmark=p2': () => json({
      PagingInfo: { Bookmark: 'p2', HasMoreItems: false },
      Items: [
        { OrgUnit: { Id: 90, Type: { Id: 3 }, Name: 'Old Course Spring 2025' }, Access: { IsActive: true, CanAccess: true, EndDate: '2025-05-20T00:00:00Z' } },
        { OrgUnit: { Id: 103, Type: { Id: 3 }, Name: 'Microeconomics', Code: 'MI' }, Access: { IsActive: true, CanAccess: true } }
      ]
    }),

    // ---- 101 Web Design ----
    '/d2l/api/le/1.85/101/dropbox/folders/': () => json([
      { Id: 11, Name: 'Lab 6: Hash Tables', DueDate: iso(8), IsHidden: false },
      { Id: 12, Name: 'Lab 5: Heaps', DueDate: iso(-48), IsHidden: false },
      { Id: 13, Name: 'Hidden folder', DueDate: iso(8), IsHidden: true },
      { Id: 14, Name: 'Way in the future', DueDate: iso(24 * 200), IsHidden: false },
      { Id: 15, Name: 'Lab 4: Forms', DueDate: iso(-24 * 5), IsHidden: false },        // 接口读不到，作业列表页显示已交
      { Id: 16, Name: 'Portfolio Draft', DueDate: iso(-24 * 3), IsHidden: false, GradeItemId: 900 } // 接口说没交，但有成绩
    ]),
    '/d2l/api/le/1.85/101/dropbox/folders/11/submissions/mysubmissions/': () => json([{ Status: 0, Submissions: [] }]),
    '/d2l/api/le/1.85/101/dropbox/folders/12/submissions/mysubmissions/': () => json([{ Status: 1, Submissions: [{ Id: 1 }] }]),
    '/d2l/api/le/1.85/101/dropbox/folders/15/submissions/mysubmissions/': () => json({ Errors: [] }, 403),
    '/d2l/api/le/1.85/101/dropbox/folders/16/submissions/mysubmissions/': () => json([]),
    '/d2l/lms/dropbox/user/folders_list.d2l?ou=101': () => html(`<table>
      <tr><td><a href="/d2l/lms/dropbox/user/folder_submit_files.d2l?db=11&amp;ou=101">Lab 6</a></td><td>Not Submitted</td></tr>
      <tr><td><a href="/d2l/lms/dropbox/user/folder_submit_files.d2l?db=15&amp;ou=101">Lab 4</a></td><td>1 Submission, 2 Files</td></tr>
      <tr><td><a href="/d2l/lms/dropbox/user/folder_submit_files.d2l?db=16&amp;ou=101">Portfolio</a></td><td>Not Submitted</td></tr></table>`),
    '/d2l/api/le/1.85/101/grades/values/myGradeValues/': () => json([
      { GradeObjectIdentifier: '900', GradeObjectName: 'Portfolio Draft', PointsNumerator: 18, PointsDenominator: 20, DisplayedGrade: '18 / 20' },
      { GradeObjectIdentifier: '901', GradeObjectName: 'Reading Quiz #12', PointsNumerator: 1, PointsDenominator: 1, DisplayedGrade: '1 / 1' }
    ]),
    '/d2l/api/le/1.85/101/quizzes/': () => json({ Next: `${BASE}/d2l/api/le/1.85/101/quizzes/?bookmark=2`, Objects: [
      { QuizId: 21, Name: 'Quiz 3', IsActive: true, DueDate: iso(30) },
      { QuizId: 23, Name: 'Reading Quiz #9', IsActive: true, DueDate: iso(-24 * 13) },
      { QuizId: 24, Name: 'Reading Quiz #10', IsActive: true, DueDate: iso(-24 * 13) },
      { QuizId: 25, Name: 'Reading Quiz #11', IsActive: true, DueDate: iso(-39) },
      { QuizId: 26, Name: 'Reading Quiz #12', IsActive: true, DueDate: iso(-39) }
    ] }),
    '/d2l/api/le/1.85/101/quizzes/?bookmark=2': () => json({ Next: null, Objects: [{ QuizId: 22, Name: 'Inactive quiz', IsActive: false, DueDate: iso(30) }] }),
    '/d2l/lms/quizzing/user/quizzes_list.d2l?ou=101': () => html(`<table>${quizRow(21, 'Quiz 3', 0, 2)}${quizRow(23, 'Reading Quiz #9', 1, 1)}${quizRow(24, 'Reading Quiz #10', 0, 1)}</table>`),
    '/d2l/api/le/1.85/101/content/toc': () => json({ Modules: [
      { ModuleId: 1, Title: 'Week 1', SortOrder: 1, Topics: [
        { TopicId: 501, Title: 'Lecture 1 Slides', TypeIdentifier: 'File', Url: '/content/enforced/101-WEB/week1/Lecture%201%20Intro.pptx', SortOrder: 1, LastModifiedDate: iso(-24 * 40) },
        { TopicId: 502, Title: 'Syllabus', TypeIdentifier: 'File', Url: '/content/enforced/101-WEB/syllabus.pdf', SortOrder: 0 },
        { TopicId: 503, Title: 'Reading Quiz #1', TypeIdentifier: 'Link', Url: `${BASE}/d2l/lms/quizzing/user/quiz_summary.d2l?qi=1`, SortOrder: 2 },
        { TopicId: 504, Title: 'Intro video', TypeIdentifier: 'Link', Url: 'https://www.youtube.com/watch?v=x', SortOrder: 3 },
        { TopicId: 505, Title: 'Hidden', TypeIdentifier: 'File', Url: '/x.pdf', IsHidden: true }
      ], Modules: [
        { ModuleId: 2, Title: 'Lab files', Topics: [{ TopicId: 506, Title: 'starter.zip', TypeIdentifier: 'File', Url: '/content/enforced/101-WEB/starter.zip' }], Modules: [] }
      ] },
      { ModuleId: 3, Title: 'Hidden module', IsHidden: true, Topics: [{ TopicId: 507, Title: 'secret', TypeIdentifier: 'File', Url: '/s.pdf' }] }
    ] }),

    // ---- 102 Linear Algebra：作业/测验 403，目录接口 404 → 走 root + structure ----
    '/d2l/api/le/1.85/102/dropbox/folders/': () => json({ Errors: [] }, 403),
    '/d2l/api/le/1.85/102/quizzes/': () => json({ Errors: [] }, 403),
    '/d2l/api/le/1.85/102/content/toc': () => json({ Errors: [] }, 404),
    '/d2l/api/le/1.85/102/content/root/': () => json([{ Id: 70, Title: 'Lecture Notes', Type: 0 }]),
    '/d2l/api/le/1.85/102/content/modules/70/structure/': () => json([
      { Id: 71, Title: 'Lecture 3 - Eigenvalues.pdf', Type: 1, TopicType: 1, Url: '/content/enforced/102-LA/lec3.pdf' },
      { Id: 72, Title: 'Week 2', Type: 0 }
    ]),
    '/d2l/api/le/1.85/102/content/modules/72/structure/': () => json([{ Id: 73, Title: 'Notes week 2', Type: 1, TopicType: 1, Url: '/content/enforced/102-LA/w2.pdf' }]),

    // ---- 103 Microeconomics ----
    '/d2l/api/le/1.85/103/dropbox/folders/': () => json([{ Id: 31, Name: 'Problem Set 3', DueDate: iso(24 * 9), IsHidden: false }]),
    '/d2l/api/le/1.85/103/dropbox/folders/31/submissions/mysubmissions/': () => json([]),
    '/d2l/lms/dropbox/user/folders_list.d2l?ou=103': () => html('<table></table>'),
    '/d2l/api/le/1.85/103/grades/values/myGradeValues/': () => json({ Errors: [] }, 404),
    '/d2l/api/le/1.85/103/quizzes/': () => json({ Next: null, Objects: [] }),
    '/d2l/api/le/1.85/103/content/toc': () => json({ Modules: [] })
  };
  const calendar = {
    101: [
      { CalendarEventId: 601, Title: 'Lab 6: Hash Tables - Due', StartDateTime: iso(8), EndDateTime: iso(8), AssociatedEntity: { AssociatedEntityType: 'D2L.LE.Dropbox.Dropbox', AssociatedEntityId: 11 } },
      { CalendarEventId: 602, Title: 'Lecture', StartDateTime: iso(20), EndDateTime: iso(21.5) }
    ],
    102: [
      { CalendarEventId: 701, Title: 'Midterm Exam', StartDateTime: iso(24 * 8), EndDateTime: iso(24 * 8 + 1.5) },
      { CalendarEventId: 702, Title: 'Problem Set 6 - Availability Starts', StartDateTime: iso(2), EndDateTime: iso(2) },
      { CalendarEventId: 703, Title: 'Recitation', StartDateTime: iso(3), EndDateTime: iso(4) }
    ],
    103: []
  };

  return {
    calls,
    fetcher: async (url) => {
      const path = url.replace(BASE, '');
      calls.push(path);
      if (!loggedIn) {
        if (path === '/d2l/api/versions/') return routes[path]();
        return { status: 200, url: `${BASE}/d2l/login?sessionExpired=1`, contentType: 'text/html', text: '<html>login</html>' };
      }
      const nw = path.match(/^\/d2l\/api\/le\/1\.85\/(\d+)\/news\/\?since=/);
      if (nw) return nw[1] === '101'
        ? json([{ Id: 77, Title: 'Lab 6 extension', Body: { Text: 'Due Thursday now', Html: '' }, StartDate: iso(-3), IsHidden: false, IsPublished: true, IsPinned: false, Attachments: [] }])
        : json({ Errors: [] }, 403);
      if (path === '/d2l/api/le/1.85/101/grades/final/values/myGradeValue') return json({ PointsNumerator: null, DisplayedGrade: '' });
      const cal = path.match(/^\/d2l\/api\/le\/1\.85\/(\d+)\/calendar\/events\/myEvents\/\?/);
      if (cal) return json({ Next: null, Objects: calendar[cal[1]] || [] });
      if (path.startsWith('/d2l/api/le/1.85/content/myItems/?')) {
        assert.match(path, /completion=1/);
        return json({
          Next: null,
          Objects: [
            { OrgUnitId: 103, ItemId: 7001, ItemName: 'Reading Response 7', DueDate: iso(2), DateCompleted: iso(-1), ActivityType: 3, IsExempt: false },
            { OrgUnitId: 103, ItemId: 7005, ItemName: 'Reflection 2', DueDate: iso(-30), DateCompleted: null, ActivityType: 3, IsExempt: false },
            { OrgUnitId: 102, ItemId: 7002, ItemName: 'Discussion: Eigenvalues', DueDate: iso(50), DateCompleted: null, ActivityType: 6 },
            { OrgUnitId: 102, ItemId: 7003, ItemName: 'Exempt thing', DueDate: iso(50), ActivityType: 3, IsExempt: true },
            { OrgUnitId: 101, ItemId: 7004, ItemName: 'Week 8 module', DueDate: iso(50), ActivityType: 0 }
          ]
        });
      }
      const r = routes[path];
      if (!r) return json({ Errors: [{ Message: 'not found' }] }, 404);
      return r();
    }
  };
}

async function fullSync(opts = {}) {
  const srv = mockServer();
  const client = createClient({ fetcher: srv.fetcher });
  const res = await runSync({ client, now: NOW, ...opts });
  const by = Object.fromEntries(res.items.map((i) => [`${i.courseId}|${i.title}`, i]));
  return { srv, client, res, by };
}

console.log('api');
await test('interpretResponse：JSON 正常返回', () => {
  assert.deepEqual(interpretResponse(json({ a: 1 }), '/x'), { a: 1 });
});
await test('interpretResponse：被转到登录页 → 需要登录', () => {
  assert.throws(() => interpretResponse({ status: 200, url: `${BASE}/d2l/login`, contentType: 'text/html', text: '' }, '/x'), AuthRequiredError);
  assert.throws(() => interpretResponse({ status: 200, url: `${BASE}/d2l/api/x`, contentType: 'text/html', text: '<html>' }, '/x'), AuthRequiredError);
  assert.throws(() => interpretResponse({ status: 401, url: '', contentType: '', text: '' }, '/x'), AuthRequiredError);
});
await test('interpretResponse：403 是普通错误，不当成登录问题', () => {
  assert.throws(() => interpretResponse(json({}, 403), '/x'), (e) => e.status === 403);
});

console.log('提交状态（这次修的问题）');
await test('测验列表页解析："1 / 1" 读成已作答 1 次，不会把日期当成次数', () => {
  const m = parseQuizListHtml(`<table>${quizRow(9, 'Reading Quiz #9', 1, 1)}${quizRow(10, 'Reading Quiz #10', 0, 3)}${quizRow(11, 'Q', 2, 'Unlimited')}</table>`);
  assert.deepEqual(m.get('9'), { used: 1, allowed: '1' });
  assert.deepEqual(m.get('10'), { used: 0, allowed: '3' });
  assert.equal(m.get('11').used, 2);
  const dates = parseQuizListHtml('<a href="x?qi=5">Quiz</a> Due 10/7/2026 11:00 AM');
  assert.equal(dates.has('5'), false);
});
await test('作业列表页解析', () => {
  const m = parseDropboxListHtml('<a href="?db=1&ou=2">A</a> 1 Submission, 1 File <a href="?db=2&ou=2">B</a> Not Submitted <a href="?db=3">C</a> 0 Submissions');
  assert.equal(m.get('1'), 'submitted');
  assert.equal(m.get('2'), 'open');
  assert.equal(m.get('3'), 'open');
});
await test('多来源合成：只要一个来源说交了就算交了', () => {
  assert.equal(combineStatus(['open', 'submitted']), 'submitted');
  assert.equal(combineStatus(['open']), 'open');
  assert.equal(combineStatus([]), 'unknown');
  const g = gradeIndex([{ GradeObjectIdentifier: 5, GradeObjectName: 'Quiz A', PointsNumerator: 0 }]);
  assert.equal(g.find(5).positive, false, '0 分不当作"做过"的证据');
});
await test('截图里的情况：做过的测验不再显示逾期', async () => {
  const { res, by } = await fullSync();
  assert.equal(by['101|Reading Quiz #9'].status, 'completed', '作答次数 1/1 → 已完成');
  assert.equal(by['101|Reading Quiz #12'].status, 'completed', '有成绩 → 已完成');
  assert.equal(by['101|Reading Quiz #10'].status, 'open', '作答次数 0/1 → 确认没做');
  assert.equal(by['101|Reading Quiz #11'].status, 'unknown', '什么证据都没有 → 未知');
  const groups = Object.fromEntries(groupItems(res.items, NOW, {}).map((g) => [g.id, g.items.map((i) => i.title)]));
  assert.ok(groups.donePast.includes('Reading Quiz #9'));
  assert.ok(groups.donePast.includes('Reading Quiz #12'));
  assert.deepEqual(groups.overdue, ['Reading Quiz #10'], '只有确认没交的才算逾期');
  assert.ok(groups.unverified.includes('Reading Quiz #11'), '查不到状态的放"无法确认"');
  assert.ok(groups.unverified.includes('Reflection 2'), '课件进度里没完成时间 ≠ 没交');
});
await test('作业：接口读不到时用作业列表页；接口说没交但有成绩时也算交了', async () => {
  const { by } = await fullSync();
  assert.equal(by['101|Lab 4: Forms'].status, 'submitted');
  assert.equal(by['101|Portfolio Draft'].status, 'submitted');
  assert.equal(by['101|Lab 6: Hash Tables'].status, 'open');
  assert.ok(by['101|Lab 4: Forms'].signals.some((s) => s.includes('作业列表页')));
});

console.log('sync');
await test('完整同步：课程筛选、去重、日历过滤', async () => {
  const { client, res, by } = await fullSync();
  assert.deepEqual(client.versions, { lp: '1.47', le: '1.85' });
  assert.equal(res.user.name, 'Tommy Lu');
  assert.deepEqual(res.courses.map((c) => c.id).sort(), ['101', '102', '103']);
  const lab6 = by['101|Lab 6: Hash Tables'];
  assert.equal(lab6.source, 'dropbox');
  assert.deepEqual(lab6.sources.sort(), ['calendar', 'dropbox']);
  assert.equal(by['101|Lab 5: Heaps'].status, 'submitted');
  assert.ok(!by['101|Hidden folder'] && !by['101|Way in the future'] && !by['101|Inactive quiz'] && !by['101|Lecture']);
  assert.equal(by['102|Midterm Exam']?.type, 'exam');
  assert.ok(!res.items.some((i) => /Availability Starts|Problem Set 6|Recitation/.test(i.title)));
  assert.ok(!by['102|Exempt thing'] && !by['101|Week 8 module']);
  assert.equal(by['103|Reading Response 7']?.status, 'completed');
  assert.equal(res.warnings.length, 0, res.warnings.join('；'));
  console.log(`    (${res.items.length} 项，${res.requestCount} 次请求)`);
});
await test('已确认提交过的作业，下次同步不再重复查询', async () => {
  const { srv } = await fullSync({ prev: { submittedKeys: ['101:12'] } });
  assert.ok(!srv.calls.some((p) => p.includes('/folders/12/submissions')));
});
await test('移除的课不发请求，但在课程管理里还能看到', async () => {
  const { srv, res } = await fullSync({ settings: { hiddenCourseIds: ['103'] } });
  assert.ok(!srv.calls.some((p) => p.includes('/103/') || p.includes('ou=103')));
  assert.ok(!res.courses.some((c) => c.id === '103'), '移除的课不在同步列表里');
  assert.equal(res.allCourses.find((c) => c.id === '103').active, false, '但在"所有课程"里还能看到，可以加回来');
});
await test('后台请求没登录态时，自动改用 Brightspace 标签页', async () => {
  const client = createClient({ fetcher: mockServer({ loggedIn: false }).fetcher, fallbackFetcher: mockServer().fetcher });
  const res = await runSync({ client, now: NOW });
  assert.equal(res.usingFallback, true);
  assert.ok(res.items.length > 5);
});
await test('两种方式都没登录 → 报"需要登录"', async () => {
  const client = createClient({ fetcher: mockServer({ loggedIn: false }).fetcher, fallbackFetcher: async () => { throw new Error('no tab'); } });
  await assert.rejects(runSync({ client, now: NOW }), (e) => e.code === 'AUTH_REQUIRED');
});

console.log('课件库');
await test('目录整理：章节、排序、过滤隐藏和内部工具链接', async () => {
  const { res } = await fullSync();
  const web = res.materials['101'];
  assert.deepEqual(web.modules.map((m) => m.path.join(' / ')), ['Week 1', 'Week 1 / Lab files']);
  const w1 = web.modules[0].topics;
  assert.deepEqual(w1.map((t) => t.title), ['Syllabus', 'Lecture 1 Slides', 'Intro video']);
  const slides = w1[1];
  assert.equal(slides.filename, 'Lecture 1 Intro.pptx');
  assert.equal(slides.ext, 'pptx');
  assert.equal(slides.lecture, true);
  assert.equal(w1[0].lecture, false, 'Syllabus 不算讲义');
  assert.equal(slides.download, `${BASE}/d2l/api/le/1.85/101/content/topics/501/file`);
  assert.equal(w1[2].kind, 'link');
  assert.equal(web.files, 3);
});
await test('目录接口不可用时，一层层读结构', async () => {
  const { res } = await fullSync();
  const la = res.materials['102'];
  assert.deepEqual(la.modules.map((m) => m.path.join(' / ')), ['Lecture Notes', 'Lecture Notes / Week 2']);
  assert.equal(la.lectures, 2);
});
await test('课件目录 2 小时内不重复读取，强制刷新时会读', async () => {
  const first = await fullSync();
  const again = await fullSync({ prev: { materials: first.res.materials } });
  assert.ok(!again.srv.calls.some((p) => p.includes('/content/toc')));
  const forced = await fullSync({ prev: { materials: first.res.materials }, forceMaterials: true });
  assert.ok(forced.srv.calls.some((p) => p.includes('/content/toc')));
});
await test('下载路径对 Windows 安全', () => {
  assert.equal(safeName('Week 1: Intro/Basics?'), 'Week 1_ Intro_Basics_');
  assert.equal(safeName('CON'), '_CON');
  assert.equal(safeName('notes. '), 'notes');
  const p = downloadPath('Intro to Web Design', ['Week 1', 'Lab: files'], { filename: 'a*b.pdf' });
  assert.equal(p, 'Brightspace/Intro to Web Design/Week 1/Lab_ files/a_b.pdf');
  assert.ok(safeName('x'.repeat(200) + '.pdf').endsWith('.pdf'));
  assert.ok(safeName('x'.repeat(200) + '.pdf').length <= 80);
});
await test('空目录', () => {
  assert.deepEqual(flattenToc({ Modules: [] }, { base: BASE, ou: 1, fileUrl: () => '' }), { modules: [], files: 0, lectures: 0, links: 0 });
});

console.log('merge / format / ics');
await test('标题清理', () => {
  assert.equal(cleanTitle('Lab 6 - Due'), 'Lab 6');
  assert.equal(cleanTitle('Essay 2 (Due)'), 'Essay 2');
  assert.ok(isStartEvent('Quiz 1 - Availability Starts'));
});
await test('同名但时间差很远的不合并；Quiz 1 和 Quiz 10 不合并', () => {
  assert.equal(mergeItems([
    { source: 'dropbox', courseId: '1', entityId: 1, title: 'Weekly Reflection', type: 'assignment', due: iso(10), status: 'open' },
    { source: 'dropbox', courseId: '1', entityId: 2, title: 'Weekly Reflection', type: 'assignment', due: iso(10 + 24 * 7), status: 'open' }
  ]).length, 2);
  assert.equal(mergeItems([
    { source: 'quiz', courseId: '1', entityId: 1, title: 'Quiz 1', type: 'quiz', due: iso(10), status: 'unknown' },
    { source: 'calendar', courseId: '1', entityId: 2, title: 'Quiz 10 - Due', type: 'quiz', due: iso(11), status: 'unknown' }
  ]).length, 2);
});
await test('提交记录接口解析', () => {
  assert.equal(submissionStatus(null), 'unknown');
  assert.equal(submissionStatus([]), 'open');
  assert.equal(submissionStatus([{ Status: 3 }]), 'submitted');
});
await test('统计和角标：无法确认的不算逾期、不进角标', () => {
  const items = mergeItems([
    { source: 'dropbox', courseId: '1', entityId: 1, title: 'A overdue', type: 'assignment', due: iso(-5), status: 'open' },
    { source: 'quiz', courseId: '1', entityId: 9, title: 'Q unknown past', type: 'quiz', due: iso(-5), status: 'unknown' },
    { source: 'dropbox', courseId: '1', entityId: 2, title: 'B soon', type: 'assignment', due: iso(5), status: 'open' },
    { source: 'dropbox', courseId: '1', entityId: 3, title: 'C done past', type: 'assignment', due: iso(-30), status: 'submitted' },
    { source: 'dropbox', courseId: '1', entityId: 4, title: 'D later', type: 'assignment', due: iso(24 * 20), status: 'open' }
  ]);
  assert.deepEqual(groupItems(items, NOW, {}).map((g) => g.id), ['overdue', 'today', 'later', 'unverified', 'donePast']);
  assert.deepEqual(stats(items, NOW, {}), { open: 3, soon: 1, overdue: 1, unverified: 1 });
  assert.equal(badgeCount(items, NOW, {}), 2);
  assert.equal(badgeCount(items, NOW, { 'dropbox:1:1': true }), 1);
});
await test('时间显示', () => {
  assert.match(formatDue(iso(1), NOW), /^今天 \d\d:\d\d$/);
  assert.match(formatDue(iso(24 * 3), NOW), /^\d+\/\d\d 周. \d\d:\d\d$/);
});
await test('.ics 格式合法', () => {
  const items = [{ id: 'dropbox:101:11', courseId: '101', title: 'Lab 6: Hash Tables, part 2; 这是一个特别特别特别长的中文标题用来测试折行是否正确处理多字节字符', type: 'assignment', due: iso(8), url: `${BASE}/d2l/x?a=1&b=2` }];
  const ics = buildIcs(items, { 101: 'Web Design' }, NOW);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `超长行：${line}`);
  assert.match(ics, /Hash Tables\\, part 2\\; /);
});
await test('课程筛选：最多 15 门；非课程类型排除', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ OrgUnit: { Id: i + 1, Type: { Id: 3 }, Name: `C${i}` }, Access: { IsActive: true, CanAccess: true } }));
  assert.equal(pickCurrentCourses(many, NOW).length, 15);
  assert.equal(pickCurrentCourses([{ OrgUnit: { Id: 1, Type: { Id: 4 }, Name: 'Dept' }, Access: {} }], NOW).length, 0);
});

await test('手动添加没被自动识别的课（比如上学期的课）', async () => {
  const { res, srv } = await fullSync({ settings: { addedCourseIds: ['90'] } });
  assert.ok(res.courses.some((c) => c.id === '90' && c.auto === false));
  assert.ok(srv.calls.some((p) => p.includes('/90/')));
  const old = res.allCourses.find((c) => c.id === '90');
  assert.equal(old.current, false);
  assert.equal(old.active, true);
});

await test('同步时顺便读公告和成绩；没权限的课安静跳过；成绩接口每门课只请求一次', async () => {
  const { res, srv } = await fullSync();
  assert.deepEqual(res.news.map((n) => n.title), ['Lab 6 extension']);
  assert.equal(res.news[0].id, 'news:101:77');
  assert.deepEqual(res.grades['101'].items.map((g) => g.name).sort(), ['Portfolio Draft', 'Reading Quiz #12']);
  assert.equal(res.grades['101'].final, null);
  assert.equal(srv.calls.filter((p) => p === '/d2l/api/le/1.85/101/grades/values/myGradeValues/').length, 1);
  assert.equal(res.warnings.length, 0, res.warnings.join('；'));
});

console.log(process.exitCode ? '\n有测试失败' : `\n全部 ${passed} 个测试通过`);
