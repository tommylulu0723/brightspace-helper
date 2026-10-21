// 演示模式用的示例数据（不是你的真实课程）。
const HOUR = 3600 * 1000;

function at(now, dayOffset, hh, mm) {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

function topic(id, title, filename, daysAgo, now, extra = {}) {
  const ext = (filename.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
  return {
    id: String(id), title, kind: 'file', ext, filename,
    open: `https://brightspace.nyu.edu/d2l/le/content/0/viewContent/${id}/View`,
    download: `https://brightspace.nyu.edu/d2l/api/le/1.80/0/content/topics/${id}/file`,
    modified: new Date(now.getTime() - daysAgo * 24 * HOUR).toISOString(),
    lecture: /lecture|slides|notes/i.test(title) || /pptx?$/.test(ext),
    ...extra
  };
}

export function demoData(now = new Date()) {
  const base = 'https://brightspace.nyu.edu';
  const courses = [
    { id: '101', name: 'Introduction to Web Design and Computer Principles', code: 'DEMO-101', hidden: false },
    { id: '102', name: 'Linear Algebra', code: 'DEMO-102', hidden: false },
    { id: '103', name: 'Microeconomics', code: 'DEMO-103', hidden: false },
    { id: '104', name: 'Writing the Essay', code: 'DEMO-104', hidden: false }
  ];
  const mk = (source, courseId, entityId, title, type, due, status) => ({
    id: `${source}:${courseId}:${entityId}`,
    ids: [`${source}:${courseId}:${entityId}`],
    courseId, title, type, due, status, source, sources: [source], signals: [],
    url: `${base}/d2l/home/${courseId}`
  });
  const items = [
    mk('quiz', '101', 9, 'Reading Quiz #9', 'quiz', at(now, -14, 11, 0), 'completed'),
    mk('quiz', '101', 10, 'Reading Quiz #10', 'quiz', at(now, -14, 11, 0), 'completed'),
    mk('quiz', '101', 11, 'Reading Quiz #11', 'quiz', at(now, -2, 11, 0), 'completed'),
    mk('quiz', '101', 12, 'Reading Quiz #12', 'quiz', at(now, -2, 11, 0), 'unknown'),
    mk('dropbox', '102', 1, 'Problem Set 5', 'assignment', at(now, -1, 23, 59), 'open'),
    mk('dropbox', '101', 3, 'Lab 6: Responsive Layout', 'assignment', new Date(now.getTime() + 5 * HOUR).toISOString(), 'open'),
    mk('dropbox', '103', 4, 'Reading Response 7', 'assignment', at(now, 0, 23, 30), 'submitted'),
    mk('quiz', '103', 5, 'Quiz 4 · Elasticity', 'quiz', at(now, 1, 11, 0), 'unknown'),
    mk('dropbox', '104', 6, 'Essay 2 Draft', 'assignment', at(now, 3, 23, 59), 'open'),
    mk('quiz', '101', 13, 'Reading Quiz #13', 'quiz', at(now, 5, 11, 0), 'unknown'),
    mk('calendar', '102', 8, 'Midterm Exam', 'exam', at(now, 8, 9, 30), 'unknown'),
    mk('dropbox', '103', 9, 'Problem Set 3', 'assignment', at(now, 9, 23, 59), 'open'),
    mk('content', '104', 10, 'Peer Review Discussion', 'discussion', at(now, 12, 12, 0), 'unknown')
  ].sort((a, b) => Date.parse(a.due) - Date.parse(b.due));

  const fetchedAt = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
  const summarize = (modules) => {
    const all = modules.flatMap((m) => m.topics);
    return { modules, files: all.filter((t) => t.kind === 'file').length, lectures: all.filter((t) => t.lecture).length, links: all.filter((t) => t.kind === 'link').length, fetchedAt };
  };
  const materials = {
    101: summarize([
      { id: '1', path: ['Course Info'], topics: [topic(500, 'Syllabus', 'Syllabus Fall 2026.pdf', 50, now, { lecture: false })] },
      { id: '2', path: ['Week 7 · CSS Layout'], topics: [
        topic(501, 'Lecture 13 – Flexbox', 'Lecture13-Flexbox.pptx', 9, now),
        topic(502, 'Lecture 14 – Grid', 'Lecture14-Grid.pptx', 7, now),
        topic(503, 'Lab 6 starter files', 'lab6-starter.zip', 7, now, { lecture: false }),
        { id: '504', title: 'MDN: CSS Grid guide', kind: 'link', ext: '', filename: '', open: 'https://developer.mozilla.org/', download: null, modified: null, lecture: false }
      ] },
      { id: '3', path: ['Week 8 · Responsive Design'], topics: [
        topic(505, 'Lecture 15 – Media Queries', 'Lecture15-MediaQueries.pdf', 2, now),
        topic(506, 'Lecture 16 – Mobile First', 'Lecture16-MobileFirst.pdf', 1, now),
        topic(507, 'Reading: Responsive Web Design', 'RWD-reading.pdf', 2, now, { lecture: false })
      ] }
    ]),
    102: summarize([
      { id: '1', path: ['Lecture Notes'], topics: [
        topic(601, 'Notes 7 – Eigenvalues', 'notes07.pdf', 8, now),
        topic(602, 'Notes 8 – Diagonalization', 'notes08.pdf', 3, now)
      ] },
      { id: '2', path: ['Problem Sets'], topics: [topic(603, 'Problem Set 6', 'pset6.pdf', 3, now, { lecture: false })] }
    ]),
    103: summarize([
      { id: '1', path: ['Slides'], topics: [topic(701, 'Ch.5 Elasticity slides', 'ch5.pptx', 10, now), topic(702, 'Ch.6 Consumer Choice slides', 'ch6.pptx', 4, now)] }
    ]),
    104: summarize([
      { id: '1', path: ['Readings'], topics: [topic(801, 'Essay 2 prompt', 'essay2-prompt.docx', 12, now, { lecture: false })] }
    ])
  };

  const ago = (h) => new Date(now.getTime() - h * HOUR).toISOString();
  const news = [
    { id: 'news:102:1', courseId: '102', title: 'Midterm scope updated', text: 'Hi all,\nThe midterm on 10/29 will cover Chapters 1–5 (Sections 5.1–5.3 only). Practice problems are posted under Week 8.\nOffice hours this week: Tue 3–5pm, WWH 512.', date: ago(5), modified: null, pinned: true, attachments: 1 },
    { id: 'news:101:2', courseId: '101', title: 'Lab 6 extension', text: 'Lab 6 is now due Thursday 11:59pm instead of Wednesday. Please push your final version to GitHub before submitting.', date: ago(20), modified: null, pinned: false, attachments: 0 },
    { id: 'news:103:3', courseId: '103', title: 'Recitation room change', text: 'Friday recitation moves to Silver 207 starting this week.', date: ago(50), modified: null, pinned: false, attachments: 0 },
    { id: 'news:104:4', courseId: '104', title: 'Peer review groups posted', text: 'Groups for the Essay 2 peer review are posted in the Discussions tool.', date: ago(80), modified: null, pinned: false, attachments: 0 }
  ];
  const g = (id, name, num, den, h, fb = false) => ({ id, name, type: 1, displayed: `${num} / ${den}`, num, den, pct: Math.round((num / den) * 1000) / 10, date: ago(h), feedback: fb });
  const grades = {
    101: { final: null, items: [g('9', 'Reading Quiz #11', 1, 1, 30), g('8', 'Lab 5: Flexbox', 18, 20, 70, true), g('7', 'Reading Quiz #10', 1, 1, 200), g('6', 'Lab 4: Forms', 19, 20, 260)] },
    102: { final: null, items: [g('5', 'Problem Set 4', 42, 50, 45, true), g('4', 'Quiz 2', 8, 10, 160)] },
    103: { final: null, items: [g('3', 'Problem Set 2', 27, 30, 100)] },
    104: { final: null, items: [] }
  };
  const demoUpdates = [
    { id: 'mat:101:506', kind: 'material-new', courseId: '101', title: 'Lecture 16 – Mobile First', detail: { path: 'Week 8 · Responsive Design', ext: 'pdf' }, at: ago(3) },
    { id: 'due:dropbox:101:3', kind: 'due-changed', courseId: '101', title: 'Lab 6: Responsive Layout', detail: { from: ago(-2), to: new Date(now.getTime() + 5 * HOUR).toISOString(), type: 'assignment' }, at: ago(20) },
    { id: 'grade:102:5', kind: 'grade-new', courseId: '102', title: 'Problem Set 4', detail: { displayed: '42 / 50', pct: 84 }, at: ago(45) },
    { id: 'new:dropbox:103:9', kind: 'item-new', courseId: '103', title: 'Problem Set 3', detail: { due: at(now, 9, 23, 59), type: 'assignment', typeLabel: '作业' }, at: ago(60) }
  ];

  return {
    news,
    grades,
    demoUpdates,
    user: { name: 'Tommy Lu' },
    courses: courses.map((c) => ({ ...c, auto: true, count: items.filter((i) => i.courseId === c.id).length })),
    allCourses: [
      ...courses.map((c) => ({ ...c, start: '2026-09-02T00:00:00Z', end: '2026-12-20T00:00:00Z', current: true, auto: true, active: true })),
      { id: '105', name: 'NYU Student Wellness Module', code: 'DEMO-105', start: '2026-09-01T00:00:00Z', end: '2026-12-31T00:00:00Z', current: true, auto: false, active: false },
      { id: '090', name: 'Calculus I (Spring 2026)', code: 'DEMO-090', start: '2026-01-20T00:00:00Z', end: '2026-05-15T00:00:00Z', current: false, auto: false, active: false }
    ],
    items,
    materials,
    submittedKeys: [],
    lastSync: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
    warnings: [],
    requestCount: 0,
    usingFallback: false
  };
}
