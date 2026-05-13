// ============================================
// 顶部导航认证逻辑（所有页面共用）
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const authArea = document.getElementById('header-auth-area');
  const userDropdown = document.getElementById('header-user-dropdown');
  const headerUserName = document.getElementById('header-user-name');
  const dropdownUserName = document.getElementById('dropdown-user-name');

  if (session) {
    const user = session.user;
    const username = user.user_metadata?.username || user.email.split('@')[0];

    authArea.style.display = 'none';
    userDropdown.style.display = 'flex';
    headerUserName.textContent = username;
    dropdownUserName.textContent = username;

    // 展开/收起下拉菜单
    userDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('dropdown-menu');
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });

    // 点击空白关闭菜单
    document.addEventListener('click', () => {
      document.getElementById('dropdown-menu').style.display = 'none';
    });

    // 修改用户名
    document.getElementById('btn-rename').addEventListener('click', async () => {
      const menu = document.getElementById('dropdown-menu');
      menu.style.display = 'none';

      const newName = prompt('请输入新用户名：', username);
      if (!newName || newName.trim() === username || !newName.trim()) return;

      const { data: conflict } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', newName.trim())
        .neq('id', session.user.id)
        .maybeSingle();

      if (conflict) {
        alert('该用户名已被使用，请换一个');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ username: newName.trim() })
        .eq('id', session.user.id);

      if (error) {
        alert(`更新失败: ${error.message}`);
      } else {
        await supabase.auth.updateUser({ data: { username: newName.trim() } });
        headerUserName.textContent = newName.trim();
        dropdownUserName.textContent = newName.trim();
        alert('用户名已更新！');
      }
    });

    // 修改密码
    document.getElementById('btn-change-pwd').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('dropdown-menu').style.display = 'none';
      window.location.href = 'change-password.html';
    });

    // 退出登录
    document.getElementById('btn-logout').addEventListener('click', async (e) => {
      e.preventDefault();
      await supabase.auth.signOut();
      // 跳回首页
      window.location.href = 'home.html';
    });

  } else {
    authArea.style.display = 'flex';
    userDropdown.style.display = 'none';
  }
});