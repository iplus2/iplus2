// ============================================
// 晚餐随机选择页面逻辑
// ============================================

const foods = [
  '烧烤', '串串', '麻辣烫', '石锅拌饭',
  '卤肉饭', '炸鸡', '寿司',
  '沙拉', '酸辣粉', '螺蛳粉',
  '小龙虾', '烤鱼', 'KFC',
  '过桥米线', '意大利面', '酸菜鱼'
];

document.addEventListener('DOMContentLoaded', () => {
  const btnSpin = document.getElementById('btn-spin');
  const resultBox = document.getElementById('result-box');
  let spinning = false;

  btnSpin.addEventListener('click', () => {
    if (spinning) return;

    spinning = true;
    resultBox.style.display = 'block';
    resultBox.style.color = '#666';
    resultBox.textContent = '🤔 思考中...';

    let count = 0;
    const maxCount = 15 + Math.floor(Math.random() * 10);
    const interval = setInterval(() => {
      const randomFood = foods[Math.floor(Math.random() * foods.length)];
      resultBox.textContent = randomFood;
      count++;

      if (count >= maxCount) {
        clearInterval(interval);
        const finalChoice = foods[Math.floor(Math.random() * foods.length)];
        resultBox.textContent = finalChoice;
        resultBox.className = 'message';
        resultBox.style.background = 'var(--success-bg, #d4edda)';
        resultBox.style.color = 'var(--success, #155724)';
        spinning = false;
        btnSpin.textContent = '🎲 再选一次！';
      }
    }, 80);
  });
});
