// 按上海时间选择餐别，首页和随机推荐页共用。
const mealHourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  hourCycle: 'h23'
});

const mealOptions = [
  {
    name: '早饭', start: 4, end: 11,
    foods: ['豆浆油条', '小笼包', '煎饼果子', '鸡蛋灌饼', '粥', '馄饨',
      '肠粉', '饭团', '三明治', '生煎', '吐司']
  },
  {
    name: '午饭', start: 11, end: 14,
    foods: ['曹操盖饭', '披萨', '兰州牛肉面', '饺子', '麻辣烫', '汉堡',
      '咖喱鸡饭', '猪脚饭', '越南米粉', '叉烧饭']
  },
  {
    name: '下午茶', start: 14, end: 17,
    foods: ['蛋挞', '芝士蛋糕', '酸奶捞', '千层蛋糕', '瑞士卷',
      '芋圆', '杨枝甘露', '咸法老奶茶', '舒芙蕾']
  },
  {
    name: '晚饭', start: 17, end: 21,
    foods: ['火锅', '烤鱼', '酸菜鱼', '石锅拌饭', '卤肉饭', '寿司',
      '意大利面', '过桥米线', '砂锅炖菜', '铁板烧', '烤肉', '日式拉面']
  },
  {
    name: '夜宵', start: 21, end: 4,
    foods: ['串串', '麻辣烫', '小龙虾', '炸鸡', '酸辣粉',
      '炒河粉', '关东煮', '焦糖烤apple', '蛋糕', '大福']
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
