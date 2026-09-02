// ============================================
// VIP / SVIP 会员功能
// ============================================

/**
 * 获取当前用户的会员信息
 * @returns {Promise<{userType: string|null, upgradedAt: string|null}>}
 */
async function getMemberInfo() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { userType: null, upgradedAt: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type, upgraded_at')
    .eq('id', session.user.id)
    .single();

  return {
    userType: profile?.user_type || null,
    upgradedAt: profile?.upgraded_at || null
  };
}

/**
 * 获取会员显示文本
 */
function getMemberBadgeHTML(userType) {
  if (userType === 'svip') {
    return '<span class="member-badge member-svip" title="SVIP 会员">SVIP</span>';
  } else if (userType === 'vip') {
    return '<span class="member-badge member-vip" title="VIP 会员">VIP</span>';
  }
  return '';
}

/**
 * 激活邀请码
 * @param {string} code - 邀请码
 * @returns {Promise<{success: boolean, type?: string, message: string}>}
 */
async function activateCode(code) {
  const { data, error } = await supabase.rpc('activate_vip_code', {
    p_code: code.trim()
  });

  if (error) {
    return { success: false, message: `系统错误: ${error.message}` };
  }

  return data;
}

/**
 * 在用户下拉菜单中显示会员徽章
 */
function updateMemberBadgeInDropdown(userType) {
  const userNameEl = document.getElementById('header-user-name');
  if (!userNameEl) return;

  // 移除旧 badge
  const oldBadge = userNameEl.querySelector('.member-badge');
  if (oldBadge) oldBadge.remove();

  // 仅 VIP/SVIP 显示徽章
  if (userType === 'vip' || userType === 'svip') {
    const badge = document.createElement('span');
    badge.className = `member-badge ${userType === 'svip' ? 'member-svip' : 'member-vip'}`;
    badge.textContent = userType === 'svip' ? 'SVIP' : 'VIP';
    badge.style.marginLeft = '6px';
    userNameEl.appendChild(badge);
  }
}

/**
 * 在用户中心页面显示会员信息
 */
function renderMemberSection(container, userType, upgradedAt) {
  if (userType === 'vip') {
    container.innerHTML = `
      <div class="member-info-box member-info-vip">
        <div class="member-info-icon">🌟</div>
        <div class="member-info-text">
          <div class="member-info-title">VIP 会员</div>
          <div class="member-info-desc">已享受 VIP 会员权益</div>
          <div class="member-info-date">${upgradedAt ? '激活时间: ' + formatDate(upgradedAt) : ''}</div>
        </div>
      </div>
    `;
  } else if (userType === 'svip') {
    container.innerHTML = `
      <div class="member-info-box member-info-svip">
        <div class="member-info-icon">👑</div>
        <div class="member-info-text">
          <div class="member-info-title">SVIP 会员</div>
          <div class="member-info-desc">已享受 SVIP 高级会员权益</div>
          <div class="member-info-date">${upgradedAt ? '激活时间: ' + formatDate(upgradedAt) : ''}</div>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="member-info-box member-info-normal">
        <div class="member-info-icon">🤝</div>
        <div class="member-info-text">
          <div class="member-info-title">普通用户</div>
          <div class="member-info-desc">激活会员以获得更多权益</div>
        </div>
      </div>
      <div class="member-activate-section">
        <h3>激活会员</h3>
        <p class="member-activate-desc">输入邀请码激活 VIP 或 SVIP 会员</p>
        <div class="member-activate-form">
          <input type="text" id="invite-code-input" class="member-code-input" placeholder="请输入邀请码" maxlength="32" />
          <button id="btn-activate-code" class="btn btn-primary">激活</button>
        </div>
        <div id="member-activate-message" class="message" style="margin-top: 12px;"></div>
      </div>
    `;
  }
}

/**
 * 格式化日期
 */
function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
