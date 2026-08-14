// ============================================
// 主页逻辑
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  // 确保 DOM 元素存在
  const homeWelcome = document.getElementById('home-welcome');
  const homeDescription = document.getElementById('home-description');
  
  if (!homeWelcome || !homeDescription) {
    console.warn('Missing home elements');
    return;
  }

  // 异步检查登录状态，但不阻塞页面显示
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      const user = session.user;
      const username = user.user_metadata?.username || user.email.split('@')[0];
      homeWelcome.textContent = `欢迎回来，${username}`;
      homeDescription.textContent = '你可以浏览其他用户上传的图片，也可以上传自己的作品。';

      // 显示专属按钮
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_type, is_admin')
          .eq('id', user.id)
          .single();

        // VIP/SVIP 显示「个人空间」
        if (profile?.user_type === 'vip' || profile?.user_type === 'svip') {
          const btnWrap = document.getElementById('home-contact-btn-wrap');
          if (btnWrap) btnWrap.style.display = 'block';
        }

        // 管理员显示「站主工作台」
        if (profile?.is_admin === true) {
          const adminBtnWrap = document.getElementById('home-admin-btn-wrap');
          if (adminBtnWrap) adminBtnWrap.style.display = 'block';

          // 管理员也能访问个人空间（把按钮文字改成工作台链接）
          const contactBtn = document.getElementById('home-contact-btn');
          if (contactBtn) {
            contactBtn.textContent = '🌐 个人空间';
            contactBtn.href = 'contact.html';
          }
          const contactWrap = document.getElementById('home-contact-btn-wrap');
          if (contactWrap) contactWrap.style.display = 'block';
        }
      } catch (e) {
        console.warn('Button check failed:', e);
      }
    } else {
      homeWelcome.textContent = '欢迎来到iplus2的空间';
      homeDescription.textContent = '登录后可上传图片、随机抽取晚餐';
    }
  } catch (e) {
    console.error('Session check failed:', e);
    // 保持默认显示，不阻塞页面
  }
});

/**
 * 头部初始化（由 header-auth.js 处理）
 * 这里不需要额外逻辑，只要确保元素存在即可
 */
// 注意：这里的逻辑已移至 header-auth.js 统一处理
// home.js 只处理主页特定的欢迎语更新