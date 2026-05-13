// ============================================
// 登录页面逻辑
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage('login-msg');

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showMessage('login-msg', '请填写邮箱和密码');
      return;
    }

    const rememberMe = document.getElementById('remember-me')?.checked;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        // 记住我：设置较长的 cookie 过期时间（30天）
        ...(rememberMe ? { persistSession: true } : {})
      }
    });
      email,
      password
    });

    if (error) {
      showMessage('login-msg', error.message === 'Invalid login credentials'
        ? '邮箱或密码错误'
        : `登录失败: ${error.message}`);
      return;
    }

    // 登录成功，跳转到图片画廊
    window.location.href = 'gallery.html';
  });
});
