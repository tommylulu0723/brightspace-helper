// 发信协议、姓名匹配、提醒挑选：node test/mail.test.mjs
import assert from 'node:assert/strict';
import net from 'node:net';
import { sendMail, buildMessage } from '../lib/mailer.js';
import { namesMatch, normName } from '../lib/names.js';
import { pickReminders, buildReminderEmail, fmtDue } from '../lib/reminders.js';

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };

// 一个最小的假 SMTP 服务器，记录收到的命令和正文
function fakeSmtp({ password = 'secret' } = {}) {
  const got = { cmds: [], data: '' };
  const srv = net.createServer((s) => {
    let mode = 'cmd';
    let buf = '';
    s.write('220 fake.smtp ESMTP\r\n');
    s.on('data', (c) => {
      buf += c.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (mode === 'data') {
          if (line === '.') { mode = 'cmd'; s.write('250 OK queued\r\n'); } else got.data += `${line}\n`;
          continue;
        }
        got.cmds.push(line);
        if (mode === 'user') { mode = 'pass'; s.write('334 UGFzc3dvcmQ6\r\n'); continue; }
        if (mode === 'pass') { mode = 'cmd'; s.write(Buffer.from(line, 'base64').toString() === password ? '235 OK\r\n' : '535 5.7.8 Bad credentials\r\n'); continue; }
        if (line.startsWith('EHLO')) s.write('250-fake.smtp\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME\r\n');
        else if (line === 'AUTH LOGIN') { mode = 'user'; s.write('334 VXNlcm5hbWU6\r\n'); }
        else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) s.write('250 OK\r\n');
        else if (line === 'DATA') { mode = 'data'; s.write('354 go\r\n'); }
        else if (line === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
        else s.write('502 ?\r\n');
      }
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, got, port: srv.address().port })));
}

await test('SMTP：登录、发信，中文标题和正文正确编码', async () => {
  const { srv, got, port } = await fakeSmtp();
  await sendMail({ host: '127.0.0.1', port, secure: 'none', user: 'bot@gmail.com', pass: 'secret', fromName: '课程助手' },
    { to: 'tommy@nyu.edu', subject: '📌 明天截止：Project 2', text: '你好\n.leading dot', html: '<b>你好</b>' });
  srv.close();
  assert.ok(got.cmds.includes('AUTH LOGIN'));
  assert.ok(got.cmds.includes('MAIL FROM:<bot@gmail.com>'));
  assert.ok(got.cmds.includes('RCPT TO:<tommy@nyu.edu>'));
  const subj = got.data.match(/^Subject: =\?UTF-8\?B\?([^?]+)\?=/m)[1];
  assert.equal(Buffer.from(subj, 'base64').toString(), '📌 明天截止：Project 2');
  assert.match(got.data, /From: =\?UTF-8\?B\?[^?]+\?= <bot@gmail.com>/);
  const bodies = [...got.data.matchAll(/base64\n\n([\s\S]*?)\n--/g)].map((m) => Buffer.from(m[1].replace(/\n/g, ''), 'base64').toString());
  assert.deepEqual(bodies, ['你好\n.leading dot', '<b>你好</b>']);
});

await test('SMTP：密码错误时给出看得懂的原因', async () => {
  const { srv, port } = await fakeSmtp();
  await assert.rejects(
    sendMail({ host: '127.0.0.1', port, secure: 'none', user: 'bot@gmail.com', pass: 'wrong' }, { to: 'a@b.com', subject: 'x', text: 'y' }),
    /应用专用密码/);
  srv.close();
});

await test('SMTP：连不上 / 没设置时报错', async () => {
  await assert.rejects(sendMail({}, { to: 'a@b.com', subject: 'x' }), /还没设置发信邮箱/);
  await assert.rejects(sendMail({ host: '127.0.0.1', port: 1, secure: 'none', user: 'u', pass: 'p' }, { to: 'a@b.com', subject: 'x' }), /连不上邮件服务器/);
});

await test('邮件格式：每行不超过 998 字符', () => {
  const m = buildMessage({ from: 'a@b.com', to: 'c@d.com', subject: 'x'.repeat(10), text: '长'.repeat(3000), html: '' });
  assert.ok(m.split('\r\n').every((l) => l.length <= 998));
});

await test('姓名匹配：大小写、重音、中间名、连字符、名姓颠倒', () => {
  const R = (f, l) => ({ firstName: f, lastName: l });
  assert.ok(namesMatch(R('Tommy', 'Lu'), R('TOMMY', 'LU')));
  assert.ok(namesMatch(R('José', 'García'), R('Jose', 'Garcia')));
  assert.ok(namesMatch(R('Mary', 'Smith-Jones'), R('Mary Ann', 'Smith Jones')));
  assert.ok(namesMatch(R('Qian', 'Hua'), R('Hua', 'Qian')), '名姓颠倒');
  assert.ok(!namesMatch(R('Tommy', 'Lu'), R('Tommy', 'Li')));
  assert.ok(!namesMatch(R('Tom', 'Lu'), R('Tommy', 'Lu')), '名字只是前几个字母相同不算');
  assert.ok(!namesMatch(R('', ''), R('', '')));
  assert.equal(normName("  O'Brien  "), 'obrien');
});

await test('提醒挑选：24 小时窗口、3 小时窗口、偏好开关', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const at = (h) => new Date(now.getTime() + h * 3600e3).toISOString();
  const snapshot = { courses: [{ id: 'c', name: 'Web' }], items: [
    { id: 'a', courseId: 'c', title: 'A', due: at(10) },
    { id: 'b', courseId: 'c', title: 'B', due: at(1) },
    { id: 'old', courseId: 'c', title: 'Past', due: at(-1) },
    { id: 'nodue', courseId: 'c', title: 'No due' }
  ] };
  const picks = pickReminders({ snapshot, now, isDone: () => false });
  assert.deepEqual(picks.map((p) => `${p.item.id}:${p.window}`), ['b:3h', 'a:24h']);
  const only24 = pickReminders({ snapshot, now, prefs: { h3: false }, isDone: () => false });
  assert.deepEqual(only24.map((p) => `${p.item.id}:${p.window}`), ['b:24h', 'a:24h']);
  const sent = { 'b|3h': now.toISOString() };
  assert.deepEqual(pickReminders({ snapshot, now, sent, isDone: () => false }).map((p) => p.item.id), ['a']);
});

await test('提醒邮件内容：纽约时间、剩余时间、旧数据提示', () => {
  const now = new Date('2026-10-22T16:00:00Z'); // 纽约 12:00
  const d = fmtDue('2026-10-22T19:30:00Z', now);
  assert.ok(d.when.includes('15:30') && d.when.includes('纽约时间'), d.when);
  assert.equal(d.rel, '还剩 3 小时 30 分');
  const mail = buildReminderEmail({ name: 'Tommy', picks: [{ item: { title: 'HW <1>', type: 'assignment', due: '2026-10-22T19:30:00Z' }, courseName: 'Web', window: '24h' }], now, snapshotAt: now.getTime() - 3 * 86400e3 });
  assert.ok(mail.html.includes('HW &lt;1&gt;'), 'HTML 转义');
  assert.ok(mail.text.includes('3 天前的同步'));
  assert.ok(mail.subject.startsWith('📌'));
});

console.log(`\n全部 ${n} 个测试通过`);
