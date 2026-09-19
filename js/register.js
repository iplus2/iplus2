// ============================================
// 注册页面逻辑
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');
  const submitBtn = document.getElementById('btn-register-submit');

  /** 锁定/解锁提交按钮 */
  function setButtonLocked(locked) {
    submitBtn.disabled = locked;
    submitBtn.textContent = locked ? '注册中...' : '注 册';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage('register-msg');

    const email = document.getElementById('email').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // 前端校验
    if (!email || !username || !password) {
      showMessage('register-msg', '请填写所有字段');
      return;
    }
    if (username.length < 2) {
      showMessage('register-msg', '用户名至少2个字符');
      return;
    }
    if (password.length < 6) {
      showMessage('register-msg', '密码至少6个字符');
      return;
    }
    if (password !== confirmPassword) {
      showMessage('register-msg', '两次密码不一致');
      return;
    }

    // 锁定按钮防重复提交
    setButtonLocked(true);

    try {
      // 只查询用户名是否已用，不读取其他用户资料或检查邮箱是否存在。
      const { data: taken, error: checkError } = await supabase.rpc('is_username_taken', { p_username: username });
      if (checkError) throw checkError;
      if (taken) {
        showMessage('register-msg', '该用户名已被使用，请换一个');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } }
      });
      if (error) throw error;

      // 是否发送验证邮件由 Auth 决定，不据此确认邮箱是否已有账号。
      if (data.user && !data.session) {
        showMessage('register-msg', '请查看邮箱中的验证信息；若已有账号，可直接登录。', 'success');
      } else if (data.session) {
        window.location.href = 'index.html';
      } else {
        showMessage('register-msg', '注册尚未确认，请稍后重试');
      }
    } catch (error) {
      showMessage('register-msg', `注册失败：${error.message || '请稍后重试'}`);
    } finally {
      setButtonLocked(false);
    }
  });
});
