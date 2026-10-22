// 能不能用插件：要求登录时，必须登录课程助手账号，而且注册姓名和 Brightspace 上的一致。
// 返回 { state, reason }：
//   ok              可以用
//   login           还没登录课程助手
//   needBrightspace 登录了，但还没读到 Brightspace 上的姓名（没登录 Brightspace / 还没同步过）
//   checking        正在和服务器核对
//   mismatch        姓名不一致，或者换了一个 Brightspace 账号
//   taken           这个 Brightspace 账号已经被别的课程助手账号绑定
export function gateState({ requireLogin, cloud, data }) {
  if (!requireLogin) return { state: 'ok' };
  if (!cloud || !cloud.token || !cloud.user) return { state: 'login', reason: cloud?.error || '' };
  const v = cloud.user.verify || { status: 'pending' };
  const bs = data?.user;
  // 本机马上能看出来的：现在登录的 Brightspace 账号不是绑定的那个
  if (v.status === 'ok' && v.bsId && bs?.id && bs.id !== v.bsId) {
    return { state: 'mismatch', reason: '现在登录的 Brightspace 账号和绑定的不是同一个人' };
  }
  if (v.status === 'ok') return { state: 'ok' };
  if (v.status === 'mismatch' || v.status === 'taken') return { state: v.status, reason: v.reason || '' };
  if (!bs || !(bs.firstName || bs.lastName)) return { state: 'needBrightspace' };
  return { state: 'checking' };
}
