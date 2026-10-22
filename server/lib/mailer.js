// 零依赖 SMTP 发信：支持 465（SSL）和 587（STARTTLS），AUTH LOGIN。
// Gmail：smtp.gmail.com 465，用户名是邮箱，密码是"应用专用密码"（16 位，不是登录密码）。
// QQ 邮箱：smtp.qq.com 465，密码是邮箱设置里生成的"授权码"。
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n');

export function smtpConfigured(cfg) {
  return !!(cfg && cfg.host && cfg.user && cfg.pass);
}

/** 组装一封 text + html 的邮件 */
export function buildMessage({ fromName, from, to, subject, text, html, date = new Date() }) {
  const boundary = `ch_${crypto.randomBytes(8).toString('hex')}`;
  const domain = String(from).split('@')[1] || 'localhost';
  const headers = [
    `From: ${encWord(fromName || '课程助手')} <${from}>`,
    `To: <${to}>`,
    `Subject: ${encWord(subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ];
  const part = (type, body) => [
    `--${boundary}`,
    `Content-Type: ${type}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(body)).trimEnd()
  ].join('\r\n');
  return [...headers, '', part('text/plain', text || ''), part('text/html', html || `<pre>${text || ''}</pre>`), `--${boundary}--`, ''].join('\r\n');
}

/**
 * cfg: { host, port, secure: 'ssl' | 'starttls' | 'none', user, pass, from, fromName }
 * 成功返回 { ok: true }；失败抛出 Error（message 是给人看的原因）
 */
export function sendMail(cfg, { to, subject, text, html }, { timeoutMs = 20000 } = {}) {
  if (!smtpConfigured(cfg)) return Promise.reject(new Error('还没设置发信邮箱'));
  const port = Number(cfg.port) || 465;
  const mode = cfg.secure || (port === 465 ? 'ssl' : 'starttls');
  const from = cfg.from || cfg.user;
  const message = buildMessage({ fromName: cfg.fromName, from, to, subject, text, html });

  return new Promise((resolve, reject) => {
    let sock;
    let buf = '';
    let waiter = null;
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock?.end(); } catch { /* ignore */ }
      err ? reject(err) : resolve({ ok: true });
    };
    const timer = setTimeout(() => finish(new Error('连接邮件服务器超时')), timeoutMs);

    const replies = [];
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      // 一个完整回复：最后一行是 "250 xxx"（第 4 个字符是空格）
      let lines = buf.split('\r\n');
      let start = 0;
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3}( |$)/.test(lines[i])) {
          const reply = lines.slice(start, i + 1);
          start = i + 1;
          replies.push({ code: Number(lines[i].slice(0, 3)), text: reply.join('\n') });
        }
      }
      buf = lines.slice(start).join('\r\n');
      while (waiter && replies.length) { const w = waiter; waiter = null; w(replies.shift()); }
    };
    const read = () => new Promise((r) => { if (replies.length) r(replies.shift()); else waiter = r; });
    const cmd = async (line, expect) => {
      sock.write(`${line}\r\n`);
      const res = await read();
      if (!expect.includes(res.code)) {
        const shown = line.startsWith('AUTH') || /^[A-Za-z0-9+/=]{8,}$/.test(line) ? '登录' : line.split(' ')[0];
        const hint = res.code === 535 || res.code === 534 ? '（用户名或密码不对：Gmail 要用"应用专用密码"，QQ 邮箱要用"授权码"）' : '';
        throw new Error(`${shown} 失败：${res.text.split('\n').pop()}${hint}`);
      }
      return res;
    };
    const attach = (s) => {
      sock = s;
      sock.on('data', onData);
      sock.on('error', (e) => finish(new Error(`连不上邮件服务器：${e.message}`)));
      sock.on('close', () => finish(new Error('邮件服务器断开了连接')));
    };

    const run = async () => {
      const greet = await read();
      if (greet.code !== 220) throw new Error(`邮件服务器拒绝连接：${greet.text}`);
      const ehlo = 'EHLO course-helper';
      let caps = await cmd(ehlo, [250]);
      if (mode === 'starttls') {
        await cmd('STARTTLS', [220]);
        sock.removeListener('data', onData);
        const secure = tls.connect({ socket: sock, servername: cfg.host });
        await new Promise((r, j) => { secure.once('secureConnect', r); secure.once('error', j); });
        attach(secure);
        caps = await cmd(ehlo, [250]);
      }
      void caps;
      await cmd('AUTH LOGIN', [334]);
      await cmd(b64(cfg.user), [334]);
      await cmd(b64(cfg.pass), [235]);
      await cmd(`MAIL FROM:<${from}>`, [250]);
      await cmd(`RCPT TO:<${to}>`, [250, 251]);
      await cmd('DATA', [354]);
      // 正文里以 "." 开头的行要多加一个点（base64 不会出现，头部保险起见也处理）
      await cmd(`${message.replace(/\r\n\./g, '\r\n..')}\r\n.`, [250]);
      sock.write('QUIT\r\n');
      finish();
    };

    try {
      const s = mode === 'ssl'
        ? tls.connect({ host: cfg.host, port, servername: cfg.host })
        : net.connect({ host: cfg.host, port });
      attach(s);
      run().catch(finish);
    } catch (e) {
      finish(e);
    }
  });
}
