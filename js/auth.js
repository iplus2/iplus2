// ============================================
// 认证工具函数
// ============================================

/**
 * 获取当前登录用户，未登录则跳转到登录页
 */
async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

/**
 * 登出
 */
async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

/**
 * 显示提示消息
 */
function showMessage(elementId, text, type = 'error') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.className = `message ${type}`;
  el.style.display = 'block';
  // 5秒后自动隐藏
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

/**
 * 隐藏提示消息
 */
function hideMessage(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.style.display = 'none';
}
