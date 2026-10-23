// 作业详情：node test/detail.test.mjs
import assert from 'node:assert/strict';
import { detailTargets, fromDropbox, fromQuiz, fromSubmissions, fromEvent, combineDetails, fetchDetail, putCache, normalizeRubrics } from '../src/lib/detail.js';
import { ApiError, AuthRequiredError } from '../src/lib/api.js';

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };

const FOLDER = {
  Id: 7, Name: 'Project 2', DueDate: '2026-10-25T03:59:00Z',
  CustomInstructions: { Text: 'Build it', Html: '<p>Build <b>it</b></p>' },
  Attachments: [{ FileId: 91, FileName: 'spec.pdf', Size: 1200 }],
  LinkAttachments: [{ LinkName: 'Docs', Href: 'https://example.com' }, { LinkName: 'bad', Href: 'javascript:alert(1)' }],
  Availability: { StartDate: '2026-10-18T04:00:00Z', EndDate: '2026-10-27T03:59:00Z' },
  Assessment: { ScoreDenominator: 20, Rubrics: [{ Name: 'R', CriteriaGroups: [{ Name: '', Levels: [{ Name: 'A', Points: 4 }, { Name: 'B', Points: 2 }], Criteria: [{ Name: 'Works', Cells: [{ Description: { Text: 'All good' }, Points: 4 }, { Description: { Text: 'Some' }, Points: 2 }] }] }] }] },
  DropboxType: 1, SubmissionType: 0, GradeItemId: 55
};

await test('合并项按来源排好：作业箱 > 测验 > 课件 > 日历', () => {
  const t = detailTargets({ id: 'calendar:101:x', ids: ['calendar:101:9', 'dropbox:101:7', 'content:101:3', 'bogus'] });
  assert.deepEqual(t.map((x) => x.source), ['dropbox', 'content', 'calendar']);
  assert.deepEqual(t[0], { source: 'dropbox', courseId: '101', entityId: '7' });
});

await test('作业箱：要求、附件、链接（只留 http）、分值、评分标准、迟交时间、小组', () => {
  const d = fromDropbox(FOLDER, { fileUrl: (id) => `u/${id}` });
  assert.equal(d.instructions.html, '<p>Build <b>it</b></p>');
  assert.deepEqual(d.attachments, [{ name: 'spec.pdf', size: 1200, url: 'u/91' }]);
  assert.deepEqual(d.links.map((l) => l.name), ['Docs']);
  assert.equal(d.points, 20);
  assert.equal(d.lateUntil, '2026-10-27T03:59:00Z');
  assert.equal(d.group, true);
  assert.equal(d.rubrics[0].groups[0].criteria[0].cells[1].text, 'Some');
  assert.equal(d.rubrics[0].groups[0].levels[0].points, 4);
  assert.equal(fromDropbox({ ...FOLDER, Availability: { EndDate: FOLDER.DueDate } }).lateUntil, null, '截止和关闭同一时间：没有迟交期');
  assert.deepEqual(normalizeRubrics([{ Name: 'empty', CriteriaGroups: [] }]), [], '空评分标准不显示');
});

await test('测验：说明、限时、次数、密码', () => {
  const q = fromQuiz({ Instructions: { Text: { Text: '', Html: '' } }, Description: { Text: { Text: 'Covers ch 3', Html: '' } }, SubmissionTimeLimit: { IsEnforced: true, TimeLimitValue: 30 }, AttemptsAllowed: { IsUnlimited: false, NumberOfAttemptsAllowed: 2 }, Password: 'x', DueDate: 'd', GradeItemId: 4 });
  assert.equal(q.instructions.text, 'Covers ch 3', '说明为空时用描述');
  assert.equal(q.timeLimit, 30);
  assert.equal(q.attempts, 2);
  assert.equal(q.password, true);
  assert.equal(fromQuiz({ AttemptsAllowed: { IsUnlimited: true }, SubmissionTimeLimit: { IsEnforced: false, TimeLimitValue: 30 } }).attempts, 'unlimited');
  assert.equal(fromQuiz({ SubmissionTimeLimit: { IsEnforced: false, TimeLimitValue: 30 } }).timeLimit, null);
});

await test('提交记录：最新的在前，带文件和老师反馈', () => {
  const s = fromSubmissions([{ Submissions: [
    { Id: 1, SubmissionDate: '2026-10-20T10:00:00Z', Files: [{ FileId: 5, FileName: 'v1.pdf', Size: 9 }] },
    { Id: 2, SubmissionDate: '2026-10-21T10:00:00Z', Comment: { Text: 'final' }, Files: [] }
  ], Feedback: { Score: 18, Feedback: { Text: 'Nice', Html: '<p>Nice</p>' } } }], { fileUrl: (sid, fid) => `s/${sid}/${fid}` });
  assert.deepEqual(s.submissions.map((x) => x.comment), ['final', '']);
  assert.equal(s.submissions[1].files[0].url, 's/1/5');
  assert.equal(s.feedback.score, 18);
});

await test('日历事件：HTML 描述和地点', () => {
  const e = fromEvent({ Description: '<p>Bring a pencil</p>', Location: 'Room 1', StartDateTime: 'a', EndDateTime: 'b' });
  assert.equal(e.instructions.html, '<p>Bring a pencil</p>');
  assert.equal(e.location, 'Room 1');
  assert.equal(e.start, 'a');
  assert.equal(fromEvent({ Description: 'plain' }).instructions.text, 'plain');
});

await test('多个来源合并：前面的优先，空的说明会被后面的补上', () => {
  const d = combineDetails([{ instructions: { html: '<p> </p>', text: '' }, points: 10, attachments: [{ name: 'a', url: 'x' }] }, { instructions: { html: '', text: 'from calendar' }, points: 99, attachments: [{ name: 'a', url: 'x' }], location: 'R' }]);
  assert.equal(d.instructions.text, 'from calendar');
  assert.equal(d.points, 10);
  assert.equal(d.attachments.length, 1);
  assert.equal(d.location, 'R');
  assert.equal(d.empty, false);
  assert.equal(combineDetails([]).empty, true);
});

await test('fetchDetail：按来源读接口，补上分值和我的成绩；读不到的跳过，登录过期直接报错', async () => {
  const calls = [];
  const client = {
    dropboxFolder: async (ou, id) => { calls.push(`folder ${ou}/${id}`); return { ...FOLDER, Assessment: { ScoreDenominator: null } }; },
    dropboxAttachmentUrl: (ou, f, id) => `att/${f}/${id}`,
    submissionFileUrl: () => 'sub',
    mySubmissions: async () => { throw new ApiError(404, 'x'); },
    calendarEvent: async () => ({ Location: 'Hall' }),
    gradeObject: async () => ({ MaxPoints: 25 }),
    myGradeValue: async () => ({ PointsNumerator: 21, PointsDenominator: 25, DisplayedGrade: '84 %', Comments: { Text: 'Good' } }),
    topicFileUrl: () => ''
  };
  const d = await fetchDetail(client, { id: 'dropbox:101:7', ids: ['dropbox:101:7', 'calendar:101:3'], courseId: '101' }, { now: new Date('2026-10-22T00:00:00Z') });
  assert.deepEqual(calls, ['folder 101/7']);
  assert.equal(d.points, 25);
  assert.equal(d.grade.num, 21);
  assert.equal(d.grade.comments.text, 'Good');
  assert.equal(d.location, 'Hall');
  assert.equal(d.attachments[0].url, 'att/7/91');
  assert.deepEqual(d.warnings, [], '404 不算警告');
  assert.equal(d.fetchedAt, '2026-10-22T00:00:00.000Z');
  const authClient = { ...client, dropboxFolder: async () => { throw new AuthRequiredError(); } };
  await assert.rejects(fetchDetail(authClient, { id: 'dropbox:1:2', courseId: '1' }), AuthRequiredError);
});

await test('本机缓存最多留 60 项，旧的先删', () => {
  let c = {};
  for (let i = 0; i < 65; i++) c = putCache(c, `k${i}`, { fetchedAt: new Date(1e12 + i * 1000).toISOString() });
  assert.equal(Object.keys(c).length, 60);
  assert.ok(!c.k0 && c.k64);
});

console.log(`\n全部 ${n} 个测试通过`);
