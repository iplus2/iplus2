// ============================================
// 图片画廊页面逻辑
// ============================================

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 检查登录状态
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;

  // 根据登录状态控制上传区域的显示
  const uploadSection = document.querySelector('.upload-section');
  if (currentUser) {
    // 已登录：显示上传功能
    uploadSection.style.display = '';
    initUpload();
  } else {
    // 未登录：隐藏上传区域，显示提示
    uploadSection.innerHTML = '<p class="message" style="text-align:center;color:#666;">🔒 登录后可以上传图片 <a href="login.html">去登录</a></p>';
  }

  // 无论是否登录，都加载图片列表
  loadImages();

  // 初始化上传功能（仅已登录时调用）
  function initUpload() {
    if (!currentUser) return;

    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const uploadMsg = 'upload-msg';

    // 点击上传区域触发文件选择
    uploadArea.addEventListener('click', () => fileInput.click());

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('drag-over');
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) handleUpload(files[0]);
    });

    // 选择文件后上传
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        handleUpload(fileInput.files[0]);
        fileInput.value = ''; // 重置，允许重复上传同一文件
      }
    });

    // 上传处理
    async function handleUpload(file) {
      // 校验文件类型
      if (!file.type.startsWith('image/')) {
        showMessage(uploadMsg, '只能上传图片文件');
        return;
      }
      // 校验文件大小（Supabase 免费版限制 50MB）
      if (file.size > 50 * 1024 * 1024) {
        showMessage(uploadMsg, '文件大小不能超过 50MB');
        return;
      }

      showMessage(uploadMsg, '上传中...', 'info');

      // 生成唯一文件名: userId_timestamp_originalName
      const ext = file.name.split('.').pop();
      const fileName = `${currentUser.id}_${Date.now()}.${ext}`;
      const filePath = `${currentUser.id}/${fileName}`;

      // 上传到 Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) {
        showMessage(uploadMsg, `上传失败: ${uploadError.message}`);
        return;
      }

      // 获取公开 URL
      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      // 写入 images 表
      const { error: dbError } = await supabase
        .from('images')
        .insert({
          user_id: currentUser.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          storage_path: filePath
        });

      if (dbError) {
        showMessage(uploadMsg, `保存记录失败: ${dbError.message}`);
        return;
      }

      showMessage(uploadMsg, '上传成功！', 'success');
      loadImages(); // 刷新画廊
    }
  }

  // 加载所有图片
  async function loadImages() {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '<p class="loading">加载中...</p>';

    // 先查所有图片
    const { data: images, error } = await supabase
      .from('images')
      .select('id, file_name, file_url, user_id, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      gallery.innerHTML = `<p class="empty">加载失败: ${error.message}</p>`;
      return;
    }

    if (!images || images.length === 0) {
      gallery.innerHTML = '<p class="empty">还没有图片，快来上传第一张吧！</p>';
      return;
    }

    // 再查所有相关用户信息（根据 user_id 列表去重）
    const userIds = [...new Set(images.map(img => img.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p.username; });

    gallery.innerHTML = images.map(img => `
      <div class="image-card">
        <img src="${img.file_url}" alt="${img.file_name}" loading="lazy" />
        <div class="image-info">
          <span class="image-name">${img.file_name}</span>
          <span class="image-user">${profileMap[img.user_id] || '未知用户'}</span>
          <span class="image-time">${new Date(img.created_at).toLocaleString('zh-CN')}</span>
        </div>
      </div>
    `).join('');
  }
});