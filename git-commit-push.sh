#!/bin/bash
cd /mnt/c/Users/David/Desktop/cf-dev-workspace

# 清理临时文件
rm -f git-status.sh

# 添加所有变更
git add -A

# 提交
git commit -m "feat: 新增主页、用户菜单、注册校验、修改密码功能

- 新增 home.html 主页（未登录显示登录按钮，已登录显示用户名下拉菜单）
- 顶部导航改为所有页面共用样式（.site-header）
- 新增 header-auth.js 统一处理所有页面的登录状态
- 注册增加邮箱/用户名重复检测
- 新增 change-password.html 修改密码页面
- 登录页增加 30 天免登录选项
- gallery.html 接入共用 header-auth.js
- 响应式布局优化"

# 推送
eval $(ssh-agent -s)
ssh-add ~/.ssh/id_ed25519 2>/dev/null
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no" \
  git push 2>&1