// ============================================
// 用户中心页面逻辑
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const user = session.user;
  document.getElementById('user-email').textContent = user.email;

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single();

  if (profile) {
    document.getElementById('user-username').textContent = profile.username;
  }

  const { userType, upgradedAt } = await getMemberInfo();
  const memberStatus = document.getElementById('member-status');
  renderMemberSection(memberStatus, userType, upgradedAt);

  if (userType !== 'vip' && userType !== 'svip') {
    bindCodeActivation(memberStatus);
  }

  document.getElementById('btn-change-name').addEventListener('click', async () => {
    const currentName = profile?.username || user.email.split('@')[0];
    const newName = prompt('请输入新用户名：', currentName)?.trim();
    if (!newName || newName === currentName) return;

    const { data: conflict } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', newName)
      .neq('id', user.id)
      .maybeSingle();

    if (conflict) {
      alert('该用户名已被使用，请换一个');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ username: newName })
      .eq('id', user.id);

    if (error) {
      alert(`更新失败: ${error.message}`);
      return;
    }

    await supabase.auth.updateUser({ data: { username: newName } });
    document.getElementById('user-username').textContent = newName;
    alert('用户名已更新！');
  });

  document.getElementById('btn-change-pwd').addEventListener('click', () => {
    window.location.href = 'change-password.html';
  });
});

function bindCodeActivation(memberStatus) {
  const btnActivate = document.getElementById('btn-activate-code');
  const codeInput = document.getElementById('invite-code-input');
  const msgEl = document.getElementById('member-activate-message');
  if (!btnActivate || !codeInput || !msgEl) return;

  btnActivate.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (!code) {
      showActivationMessage(msgEl, '请输入邀请码', 'error');
      return;
    }

    btnActivate.disabled = true;
    btnActivate.textContent = '激活中...';
    msgEl.style.display = 'none';

    const result = await activateCode(code);
    showActivationMessage(msgEl, result.message, result.success ? 'success' : 'error');

    if (result.success) {
      const updated = await getMemberInfo();
      renderMemberSection(memberStatus, updated.userType, updated.upgradedAt);
    } else {
      btnActivate.disabled = false;
      btnActivate.textContent = '激活';
    }
  });

  codeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') btnActivate.click();
  });
}

function showActivationMessage(element, message, type) {
  element.className = `message ${type}`;
  element.textContent = message;
  element.style.display = 'block';
}
