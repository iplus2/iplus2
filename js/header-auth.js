// ============================================
// 顶部导航认证逻辑（所有页面共用）
// ============================================

function renderSiteHeader() {
  const headerRoot = document.getElementById('site-header');
  if (!headerRoot) return false;

  headerRoot.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <h1 class="header-logo"><a href="index.html">iplus2的空间</a></h1>
        <div class="header-actions">
          <div id="header-auth-area" class="header-auth-area">
            <button id="header-auth-btn" type="button" class="btn btn-primary btn-sm">登录 / 注册</button>
          </div>
          <div id="header-user-dropdown" class="header-user-dropdown" style="display:none;">
            <button id="header-user-trigger" type="button" class="user-trigger" aria-expanded="false" aria-haspopup="true">
              <span id="header-user-name" class="header-user-name">用户名</span>
              <span class="dropdown-arrow" aria-hidden="true">▼</span>
            </button>
            <div id="dropdown-menu" class="dropdown-menu">
              <div id="dropdown-user-name" class="dropdown-user-name">用户名</div>
              <button id="btn-user-center" type="button" class="dropdown-item">用户中心</button>
              <button id="btn-logout" type="button" class="dropdown-item dropdown-item-danger">退出登录</button>
            </div>
          </div>
        </div>
      </div>
    </header>
  `;
  return true;
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!renderSiteHeader()) {
    console.warn('Missing #site-header mount point');
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const authArea = document.getElementById('header-auth-area');
  const authButton = document.getElementById('header-auth-btn');
  const userDropdown = document.getElementById('header-user-dropdown');
  const userTrigger = document.getElementById('header-user-trigger');
  const headerUserName = document.getElementById('header-user-name');
  const dropdownUserName = document.getElementById('dropdown-user-name');

  authButton.addEventListener('click', () => {
    window.location.href = 'login.html';
  });

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

    // 展开/收起下拉菜单
    userTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('dropdown-menu');
      const isOpen = menu.style.display === 'block';
      menu.style.display = isOpen ? 'none' : 'block';
      userTrigger.setAttribute('aria-expanded', String(!isOpen));
    });

    // 点击空白关闭菜单
    document.addEventListener('click', () => {
      const menu = document.getElementById('dropdown-menu');
      if (menu) {
        menu.style.display = 'none';
        userTrigger.setAttribute('aria-expanded', 'false');
      }
    });

    // 用户中心
    const btnUserCenter = document.getElementById('btn-user-center');
    if (btnUserCenter) {
      btnUserCenter.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('dropdown-menu').style.display = 'none';
        userTrigger.setAttribute('aria-expanded', 'false');
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
