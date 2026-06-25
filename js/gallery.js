// ============================================
// 复平面页面逻辑
// ============================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
let currentUser = null;
let selectedFile = null;

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;

  // 根据登录状态 + 会员身份控制发布区
  const compose = document.getElementById('post-compose');
  const composeTip = document.getElementById('post-compose-tip');
  const composeVipTip = document.getElementById('post-compose-vip-tip');

  if (!currentUser) {
    compose.style.display = 'none';
    composeTip.style.display = '';
    if (composeVipTip) composeVipTip.style.display = 'none';
  } else {
    // 检查会员身份
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', currentUser.id)
      .single();

    const userType = profile?.user_type;
    if (userType === 'vip' || userType === 'svip') {
      compose.style.display = '';
      composeTip.style.display = 'none';
      if (composeVipTip) composeVipTip.style.display = 'none';
    } else {
      compose.style.display = 'none';
      composeTip.style.display = 'none';
      if (composeVipTip) composeVipTip.style.display = '';
    }
  }

  // 初始化发布功能
  initCompose();
  // 加载帖子列表
  loadPosts();

  // ============================================
  // 发布功能
  // ============================================
  function initCompose() {
    const fileInput = document.getElementById('file-input');
    const attachArea = document.getElementById('attach-area');
    const attachPreview = document.getElementById('attach-preview');
    const attachPlaceholder = document.getElementById('attach-placeholder');
    const attachName = document.getElementById('attach-name');
    const attachRemove = document.getElementById('attach-remove');
    const btnPost = document.getElementById('btn-post');

    // 点击附件区触发文件选择
    attachArea.addEventListener('click', (e) => {
      if (e.target === attachRemove || e.target === attachRemove.parentElement) return;
      fileInput.click();
    });

    // 选择文件
    fileInput.addEventListener('change', () => {
      if (!fileInput.files.length) return;
      handleFileSelect(fileInput.files[0]);
      fileInput.value = '';
    });

    function handleFileSelect(file) {
      if (file.size > MAX_FILE_SIZE) {
        showMsg('compose-msg', `文件超过 10MB 限制(当前 ${(file.size / 1024 / 1024).toFixed(1)}MB)`, 'error');
        return;
      }
      selectedFile = file;
      attachName.textContent = file.name + ` (${(file.size / 1024).toFixed(0)}KB)`;
      attachPreview.style.display = '';
      attachPlaceholder.style.display = 'none';
    }

    // 移除已选附件
    attachRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFile = null;
      attachPreview.style.display = 'none';
      attachPlaceholder.style.display = '';
    });

    // 发布
    btnPost.addEventListener('click', async () => {
      const content = document.getElementById('post-content').value.trim();

      if (!content && !selectedFile) {
        showMsg('compose-msg', '请输入内容或添加附件', 'error');
        return;
      }

      btnPost.disabled = true;
      btnPost.textContent = '发布中...';
      showMsg('compose-msg', '', '');

      let fileUrl = null, fileName = null, fileType = null, storagePath = null;

      // 上传附件(如果有)
      if (selectedFile) {
        const ext = selectedFile.name.split('.').pop();
        const storedName = `${currentUser.id}_${Date.now()}.${ext}`;
        storagePath = `${currentUser.id}/${storedName}`;

        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(storagePath, selectedFile);

        if (uploadError) {
          showMsg('compose-msg', `上传失败: ${uploadError.message}`, 'error');
          btnPost.disabled = false;
          btnPost.textContent = '发布';
          return;
        }

        const { data: urlData } = supabase.storage
          .from('attachments')
          .getPublicUrl(storagePath);

        fileUrl = urlData.publicUrl;
        fileName = selectedFile.name;
        fileType = selectedFile.type;
      }

      // 写入数据库
      const { error: dbError } = await supabase
        .from('posts')
        .insert({
          user_id: currentUser.id,
          content: content,
          file_name: fileName,
          file_url: fileUrl,
          file_type: fileType,
          storage_path: storagePath
        });

      if (dbError) {
        showMsg('compose-msg', `发布失败: ${dbError.message}`, 'error');
        btnPost.disabled = false;
        btnPost.textContent = '发布';
        return;
      }

      // 重置表单
      document.getElementById('post-content').value = '';
      selectedFile = null;
      attachPreview.style.display = 'none';
      attachPlaceholder.style.display = '';
      showMsg('compose-msg', '发布成功!', 'success');
      btnPost.disabled = false;
      btnPost.textContent = '发布';
      loadPosts();
    });
  }

  // ============================================
  // 加载帖子列表
  // ============================================
  async function loadPosts() {
    const list = document.getElementById('post-list');
    list.innerHTML = '<p class="loading">加载中...</p>';

    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, user_id, content, file_name, file_url, file_type, storage_path, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      list.innerHTML = `<p class="empty">加载失败: ${error.message}</p>`;
      return;
    }

    if (!posts || posts.length === 0) {
      list.innerHTML = '<p class="empty">复平面空空如也,来发布第一条吧!</p>';
      return;
    }

    // 获取用户信息
    const userIds = [...new Set(posts.map(p => p.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p.username; });

    list.innerHTML = posts.map(post => {
      const isOwner = currentUser && post.user_id === currentUser.id;
      const username = profileMap[post.user_id] || '未知用户';
      const time = new Date(post.created_at).toLocaleString('zh-CN');

      let fileHtml = '';
      if (post.file_url) {
        const isImage = post.file_type && post.file_type.startsWith('image/');
        const icon = isImage ? '🖼️' : '📎';
        if (isImage) {
          fileHtml = `<a href="${post.file_url}" target="_blank" class="post-file post-file-img">
            <img src="${post.file_url}" alt="${post.file_name}" />
          </a>`;
        } else {
          fileHtml = `<a href="${post.file_url}" download="${post.file_name}" class="post-file post-file-other">
            ${icon} ${post.file_name}
          </a>`;
        }
      }

      return `
      <div class="post-card">
        <div class="post-header">
          <span class="post-user">${username}</span>
          <span class="post-time">${time}</span>
          ${isOwner ? `<button class="btn-delete-post" onclick="deletePost('${post.id}', ${post.storage_path ? `'${post.storage_path}'` : 'null'}, this)">🗑️</button>` : ''}
        </div>
        ${post.content ? `<div class="post-content">${escapeHtml(post.content)}</div>` : ''}
        ${fileHtml ? `<div class="post-files">${fileHtml}</div>` : ''}
      </div>`;
    }).join('');
  }
});

// ============================================
// 删除帖子
// ============================================
window.deletePost = async function(id, storagePath, btn) {
  if (!confirm('确定要删除这条内容吗？')) return;

  const card = btn.closest('.post-card');
  card.style.opacity = '0.5';
  btn.disabled = true;

  console.log('[deletePost] 开始删除', { id, storagePath });

  // 删除存储文件（如果有）
  if (storagePath && storagePath !== 'null') {
    console.log('[deletePost] 尝试删除 Storage 文件:', storagePath);
    const { data, error: storageError } = await supabase.storage
      .from('attachments')
      .remove([storagePath]);

    console.log('[deletePost] Storage remove 返回:', { data, storageError });

    if (storageError) {
      console.error('[deletePost] Storage 删除失败:', storageError);
      alert(`文件删除失败: ${storageError.message}`);
      card.style.opacity = '';
      btn.disabled = false;
      return;
    }

    if (!data || data.length === 0) {
      console.warn('[deletePost] Storage remove 返回空数组，文件可能不存在:', storagePath);
    } else {
      console.log('[deletePost] Storage 文件删除成功:', data);
    }
  } else {
    console.log('[deletePost] 无附件，跳过 Storage 删除');
  }

  // 删除数据库记录
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', id);

  if (error) {
    alert(`删除失败: ${error.message}`);
    card.style.opacity = '';
    btn.disabled = false;
    return;
  }

  card.remove();
  const list = document.getElementById('post-list');
  if (!list.querySelector('.post-card')) {
    list.innerHTML = '<p class="empty">复平面空空如也,来发布第一条吧!</p>';
  }
};

// ============================================
// 工具函数
// ============================================
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'message';
  if (type) el.classList.add(type);
  el.style.display = text ? '' : 'none';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}