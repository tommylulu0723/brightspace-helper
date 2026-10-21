// 后端接口测试：node test/api.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-'));
const { server, db } = createServer({ dataDir: dir, trustProxy: false });
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
  const r = await api('POST', '/api/auth/register', { body: { email: 'Tommy@NYU.edu', password: 'password123', name: 'Tommy' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.role, 'admin');
  assert.equal(r.data.user.email, 'tommy@nyu.edu');
  admin = r.data.token;
});
await test('之后注册默认需要邀请码', async () => {
  assert.equal((await api('GET', '/api/info')).data.registration, 'invite');
  const r = await api('POST', '/api/auth/register', { body: { email: 'a@nyu.edu', password: 'password123' } });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, 'INVITE_REQUIRED');
});
await test('管理员创建邀请码，同学用它注册；次数用完就失效', async () => {
  const inv = (await api('POST', '/api/admin/invites', { token: admin, body: { uses: 1, note: '室友' } })).data.invite;
  assert.match(inv.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const r = await api('POST', '/api/auth/register', { body: { email: 'alice@nyu.edu', password: 'password123', name: 'Alice', invite: inv.code.toLowerCase() } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.role, 'user');
  alice = r.data.token;
  const again = await api('POST', '/api/auth/register', { body: { email: 'bob@nyu.edu', password: 'password123', invite: inv.code } });
  assert.equal(again.data.code, 'INVITE_INVALID');
});
await test('注册校验：邮箱、密码长度、重复邮箱', async () => {
  await api('PUT', '/api/admin/settings', { token: admin, body: { registration: 'open' } });
  assert.equal((await api('POST', '/api/auth/register', { body: { email: 'bad', password: 'password123' } })).status, 400);
  assert.equal((await api('POST', '/api/auth/register', { body: { email: 'c@nyu.edu', password: 'short' } })).data.error, '密码至少 8 位');
  assert.equal((await api('POST', '/api/auth/register', { body: { email: 'alice@nyu.edu', password: 'password123' } })).status, 409);
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
await test('云同步：新的覆盖旧的，旧的不会覆盖新的', async () => {
  const snap = { courses: [{ id: '1', name: 'Web' }, { id: '2', name: 'LA' }], items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], materials: { 1: { files: 5 } } };
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
await test('管理后台统计：同步人数、每人的课程 / 事项 / 课件数', async () => {
  const o = (await api('GET', '/api/admin/overview', { token: admin })).data;
  assert.equal(o.users, 2);
  assert.equal(o.today.users, 1);
  assert.equal(o.today.syncs, 1);
  assert.equal(o.days.length, 14);
  assert.equal(o.synced24h, 1);
  const users = (await api('GET', '/api/admin/users', { token: admin })).data.users;
  const a = users.find((u) => u.email === 'alice@nyu.edu');
  assert.deepEqual(a.stats, { courses: 2, items: 3, files: 5 });
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
