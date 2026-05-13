// ============================================
// 主页逻辑
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  // 初始化——加载用户状态并渲染头部
  await initHeader();

  // 如果已登录，更新用户信息区域
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const user = session.user;
    const username = user.user_metadata?.username || user.email.split('@')[0];
    document.getElementById('home-welcome').textContent = `欢迎回来，${username}`;
    document.getElementById('home-description').textContent = '你可以浏览其他用户上传的图片，也可以上传自己的作品。';
  } else {
    document.getElementById('home-welcome').textContent = '欢迎来到图片画廊';
    document.getElementById('home-description').textContent = '登录后可以上传和管理你的图片。';
  }
});

/**
 * 初始化头部：设置用户名、绑定按钮事件
 */
async function initHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  const authBtn = document.getElementById('header-auth-btn');
  const authBtnText = document.getElementById('header-auth-btn-text');
  const userDropdown = document.getElementById('header-user-dropdown');
  const headerUserName = document.getElementById('header-user-name');
  const userDropdownName = document.getElementById('dropdown-user-name');

  if (session) {
    // 已登录
    const user = session.user;
    const username = user.user_metadata?.username || user.email.split('@')[0];

    document.getElementById('header-auth-area').style.display = 'none';
    userDropdown.style.display = 'flex';
    headerUserName.textContent = username;
    userDropdownName.textContent = username;

    // 点击用户名 → 展开/收起下拉菜单
    userDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('dropdown-menu');
      const isVisible = menu.style.display === 'block';
      menu.style.display = isVisible ? 'none' : 'block';
    });

    // 点击空白处关闭菜单
    document.addEventListener('click', () => {
      document.getElementById('dropdown-menu').style.display = 'none';
    });

    // 修改用户名
    document.getElementById('btn-rename').addEventListener('click', async () => {
      const newName = prompt('请输入新用户名：', username);
      if (!newName || newName.trim() === username) return;

      // 检查用户名是否已被占用
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
        userDropdownName.textContent = newName.trim();
        document.getElementById('dropdown-menu').style.display = 'none';
        alert('用户名已更新！');
      }
    });

    // 修改密码
    document.getElementById('btn-change-pwd').addEventListener('click', () => {
      document.getElementById('dropdown-menu').style.display = 'none';
      window.location.href = 'change-password.html';
    });

    // 退出登录
    document.getElementById('btn-logout').addEventListener('click', async (e) => {
      e.preventDefault();
      await supabase.auth.signOut();
      window.location.href = 'home.html';
    });

  } else {
    // 未登录
    document.getElementById('header-auth-area').style.display = 'flex';
    userDropdown.style.display = 'none';
  }
}