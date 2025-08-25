// 提醒記事本腳本（修正版）

// === 單一資料來源 API（統一使用這兩個） ===
function loadReminders() {
  return JSON.parse(localStorage.getItem('reminders') || '[]');
}
function saveRemindersList(list) {
  localStorage.setItem('reminders', JSON.stringify(list));
}

// === 啟動時資料遷移：date → dueDate、補 notified7d ===
function migrateDataShape() {
  const list = loadReminders();
  let changed = false;
  for (const r of list) {
    if (r.date && !r.dueDate) { r.dueDate = r.date; changed = true; }
    if (typeof r.notified7d !== 'boolean') { r.notified7d = false; changed = true; }
  }
  if (changed) saveRemindersList(list);
}

// === 全域快取（僅作為畫面快照；實際以 load/save 為準） ===
let reminders = loadReminders();

// DOM 元素
const titleInput = document.getElementById('title');
const dateInput = document.getElementById('date');
const contentInput = document.getElementById('content');
const addReminderBtn = document.getElementById('add-reminder');
const remindersContainer = document.getElementById('reminders-container');
const searchInput = document.getElementById('search-input');
const filterSelect = document.getElementById('filter-select');

// === 日期工具 ===
const DAY = 24 * 60 * 60 * 1000;
function toDate(d) {
  const v = typeof d === 'string' ? d : String(d || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, day] = v.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  const dt = new Date(v);
  return isNaN(dt.getTime()) ? new Date() : dt;
}
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
}
function calculateDaysLeft(date, today) {
  const timeDiff = toDate(date) - toDate(today);
  return Math.ceil(timeDiff / DAY);
}
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// === 通知權限 / SW 通知 ===
async function ensureNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}
function notifyNative(title, options) {
  // 優先用 SW（跨平台較穩）；沒 controller 時退化用 window Notification
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      title, options
    });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, options);
  }
}

// === 初始化應用程式 ===
function initApp() {
  // 先做資料遷移，再同步全域快照
  migrateDataShape();
  reminders = loadReminders();

  // 設定今天為最小日期
  const today = new Date();
  const formattedDate = today.toISOString().split('T')[0];
  dateInput.setAttribute('min', formattedDate);

  // 綁定事件
  addReminderBtn.addEventListener('click', addReminder);
  searchInput.addEventListener('input', filterReminders);
  filterSelect.addEventListener('change', filterReminders);

  // 請求通知權限
  ensureNotificationPermission().then((ok) => {
    if (ok) scanAndNotify7Days(); // 立刻掃一次（補發/準時發）
  });

  // 初始渲染
  renderReminders();

  // 每天檢查一次（頁面開著時）
  setInterval(checkUpcomingReminders, DAY);
  // 回前景時再掃一次
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkUpcomingReminders();
      scanAndNotify7Days();
    }
  });
}

// === 新增提醒事項 ===
function addReminder() {
  if (!titleInput.value || !dateInput.value) {
    showAlert('請填寫標題和日期！', 'error');
    return;
  }
  const list = loadReminders();
  const newReminder = {
    id: Date.now(),
    title: titleInput.value,
    dueDate: dateInput.value,     // 統一使用 dueDate
    content: contentInput.value,
    createdAt: new Date().toISOString(),
    notified7d: false             // 7天前提醒旗標
  };
  list.push(newReminder);
  saveRemindersList(list);
  reminders = list;               // 同步全域快照
  renderReminders();

  // 清空表單
  titleInput.value = '';
  dateInput.value = '';
  contentInput.value = '';

  showAlert('提醒事項已新增！', 'success');

  // 立即檢查是否需要發「前7天」通知
  scanAndNotify7Days();
}

// === 刪除提醒事項 ===
function deleteReminder(id) {
  if (!confirm('確定要刪除這個提醒事項嗎？')) return;
  const list = loadReminders().filter(r => r.id !== id);
  saveRemindersList(list);
  reminders = list;
  renderReminders();
  showAlert('提醒事項已刪除！', 'success');
}

// === 編輯提醒事項 ===
function editReminder(id) {
  const list = loadReminders();
  const reminder = list.find(r => r.id === id);
  if (!reminder) return;

  // 填表
  titleInput.value = reminder.title || '';
  dateInput.value = reminder.dueDate || reminder.date || '';
  contentInput.value = reminder.content || '';

  // 切換按鈕為「更新」
  addReminderBtn.textContent = '更新提醒事項';
  addReminderBtn.removeEventListener('click', addReminder);

  const updateHandler = function () {
    if (!titleInput.value || !dateInput.value) {
      showAlert('請填寫標題和日期！', 'error');
      return;
    }
    reminder.title = titleInput.value;
    const newDate = dateInput.value;
    // 若日期有變更，重置 7天提醒旗標
    const oldRaw = reminder.dueDate || reminder.date || '';
    if (newDate !== oldRaw) reminder.notified7d = false;
    reminder.dueDate = newDate;   // 統一寫回 dueDate
    reminder.content = contentInput.value;

    saveRemindersList(list);
    reminders = list;
    renderReminders();

    // 還原新增按鈕
    titleInput.value = '';
    dateInput.value = '';
    contentInput.value = '';
    addReminderBtn.textContent = '新增提醒事項';
    addReminderBtn.removeEventListener('click', updateHandler);
    addReminderBtn.addEventListener('click', addReminder);

    showAlert('提醒事項已更新！', 'success');

    // 立刻檢查一次（避免錯過）
    scanAndNotify7Days();
  };

  addReminderBtn.addEventListener('click', updateHandler);

  // 捲動到表單
  document.querySelector('.form-container')?.scrollIntoView({ behavior: 'smooth' });
}

// === 渲染提醒列表 ===
function renderReminders(filteredList = null) {
  const remindersList = filteredList || reminders;
  if (!Array.isArray(remindersList) || remindersList.length === 0) {
    remindersContainer.innerHTML = '<p class="no-reminders">目前沒有提醒事項</p>';
    document.title = '提醒記事本';
    return;
  }

  const sorted = [...remindersList].sort(
    (a, b) => toDate(a.dueDate || a.date) - toDate(b.dueDate || b.date)
  );

  remindersContainer.innerHTML = '';

  const today = new Date();
  const oneWeekLater = new Date();
  oneWeekLater.setDate(today.getDate() + 7);

  sorted.forEach(reminder => {
    const raw = reminder.dueDate || reminder.date;
    const reminderDate = toDate(raw);
    const isUpcoming = reminderDate <= oneWeekLater && reminderDate >= today;
    const isPast = reminderDate < today;

    const el = document.createElement('div');
    el.className = `reminder-item ${isUpcoming ? 'upcoming' : ''} ${isPast ? 'past' : ''}`;
    el.setAttribute('data-id', reminder.id);

    const formattedDate = formatDate(raw);
    const daysLeft = calculateDaysLeft(reminderDate, today);
    let daysLeftText = daysLeft > 0 ? `還有 ${daysLeft} 天`
      : daysLeft === 0 ? '今天到期'
      : `已過期 ${Math.abs(daysLeft)} 天`;

    el.innerHTML = `
      <div class="reminder-title">${escapeHTML(reminder.title)}</div>
      <div class="reminder-date">${formattedDate} <span class="days-left">(${daysLeftText})</span></div>
      <div class="reminder-content">${escapeHTML(reminder.content)}</div>
      ${isUpcoming ? '<div class="reminder-alert">⚠️ 即將到期（一週內）</div>' : ''}
      <div class="reminder-actions">
        <button class="edit-btn" data-id="${reminder.id}">✎ 編輯</button>
        <button class="delete-btn" data-id="${reminder.id}">✕ 刪除</button>
      </div>
    `;
    remindersContainer.appendChild(el);
  });

  bindButtonEvents();

  // 更新頁面標題 badge
  const upcomingCount = remindersList.filter(r => {
    const d = toDate(r.dueDate || r.date);
    return d <= oneWeekLater && d >= today;
  }).length;
  document.title = upcomingCount > 0 ? `(${upcomingCount}) 提醒記事本` : '提醒記事本';
}

// === 綁定按鈕事件 ===
function bindButtonEvents() {
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteReminder(parseInt(btn.getAttribute('data-id')));
    });
  });
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editReminder(parseInt(btn.getAttribute('data-id')));
    });
  });
  document.querySelectorAll('.reminder-item').forEach(item => {
    item.addEventListener('click', function () {
      showReminderDetails(parseInt(this.getAttribute('data-id')));
    });
  });
}

// === 詳細視窗 ===
function showReminderDetails(id) {
  const reminder = loadReminders().find(r => r.id === id);
  if (!reminder) return;

  const modal = document.createElement('div');
  modal.className = 'modal';
  const box = document.createElement('div');
  box.className = 'modal-content';

  const closeBtn = document.createElement('span');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => document.body.removeChild(modal);

  const raw = reminder.dueDate || reminder.date;
  const formattedDate = formatDate(raw);
  const daysLeft = calculateDaysLeft(raw, new Date());
  const daysLeftText = daysLeft > 0 ? `還有 ${daysLeft} 天`
    : daysLeft === 0 ? '今天到期'
    : `已過期 ${Math.abs(daysLeft)} 天`;

  box.innerHTML = `
    <h2>${escapeHTML(reminder.title)}</h2>
    <div class="detail-date">${formattedDate} <span class="days-left">(${daysLeftText})</span></div>
    <div class="detail-content">${escapeHTML(reminder.content) || '<em>無詳細內容</em>'}</div>
    <div class="detail-actions">
      <button class="edit-detail-btn">編輯</button>
      <button class="delete-detail-btn">刪除</button>
    </div>
  `;
  box.appendChild(closeBtn);
  modal.appendChild(box);
  document.body.appendChild(modal);

  modal.querySelector('.edit-detail-btn').addEventListener('click', () => {
    document.body.removeChild(modal);
    editReminder(id);
  });
  modal.querySelector('.delete-detail-btn').addEventListener('click', () => {
    document.body.removeChild(modal);
    deleteReminder(id);
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
}

// === 搜尋 / 篩選 ===
function filterReminders() {
  const term = (searchInput.value || '').toLowerCase();
  const filterValue = filterSelect.value;
  const list = loadReminders();

  let filtered = list;

  if (term) {
    filtered = filtered.filter(r =>
      (r.title || '').toLowerCase().includes(term) ||
      (r.content || '').toLowerCase().includes(term)
    );
  }

  const today = new Date();
  const oneWeekLater = new Date();
  oneWeekLater.setDate(today.getDate() + 7);

  if (filterValue === 'upcoming') {
    filtered = filtered.filter(r => {
      const d = toDate(r.dueDate || r.date);
      return d <= oneWeekLater && d >= today;
    });
  } else if (filterValue === 'future') {
    filtered = filtered.filter(r => toDate(r.dueDate || r.date) > oneWeekLater);
  } else if (filterValue === 'past') {
    filtered = filtered.filter(r => toDate(r.dueDate || r.date) < today);
  }

  reminders = list; // 同步全域
  renderReminders(filtered);
}

// === 即將到期（列表 + 標題 badge + 可選視窗通知）===
function checkUpcomingReminders() {
  const list = loadReminders();
  const today = new Date();
  const oneWeekLater = new Date();
  oneWeekLater.setDate(today.getDate() + 7);

  const upcoming = list.filter(r => {
    const d = toDate(r.dueDate || r.date);
    return d <= oneWeekLater && d >= today;
  });

  // 更新標題
  document.title = upcoming.length > 0 ? `(${upcoming.length}) 提醒記事本` : '提醒記事本';

  // 可選：也在這裡提示一次（如果你想要）
  // if (upcoming.length > 0 && Notification.permission === 'granted') {
  //   notifyNative('提醒事項通知', {
  //     body: `您有 ${upcoming.length} 個即將到期的提醒事項`,
  //     icon: '/icons/icon-192.png',
  //     badge: '/icons/icon-192.png'
  //   });
  // }

  return upcoming.length;
}

// === 「到期前 7 天」通知 ===
function notify7Days(rem) {
  const raw = rem.dueDate || rem.date;
  const title = `「${rem.title}」還有 7 天到期`;
  const due = toDate(raw).toLocaleDateString();
  notifyNative(title, {
    body: `到期日：${due}\n${rem.content ? '內容：' + rem.content : ''}`,
    tag: `reminder-7d-${rem.id}`,
    requireInteraction: false,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { id: rem.id, kind: '7d', url: '/index.html' }
  });
}

function scanAndNotify7Days() {
  const list = loadReminders();
  const now = Date.now();
  let changed = false;

  for (const r of list) {
    if (r.notified7d) continue;
    const raw = r.dueDate || r.date;
    const dueMs = toDate(raw).getTime();
    if (isNaN(dueMs)) continue;
    const delta = dueMs - now;

    if (delta > 0 && delta <= 7 * DAY) {
      notify7Days(r);
      r.notified7d = true;
      changed = true;
    }
  }
  if (changed) saveRemindersList(list);
}

// === 訊息提示 ===
function showAlert(message, type) {
  const el = document.createElement('div');
  el.className = `alert ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => document.body.removeChild(el), 300);
  }, 2000);
}

// === 啟動 ===
window.addEventListener('DOMContentLoaded', initApp);
