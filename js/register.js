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

    // 先检查邮箱是否已被注册（通过尝试登录来检测）
    const { data: existingUser } = await supabase.rpc('check_email_exists', { p_email: email });
    // 如果 rpc 不存在，用 signInWithPassword 快速验证
    if (existingUser === true) {
      showMessage('register-msg', '该邮箱已被注册，请直接登录或找回密码');
      setButtonLocked(false);
      return;
    }

    // 检查用户名是否重复
    const { data: existingUsername } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (existingUsername) {
      showMessage('register-msg', '该用户名已被使用，请换一个');
      setButtonLocked(false);
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
      setButtonLocked(false);
      return;
    }

    // 注册成功 → profiles 由 handle_new_user 触发器自动创建
    // if (data.user) {
    //   const displayName = username || email.split('@')[0];
    //   await supabase.from('profiles').insert({
    //     id: data.user.id,
    //     username: displayName
    //   });
    // }

    // 注册成功
    if (data.user && !data.session) {
      // 需要邮箱验证
      showMessage('register-msg', '注册成功！请查收邮箱完成验证，然后登录。', 'success');
      setButtonLocked(false);
    } else {
      // 自动确认，直接跳转
      window.location.href = 'index.html';
    }
  });
});
