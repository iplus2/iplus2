// ============================================
// 注册页面逻辑
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');

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

    // 注册
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });

    if (error) {
      showMessage('register-msg', `注册失败: ${error.message}`);
      return;
    }

    // 注册成功 → 创建 profiles 记录（绕过触发器问题）
    if (data.user) {
      const displayName = username || email.split('@')[0];
      await supabase.from('profiles').insert({
        id: data.user.id,
        username: displayName
      });
    }

    // 注册成功
    if (data.user && !data.session) {
      // 需要邮箱验证
      showMessage('register-msg', '注册成功！请查收邮箱完成验证，然后登录。', 'success');
    } else {
      // 自动确认，直接跳转
      window.location.href = 'gallery.html';
    }
  });
});
