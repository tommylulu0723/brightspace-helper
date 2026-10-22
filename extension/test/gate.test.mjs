import assert from 'node:assert/strict';
import { gateState, isBlocking } from '../src/lib/gate.js';
let n = 0;
const t = (name, fn) => { fn(); n++; };
const user = (verify) => ({ token: 'x', user: { email: 'a@nyu.edu', name: 'Tommy Lu', verify } });
const bs = { firstName: 'Tommy', lastName: 'Lu', id: '42' };

t('不要求登录时永远可以用', () => assert.equal(gateState({ requireLogin: false }).state, 'ok'));
t('没登录 → login', () => {
  assert.equal(gateState({ requireLogin: true, cloud: null }).state, 'login');
  assert.equal(gateState({ requireLogin: true, cloud: { token: null, error: '登录已过期' } }).reason, '登录已过期');
});
t('登录了但没读到 Brightspace 姓名 → needBrightspace；读到了 → checking', () => {
  assert.equal(gateState({ requireLogin: true, cloud: user({ status: 'pending' }), data: null }).state, 'needBrightspace');
  assert.equal(gateState({ requireLogin: true, cloud: user({ status: 'pending' }), data: { user: { name: 'Tommy Lu' } } }).state, 'needBrightspace', '旧版本数据没有 firstName');
  assert.equal(gateState({ requireLogin: true, cloud: user({ status: 'pending' }), data: { user: bs } }).state, 'checking');
});
t('服务器说通过 → ok；不一致 / 被占用 → 锁住', () => {
  assert.equal(gateState({ requireLogin: true, cloud: user({ status: 'ok', bsId: '42' }), data: { user: bs } }).state, 'ok');
  assert.equal(gateState({ requireLogin: true, cloud: user({ status: 'mismatch', reason: 'x' }), data: { user: bs } }).state, 'mismatch');
  assert.equal(gateState({ requireLogin: true, cloud: user({ status: 'taken' }), data: { user: bs } }).state, 'taken');
});
t('通过后换了别人的 Brightspace 账号登录 → 马上锁住（不用等服务器）', () => {
  const g = gateState({ requireLogin: true, cloud: user({ status: 'ok', bsId: '42' }), data: { user: { ...bs, id: '99' } } });
  assert.equal(g.state, 'mismatch');
  assert.match(g.reason, /不是同一个人/);
});
t('只有没登录、姓名不一致、账号被占用才挡住；读取 / 核对中照常进入', () => {
  assert.ok(isBlocking('login') && isBlocking('mismatch') && isBlocking('taken'));
  assert.ok(!isBlocking('needBrightspace') && !isBlocking('checking') && !isBlocking('ok'));
});
console.log(`全部 ${n} 个测试通过`);
