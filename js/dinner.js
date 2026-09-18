// 按上海时间选择餐别，首页和随机推荐页共用。
const mealHourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  hourCycle: 'h23'
});

const mealOptions = [
  {
    name: '早饭', start: 5, end: 11,
    foods: ['豆浆油条', '小笼包', '煎饼果子', '鸡蛋灌饼', '皮蛋瘦肉粥', '馄饨',
      '肠粉', '饭团', '三明治', '烧麦', '鸡蛋吐司']
  },
  {
    name: '午饭', start: 11, end: 14,
    foods: ['宫保鸡丁盖饭', '番茄牛腩饭', '黄焖鸡米饭', '牛肉拉面', '饺子', '海南鸡饭',
      '咖喱鸡饭', '鱼香肉丝盖饭', '猪脚饭', '麻婆豆腐饭', '叉烧饭', '鸡腿便当']
  },
  {
    name: '下午茶', start: 14, end: 17,
    foods: ['蛋挞配红茶', '芝士蛋糕', '水果酸奶', '华夫饼', '可颂配拿铁', '抹茶卷',
      '红豆双皮奶', '芋圆', '杨枝甘露', '司康配奶茶', '舒芙蕾', '水果拼盘']
  },
  {
    name: '晚饭', start: 17, end: 21,
    foods: ['火锅', '烤鱼', '酸菜鱼', '石锅拌饭', '卤肉饭', '寿司',
      '意大利面', '过桥米线', '麻辣香锅', '砂锅炖菜', '清蒸鱼套餐', '铁板牛肉']
  },
  {
    name: '夜宵', start: 21, end: 5,
    foods: ['烧烤', '串串', '麻辣烫', '小龙虾', '炸鸡', '酸辣粉',
      '螺蛳粉', '炒河粉', '烤冷面', '关东煮', '砂锅粥', '烤红薯']
  }
];

function getCurrentMeal(date = new Date()) {
  const hour = Number(mealHourFormatter.format(date));
  return mealOptions.find(meal => hour >= meal.start && hour < meal.end)
    || mealOptions[4];
}

function watchCurrentMeal(callback) {
  const refresh = () => callback(getCurrentMeal());
  refresh();
  setInterval(refresh, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  window.addEventListener('focus', refresh);
}

// ============================================
// 分时段餐食随机选择页面逻辑
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const mealLink = document.getElementById('home-meal-link');
  if (mealLink) {
    watchCurrentMeal(meal => {
      mealLink.textContent = `🍽️ ${meal.name}吃啥？`;
    });
  }

  const btnSpin = document.getElementById('btn-spin');
  const resultBox = document.getElementById('result-box');
  if (!btnSpin || !resultBox) return;
  let spinning = false;
  let currentMeal = null;

  function updateMeal(meal) {
    if (currentMeal === meal) return;
    currentMeal = meal;
    document.title = `${meal.name}吃什么`;
    document.getElementById('meal-title').textContent = `🍽️ ${meal.name}吃什么？`;
    document.getElementById('meal-description').textContent = `现在是${meal.name}时间（上海时间），帮你选点好吃的！`;
    if (!spinning) {
      resultBox.style.display = 'none';
      btnSpin.textContent = '🎲 帮我选！';
    }
  }

  watchCurrentMeal(updateMeal);

  btnSpin.addEventListener('click', () => {
    if (spinning) return;

    updateMeal(getCurrentMeal());
    spinning = true;
    btnSpin.disabled = true;
    resultBox.style.display = 'block';
    resultBox.style.color = '#666';
    resultBox.textContent = '🤔 思考中...';

    let count = 0;
    const maxCount = 15 + Math.floor(Math.random() * 10);
    const interval = setInterval(() => {
      updateMeal(getCurrentMeal());
      const foods = currentMeal.foods;
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
        btnSpin.disabled = false;
        btnSpin.textContent = '🎲 再选一次！';
      }
    }, 80);
  });
});
