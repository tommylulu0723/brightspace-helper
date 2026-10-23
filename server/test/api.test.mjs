// 后端接口测试：node test/api.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-'));
const outbox = [];
const fakeMailer = async (cfg, msg) => { if (msg.to.startsWith('fail')) throw new Error('550 mailbox unavailable'); outbox.push({ cfg, ...msg }); };
const { server, db, runReminders } = createServer({ dataDir: dir, trustProxy: false, reminderEveryMs: 0, mailer: fakeMailer });
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

async function api(method, p, { token, body, origin } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n`, e); process.exitCode = 1; }
}

let admin, alice;
await test('第一个注册的人自动成为管理员，不需要邀请码', async () => {
  assert.equal((await api('GET', '/api/info')).data.firstUser, true);
  const r = await api('POST', '/api/auth/register', { body: { email: 'Tommy@NYU.edu', password: 'password123', firstName: 'Tommy', lastName: 'Lu' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.role, 'admin');
  assert.equal(r.data.user.email, 'tommy@nyu.edu');
  admin = r.data.token;
});
await test('注册必须填 First / Last name；新服务器默认开放注册；切到邀请码模式后需要邀请码', async () => {
  assert.equal((await api('GET', '/api/info')).data.registration, 'open');
  assert.match((await api('POST', '/api/auth/register', { body: { email: 'x@nyu.edu', password: 'password123', firstName: 'X' } })).data.error, /Last name/);
  await api('PUT', '/api/admin/settings', { token: admin, body: { registration: 'invite' } });
  const r = await api('POST', '/api/auth/register', { body: { email: 'a@nyu.edu', password: 'password123', firstName: 'A', lastName: 'B' } });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, 'INVITE_REQUIRED');
});
await test('管理员创建邀请码，同学用它注册；次数用完就失效', async () => {
  const inv = (await api('POST', '/api/admin/invites', { token: admin, body: { uses: 1, note: '室友' } })).data.invite;
  assert.match(inv.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const r = await api('POST', '/api/auth/register', { body: { email: 'alice@nyu.edu', password: 'password123', firstName: 'Alice', lastName: 'Zhang', invite: inv.code.toLowerCase() } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.role, 'user');
  alice = r.data.token;
  const again = await api('POST', '/api/auth/register', { body: { email: 'bob@nyu.edu', password: 'password123', firstName: 'Bob', lastName: 'K', invite: inv.code } });
  assert.equal(again.data.code, 'INVITE_INVALID');
});
await test('注册校验：邮箱、密码长度、重复邮箱', async () => {
  await api('PUT', '/api/admin/settings', { token: admin, body: { registration: 'open' } });
  assert.equal((await api('POST', '/api/auth/register', { body: { email: 'bad', password: 'password123', firstName: 'A', lastName: 'B' } })).status, 400);
  assert.equal((await api('POST', '/api/auth/register', { body: { email: 'c@nyu.edu', password: 'short', firstName: 'A', lastName: 'B' } })).data.error, '密码至少 8 位');
  assert.equal((await api('POST', '/api/auth/register', { body: { email: 'alice@nyu.edu', password: 'password123', firstName: 'A', lastName: 'B' } })).status, 409);
  await api('PUT', '/api/admin/settings', { token: admin, body: { registration: 'invite' } });
});
await test('登录：密码错误 / 正确', async () => {
  assert.equal((await api('POST', '/api/auth/login', { body: { email: 'alice@nyu.edu', password: 'wrongpass1' } })).status, 401);
  const r = await api('POST', '/api/auth/login', { body: { email: 'ALICE@nyu.edu', password: 'password123' } });
  assert.equal(r.status, 200);
  assert.ok(r.data.token && r.data.flags.sync === true);
});
await test('数据库里不存明文密码和令牌', () => {
  db.flush();
  const raw = fs.readFileSync(path.join(dir, 'db.json'), 'utf8');
  assert.ok(!raw.includes('password123'));
  assert.ok(!raw.includes(alice));
});
await test('姓名校验：没通过前不能云同步；姓名不一致锁住；一致后绑定 Brightspace 账号', async () => {
  const no = await api('PUT', '/api/state', { token: alice, body: { overrides: {}, overridesAt: 1 } });
  assert.equal(no.status, 403);
  assert.equal(no.data.code, 'NOT_VERIFIED');
  let v = (await api('POST', '/api/me/verify', { token: alice, body: { firstName: 'Bob', lastName: 'Smith', identifier: '111' } })).data.user.verify;
  assert.equal(v.status, 'mismatch');
  assert.match(v.reason, /Alice Zhang.*Bob Smith/);
  assert.equal((await api('GET', '/api/state', { token: alice })).status, 403);
  // 大小写、中间名、名姓颠倒都算同一个人
  v = (await api('POST', '/api/me/verify', { token: alice, body: { firstName: 'ALICE Mei', lastName: 'zhang', identifier: '222', uniqueName: 'az123' } })).data.user.verify;
  assert.equal(v.status, 'ok');
  assert.equal(v.bsId, '222');
  // 换了一个 Brightspace 账号登录：锁住
  v = (await api('POST', '/api/me/verify', { token: alice, body: { firstName: 'Alice', lastName: 'Zhang', identifier: '999' } })).data.user.verify;
  assert.equal(v.status, 'mismatch');
  v = (await api('POST', '/api/me/verify', { token: alice, body: { firstName: 'Alice', lastName: 'Zhang', identifier: '222' } })).data.user.verify;
  assert.equal(v.status, 'ok');
  // 管理员也要校验
  const a = (await api('POST', '/api/me/verify', { token: admin, body: { firstName: 'Tommy', lastName: 'Lu', identifier: '1' } })).data.user.verify;
  assert.equal(a.status, 'ok');
});
await test('同一个 Brightspace 账号不能绑定两个课程助手账号', async () => {
  await api('PUT', '/api/admin/settings', { token: admin, body: { registration: 'open' } });
  const t = (await api('POST', '/api/auth/register', { body: { email: 'alice2@nyu.edu', password: 'password123', firstName: 'Alice', lastName: 'Zhang' } })).data.token;
  const v = (await api('POST', '/api/me/verify', { token: t, body: { firstName: 'Alice', lastName: 'Zhang', identifier: '222' } })).data.user.verify;
  assert.equal(v.status, 'taken');
  const id = (await api('GET', '/api/me', { token: t })).data.user.id;
  await api('DELETE', `/api/admin/users/${id}`, { token: admin });
  await api('PUT', '/api/admin/settings', { token: admin, body: { registration: 'invite' } });
});
await test('管理员可以手动通过（拼法不同但确认是本人）', async () => {
  const t = (await api('POST', '/api/auth/register', { body: { email: 'wei@nyu.edu', password: 'password123', firstName: 'David', lastName: 'Wei' } })).data;
  // 邀请码模式下注册失败，先开放一下
  let token = t.token;
  if (!token) {
    await api('PUT', '/api/admin/settings', { token: admin, body: { registration: 'open' } });
    token = (await api('POST', '/api/auth/register', { body: { email: 'wei@nyu.edu', password: 'password123', firstName: 'David', lastName: 'Wei' } })).data.token;
    await api('PUT', '/api/admin/settings', { token: admin, body: { registration: 'invite' } });
  }
  assert.equal((await api('POST', '/api/me/verify', { token, body: { firstName: 'Dawei', lastName: 'Wei', identifier: '333' } })).data.user.verify.status, 'mismatch');
  // 没通过时自己可以改正拼写
  const me = (await api('PATCH', '/api/me', { token, body: { firstName: 'Dawei' } })).data.user;
  assert.equal(me.name, 'Dawei Wei');
  assert.equal(me.verify.status, 'pending');
  const id = me.id;
  await api('PATCH', `/api/admin/users/${id}`, { token: admin, body: { verify: 'approve' } });
  const v = (await api('POST', '/api/me/verify', { token, body: { firstName: 'Someone', lastName: 'Else', identifier: '333' } })).data.user.verify;
  assert.equal(v.status, 'ok', '手动通过后绑定当前 Brightspace 账号');
  // 通过后不能自己改名字
  assert.equal((await api('PATCH', '/api/me', { token, body: { firstName: 'Hacker' } })).data.user.name, 'Dawei Wei');
  await api('DELETE', `/api/admin/users/${id}`, { token: admin });
});
await test('云同步：新的覆盖旧的，旧的不会覆盖新的', async () => {
  const snap = { user: { id: '222', name: 'Alice Zhang' }, courses: [{ id: '1', name: 'Web' }, { id: '2', name: 'LA' }], items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], materials: { 1: { files: 5 } } };
  const wrong = await api('PUT', '/api/state', { token: alice, body: { snapshot: { ...snap, user: { id: '999' } }, snapshotAt: 1500 } });
  assert.equal(wrong.status, 403, '快照里是别人的 Brightspace 账号');
  let r = await api('PUT', '/api/state', { token: alice, body: { overrides: { 'quiz:1:9': true }, overridesAt: 2000, settings: { hiddenCourseIds: ['3'] }, settingsAt: 2000, snapshot: snap, snapshotAt: 2000 } });
  assert.equal(r.status, 200);
  r = await api('PUT', '/api/state', { token: alice, body: { overrides: {}, overridesAt: 1000 } });
  const s = (await api('GET', '/api/state', { token: alice })).data;
  assert.deepEqual(s.overrides, { 'quiz:1:9': true });
  assert.deepEqual(s.settings.hiddenCourseIds, ['3']);
  assert.equal(s.snapshot.items.length, 3);
  const others = (await api('GET', '/api/state', { token: admin })).data;
  assert.equal(others.snapshot, null, '每个人的数据互相隔离');
});
await test('截止提醒邮件：没设置发信邮箱时不发；设置后发一次，不重复；已完成、移除的课不发', async () => {
  const now = new Date();
  const inH = (h) => new Date(now.getTime() + h * 3600e3).toISOString();
  const snap = {
    user: { id: '222' },
    courses: [{ id: '1', name: 'Web Design' }, { id: '2', name: 'Linear Algebra' }],
    items: [
      { id: 'hw1', courseId: '1', title: 'Project 2', type: 'assignment', due: inH(20), status: 'open', url: 'https://brightspace.nyu.edu/x' },
      { id: 'q1', courseId: '1', title: 'Quiz 3', type: 'quiz', due: inH(2), status: 'open' },
      { id: 'done1', courseId: '1', title: 'Already', type: 'assignment', due: inH(5), status: 'submitted' },
      { id: 'man', courseId: '1', title: 'Manual done', type: 'assignment', due: inH(5), status: 'open' },
      { id: 'hid', courseId: '2', title: 'Hidden course', type: 'assignment', due: inH(5), status: 'open' },
      { id: 'far', courseId: '1', title: 'Next week', type: 'assignment', due: inH(100), status: 'open' }
    ]
  };
  await api('PUT', '/api/state', { token: alice, body: { snapshot: snap, snapshotAt: Date.now(), overrides: { man: true }, overridesAt: Date.now(), settings: { hiddenCourseIds: ['2'] }, settingsAt: Date.now() } });
  assert.equal((await runReminders()).reason, 'MAIL_OFF');
  assert.equal(outbox.length, 0);
  const st = (await api('PUT', '/api/admin/settings', { token: admin, body: { mail: { host: 'smtp.gmail.com', port: 465, user: 'bot@gmail.com', pass: 'abcd efgh ijkl mnop', fromName: '课程助手' } } })).data.settings;
  assert.equal(st.mail.hasPass, true);
  assert.ok(!('pass' in st.mail), '密码不会返回给后台页面');
  assert.equal(db.data.settings.mail.pass, 'abcdefghijklmnop', '去掉应用专用密码里的空格');
  const r = await runReminders(now);
  assert.equal(r.sent, 1);
  const m = outbox.find((x) => x.to === 'alice@nyu.edu');
  assert.ok(m.subject.includes('Quiz 3'), m.subject);
  assert.ok(m.text.includes('Project 2') && m.text.includes('Quiz 3'));
  assert.ok(!m.text.includes('Already') && !m.text.includes('Manual done') && !m.text.includes('Hidden course') && !m.text.includes('Next week'));
  assert.ok(m.html.includes('Web Design'));
  assert.equal((await runReminders(now)).sent, 0, '同一个时间段不重复提醒');
  // 2 小时后 Project 2 进入 3 小时窗口？还没有（还剩 18 小时）；18 小时后会再发一次 3 小时提醒
  const later = new Date(now.getTime() + 18 * 3600e3);
  const r2 = await runReminders(later);
  assert.equal(r2.sent, 1);
  assert.ok(outbox[outbox.length - 1].subject.includes('Project 2'));
  // 关掉提醒后不发
  await api('PATCH', '/api/me', { token: alice, body: { reminders: { h24: false, h3: false } } });
  const t2 = new Date(now.getTime() + 19.5 * 3600e3);
  assert.equal((await runReminders(t2)).sent, 0);
  await api('PATCH', '/api/me', { token: alice, body: { reminders: { h24: true, h3: true } } });
});
await test('发信失败会记录原因；后台能看到发信统计；测试邮件', async () => {
  assert.equal((await api('POST', '/api/admin/test-email', { token: admin, body: { to: 'fail@x.com' } })).data.error, '550 mailbox unavailable');
  assert.equal((await api('POST', '/api/admin/test-email', { token: admin, body: { to: 'ok@x.com' } })).status, 200);
  const o = (await api('GET', '/api/admin/overview', { token: admin })).data;
  assert.equal(o.mail.configured, true);
  assert.ok(o.mail.today.sent >= 2 && o.mail.today.failed === 1);
  assert.equal(o.verified, 2);
  const log = (await api('GET', '/api/admin/mail-log', { token: admin })).data.log;
  assert.equal(log[0].to, 'ok@x.com');
  assert.equal((await api('POST', '/api/me/test-email', { token: alice })).status, 200);
  assert.equal(outbox[outbox.length - 1].to, 'alice@nyu.edu');
});
await test('管理后台统计：同步人数、每人的课程 / 事项 / 课件数', async () => {
  const o = (await api('GET', '/api/admin/overview', { token: admin })).data;
  assert.equal(o.users, 2);
  assert.equal(o.today.users, 1);
  assert.ok(o.today.syncs >= 1);
  assert.equal(o.days.length, 14);
  assert.equal(o.synced24h, 1);
  const users = (await api('GET', '/api/admin/users', { token: admin })).data.users;
  const a = users.find((u) => u.email === 'alice@nyu.edu');
  assert.equal(a.stats.courses, 2);
  assert.equal(a.verify.status, 'ok');
  assert.ok(a.reminderCount >= 2);
  assert.ok(!('passwordHash' in a));
  assert.ok(!('usage7d' in a));
});
await test('普通用户不能进管理后台', async () => {
  assert.equal((await api('GET', '/api/admin/users', { token: alice })).status, 403);
  assert.equal((await api('GET', '/api/admin/users')).status, 401);
});
await test('云同步开关：关掉后不能上传；开关会下发给插件', async () => {
  await api('PUT', '/api/admin/settings', { token: admin, body: { flags: { sync: false } } });
  assert.equal((await api('PUT', '/api/state', { token: alice, body: { overrides: {}, overridesAt: 9999 } })).data.code, 'SYNC_OFF');
  const me = (await api('GET', '/api/me', { token: alice })).data;
  assert.deepEqual(me.flags, { sync: false });
  await api('PUT', '/api/admin/settings', { token: admin, body: { flags: { sync: true } } });
});
await test('停用账号后立即退出登录；重置密码', async () => {
  const id = (await api('GET', '/api/admin/users', { token: admin })).data.users.find((u) => u.email === 'alice@nyu.edu').id;
  await api('PATCH', `/api/admin/users/${id}`, { token: admin, body: { disabled: true } });
  assert.equal((await api('GET', '/api/me', { token: alice })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { body: { email: 'alice@nyu.edu', password: 'password123' } })).data.code, 'DISABLED');
  await api('PATCH', `/api/admin/users/${id}`, { token: admin, body: { disabled: false } });
  const pw = (await api('POST', `/api/admin/users/${id}/reset-password`, { token: admin })).data.password;
  assert.equal((await api('POST', '/api/auth/login', { body: { email: 'alice@nyu.edu', password: 'password123' } })).status, 401);
  const r = await api('POST', '/api/auth/login', { body: { email: 'alice@nyu.edu', password: pw } });
  assert.equal(r.status, 200);
  alice = r.data.token;
});
await test('管理员不能停用、降级、删除自己', async () => {
  const me = (await api('GET', '/api/me', { token: admin })).data.user;
  assert.equal((await api('PATCH', `/api/admin/users/${me.id}`, { token: admin, body: { disabled: true } })).status, 400);
  assert.equal((await api('DELETE', `/api/admin/users/${me.id}`, { token: admin })).status, 400);
});
await test('删除用户会同时删掉他的数据', async () => {
  const id = (await api('GET', '/api/admin/users', { token: admin })).data.users.find((u) => u.email === 'alice@nyu.edu').id;
  assert.ok(fs.existsSync(path.join(dir, 'state', `${id}.json`)));
  await api('DELETE', `/api/admin/users/${id}`, { token: admin });
  assert.ok(!fs.existsSync(path.join(dir, 'state', `${id}.json`)));
  assert.equal((await api('GET', '/api/me', { token: alice })).status, 401);
});
await test('反馈：登录用户和未登录都能提交；管理员能看诊断、回复、标记已处理；用户能看到回复', async () => {
  assert.equal((await api('POST', '/api/feedback', { body: { message: '' } })).status, 400);
  const anon = await api('POST', '/api/feedback', { body: { message: '登录页打不开', contact: 'x@nyu.edu', version: '1.6.5' } });
  assert.equal(anon.status, 200);
  const mine = await api('POST', '/api/feedback', { token: admin, body: { message: '截止时间显示不对', kind: 'bug', version: '1.6.5', diagnostics: { items: [{ title: 'HW' }] } } });
  assert.equal(mine.status, 200);
  const list = (await api('GET', '/api/admin/feedback', { token: admin })).data;
  assert.equal(list.open, 2);
  const f = list.feedback.find((x) => x.id === mine.data.id);
  assert.equal(f.email, 'tommy@nyu.edu');
  assert.ok(f.hasDiag && !('diagnostics' in f), '列表里不带诊断信息');
  const detail = (await api('GET', `/api/admin/feedback/${f.id}`, { token: admin })).data;
  assert.equal(detail.diagnostics.items[0].title, 'HW');
  await api('PATCH', `/api/admin/feedback/${f.id}`, { token: admin, body: { status: 'done', reply: '已修复，更新到最新版' } });
  const back = (await api('GET', '/api/me/feedback', { token: admin })).data.feedback[0];
  assert.equal(back.status, 'done');
  assert.equal(back.reply, '已修复，更新到最新版');
  assert.equal((await api('GET', '/api/admin/overview', { token: admin })).data.feedbackOpen, 1);
  assert.ok([401, 403].includes((await api('GET', '/api/admin/feedback', { token: alice })).status), '普通用户看不到别人的反馈');
  await api('DELETE', `/api/admin/feedback/${anon.data.id}`, { token: admin });
  assert.equal((await api('GET', '/api/admin/feedback', { token: admin })).data.feedback.length, 1);
});
await test('CORS：插件来源允许，陌生网站不允许', async () => {
  const ok = await api('GET', '/api/info', { origin: 'chrome-extension://abcdefghijklmnop' });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'chrome-extension://abcdefghijklmnop');
  const bad = await api('GET', '/api/info', { origin: 'https://evil.example.com' });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});
await test('静态页面和路径穿越防护', async () => {
  assert.equal((await fetch(`${base}/admin/`)).status, 200);
  assert.equal((await fetch(`${base}/m/`)).status, 200);
  assert.equal((await fetch(`${base}/lib/format.js`)).status, 200);
  assert.equal((await fetch(`${base}/shared.css`)).status, 200);
  assert.equal((await fetch(`${base}/lib/..%2f..%2fserver.js`)).status, 404);
  assert.equal((await fetch(`${base}/..%2fserver.js`)).status, 404);
});
await test('数据写坏了也能启动（自动备份坏文件）', async () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-'));
  fs.writeFileSync(path.join(d2, 'db.json'), '{broken');
  const s2 = createServer({ dataDir: d2 });
  assert.equal(s2.db.data.users.length, 0);
  assert.ok(fs.readdirSync(d2).some((f) => f.startsWith('db.json.broken-')));
  s2.server.close();
});

server.close();
console.log(process.exitCode ? '\n有测试失败' : `\n全部 ${passed} 个测试通过`);
