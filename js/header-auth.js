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

    // 从 profiles 表读取用户名 + 会员类型 + 管理员标识（权威来源），fallback 到 auth metadata → 邮箱前缀
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, user_type, is_admin')
      .eq('id', user.id)
      .single();

    let username = profile?.username
      || user.user_metadata?.username
      || user.email.split('@')[0];

    // 同步 auth metadata，避免下次登录仍 fallback 到邮箱前缀
    if (!user.user_metadata?.username && profile?.username) {
      await supabase.auth.updateUser({ data: { username: profile.username } });
    }

    authArea.style.display = 'none';
    userDropdown.style.display = 'flex';
    headerUserName.textContent = username;
    if (dropdownUserName) dropdownUserName.textContent = username;

    // 显示会员徽章（如有 VIP/SVIP）
    if (profile?.user_type) {
      if (typeof updateMemberBadgeInDropdown === 'function') {
        updateMemberBadgeInDropdown(profile.user_type);
      }
    }

    // SVIP 用户或管理员：添加「专属空间」入口
    const canAccessPrivate = profile?.user_type === 'svip' || profile?.is_admin === true;
    if (canAccessPrivate) {
      const menu = document.getElementById('dropdown-menu');
      if (menu) {
        const divider = document.createElement('div');
        divider.className = 'dropdown-divider';
        divider.style.cssText = 'height:1px;background:#eee;margin:4px 0;';
        const privateLink = document.createElement('a');
        privateLink.href = '#';
        privateLink.className = 'dropdown-item';
        privateLink.textContent = '💎 专属空间';
        privateLink.addEventListener('click', (e) => {
          e.preventDefault();
          document.getElementById('dropdown-menu').style.display = 'none';
          window.location.href = 'svip-private.html';
        });
        menu.appendChild(divider);
        menu.appendChild(privateLink);
      }
    }

    // 展开/收起下拉菜单
    userDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('dropdown-menu');
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });

    // 点击空白关闭菜单
    document.addEventListener('click', () => {
      const menu = document.getElementById('dropdown-menu');
      if (menu) menu.style.display = 'none';
    });

    // 用户中心
    const btnUserCenter = document.getElementById('btn-user-center');
    if (btnUserCenter) {
      btnUserCenter.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('dropdown-menu').style.display = 'none';
        window.location.href = 'user-profile.html';
      });
    }

    // 退出登录
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async (e) => {
        e.preventDefault();
        await supabase.auth.signOut();
        window.location.href = 'index.html';
      });
    }

  } else {
    authArea.style.display = 'flex';
    userDropdown.style.display = 'none';
  }
});