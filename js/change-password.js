// ============================================
// 修改密码页面逻辑
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  const form = document.getElementById('change-pwd-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('pwd-msg');
    msgEl.style.display = 'none';

    const newPwd = document.getElementById('new-password').value;
    const confirmPwd = document.getElementById('confirm-password').value;

    if (!newPwd || newPwd.length < 6) {
      showMsg('pwd-msg', '密码至少6位', 'error');
      return;
    }
    if (newPwd !== confirmPwd) {
      showMsg('pwd-msg', '两次密码不一致', 'error');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) {
      showMsg('pwd-msg', `修改失败: ${error.message}`, 'error');
    } else {
      showMsg('pwd-msg', '密码修改成功！即将返回...', 'success');
      setTimeout(() => { window.location.href = 'gallery.html'; }, 1500);
    }
  });
});

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `message ${type}`;
  el.style.display = 'block';
}