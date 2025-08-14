// 提醒記事本腳本

// 儲存提醒事項的陣列
let reminders = JSON.parse(localStorage.getItem('reminders')) || [];

// DOM 元素
const titleInput = document.getElementById('title');
const dateInput = document.getElementById('date');
const contentInput = document.getElementById('content');
const addReminderBtn = document.getElementById('add-reminder');
const remindersContainer = document.getElementById('reminders-container');
const searchInput = document.getElementById('search-input');
const filterSelect = document.getElementById('filter-select');

// 初始化應用程式
function initApp() {
    // 設定今天日期為最小日期
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    dateInput.setAttribute('min', formattedDate);
    
    // 綁定事件監聽器
    addReminderBtn.addEventListener('click', addReminder);
    searchInput.addEventListener('input', filterReminders);
    filterSelect.addEventListener('change', filterReminders);
    
    // 請求通知權限
    requestNotificationPermission();
    
    // 初始渲染
    renderReminders();
    
    // 檢查即將到期的提醒事項
    checkUpcomingReminders();
    
    // 設定定期檢查
    setInterval(checkUpcomingReminders, 24 * 60 * 60 * 1000); // 每天檢查一次
}

// 新增提醒事項
function addReminder() {
    if (!titleInput.value || !dateInput.value) {
        showAlert('請填寫標題和日期！', 'error');
        return;
    }
    
    const newReminder = {
        id: Date.now(),
        title: titleInput.value,
        date: dateInput.value,
        content: contentInput.value,
        createdAt: new Date().toISOString()
    };
    
    reminders.push(newReminder);
    saveReminders();
    renderReminders();
    
    // 清空表單
    titleInput.value = '';
    dateInput.value = '';
    contentInput.value = '';
    
    showAlert('提醒事項已新增！', 'success');
}

// 儲存提醒事項到 localStorage
function saveReminders() {
    localStorage.setItem('reminders', JSON.stringify(reminders));
}

// 渲染提醒事項列表
function renderReminders(filteredList = null) {
    const remindersList = filteredList || reminders;
    
    if (remindersList.length === 0) {
        remindersContainer.innerHTML = '<p class="no-reminders">目前沒有提醒事項</p>';
        return;
    }
    
    // 依日期排序
    const sortedReminders = [...remindersList].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    remindersContainer.innerHTML = '';
    
    const today = new Date();
    const oneWeekLater = new Date();
    oneWeekLater.setDate(today.getDate() + 7);
    
    sortedReminders.forEach(reminder => {
        const reminderDate = new Date(reminder.date);
        const isUpcoming = reminderDate <= oneWeekLater && reminderDate >= today;
        const isPast = reminderDate < today;
        
        const reminderElement = document.createElement('div');
        reminderElement.className = `reminder-item ${isUpcoming ? 'upcoming' : ''} ${isPast ? 'past' : ''}`;
        reminderElement.setAttribute('data-id', reminder.id);
        
        // 格式化日期顯示
        const formattedDate = formatDate(reminder.date);
        
        // 計算剩餘天數
        const daysLeft = calculateDaysLeft(reminderDate, today);
        let daysLeftText = '';
        
        if (daysLeft > 0) {
            daysLeftText = `還有 ${daysLeft} 天`;
        } else if (daysLeft === 0) {
            daysLeftText = '今天到期';
        } else {
            daysLeftText = `已過期 ${Math.abs(daysLeft)} 天`;
        }
        
        reminderElement.innerHTML = `
            <div class="reminder-title">${escapeHTML(reminder.title)}</div>
            <div class="reminder-date">${formattedDate} <span class="days-left">(${daysLeftText})</span></div>
            <div class="reminder-content">${escapeHTML(reminder.content)}</div>
            ${isUpcoming ? '<div class="reminder-alert">⚠️ 即將到期（一週內）</div>' : ''}
            <div class="reminder-actions">
                <button class="edit-btn" data-id="${reminder.id}">✎ 編輯</button>
                <button class="delete-btn" data-id="${reminder.id}">✕ 刪除</button>
            </div>
        `;
        
        remindersContainer.appendChild(reminderElement);
    });
    
    // 綁定刪除和編輯按鈕事件
    bindButtonEvents();
}

// 綁定按鈕事件
function bindButtonEvents() {
    // 刪除按鈕
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation(); // 防止事件冒泡
            const id = parseInt(this.getAttribute('data-id'));
            deleteReminder(id);
        });
    });
    
    // 編輯按鈕
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation(); // 防止事件冒泡
            const id = parseInt(this.getAttribute('data-id'));
            editReminder(id);
        });
    });
    
    // 點擊整個提醒項目顯示詳細資訊
    document.querySelectorAll('.reminder-item').forEach(item => {
        item.addEventListener('click', function() {
            const id = parseInt(this.getAttribute('data-id'));
            showReminderDetails(id);
        });
    });
}

// 刪除提醒事項
function deleteReminder(id) {
    if (confirm('確定要刪除這個提醒事項嗎？')) {
        reminders = reminders.filter(reminder => reminder.id !== id);
        saveReminders();
        renderReminders();
        showAlert('提醒事項已刪除！', 'success');
    }
}

// 編輯提醒事項
function editReminder(id) {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;
    
    // 填充表單
    titleInput.value = reminder.title;
    dateInput.value = reminder.date;
    contentInput.value = reminder.content;
    
    // 變更新增按鈕為更新按鈕
    addReminderBtn.textContent = '更新提醒事項';
    addReminderBtn.removeEventListener('click', addReminder);
    
    // 添加更新事件
    const updateHandler = function() {
        if (!titleInput.value || !dateInput.value) {
            showAlert('請填寫標題和日期！', 'error');
            return;
        }
        
        // 更新提醒事項
        reminder.title = titleInput.value;
        reminder.date = dateInput.value;
        reminder.content = contentInput.value;
        
        saveReminders();
        renderReminders();
        
        // 重置表單
        titleInput.value = '';
        dateInput.value = '';
        contentInput.value = '';
        
        // 恢復新增按鈕
        addReminderBtn.textContent = '新增提醒事項';
        addReminderBtn.removeEventListener('click', updateHandler);
        addReminderBtn.addEventListener('click', addReminder);
        
        showAlert('提醒事項已更新！', 'success');
    };
    
    addReminderBtn.addEventListener('click', updateHandler);
    
    // 滾動到表單
    document.querySelector('.form-container').scrollIntoView({ behavior: 'smooth' });
}

// 顯示提醒事項詳細資訊
function showReminderDetails(id) {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;
    
    // 創建模態框
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = function() {
        document.body.removeChild(modal);
    };
    
    const formattedDate = formatDate(reminder.date);
    const daysLeft = calculateDaysLeft(new Date(reminder.date), new Date());
    let daysLeftText = '';
    
    if (daysLeft > 0) {
        daysLeftText = `還有 ${daysLeft} 天`;
    } else if (daysLeft === 0) {
        daysLeftText = '今天到期';
    } else {
        daysLeftText = `已過期 ${Math.abs(daysLeft)} 天`;
    }
    
    modalContent.innerHTML = `
        <h2>${escapeHTML(reminder.title)}</h2>
        <div class="detail-date">${formattedDate} <span class="days-left">(${daysLeftText})</span></div>
        <div class="detail-content">${escapeHTML(reminder.content) || '<em>無詳細內容</em>'}</div>
        <div class="detail-actions">
            <button class="edit-detail-btn">編輯</button>
            <button class="delete-detail-btn">刪除</button>
        </div>
    `;
    
    modalContent.appendChild(closeBtn);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // 綁定模態框中的按鈕事件
    modal.querySelector('.edit-detail-btn').addEventListener('click', function() {
        document.body.removeChild(modal);
        editReminder(id);
    });
    
    modal.querySelector('.delete-detail-btn').addEventListener('click', function() {
        document.body.removeChild(modal);
        deleteReminder(id);
    });
    
    // 點擊模態框外部關閉
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// 過濾提醒事項
function filterReminders() {
    const searchTerm = searchInput.value.toLowerCase();
    const filterValue = filterSelect.value;
    
    let filteredList = reminders;
    
    // 搜尋過濾
    if (searchTerm) {
        filteredList = filteredList.filter(reminder => 
            reminder.title.toLowerCase().includes(searchTerm) || 
            reminder.content.toLowerCase().includes(searchTerm)
        );
    }
    
    // 狀態過濾
    const today = new Date();
    const oneWeekLater = new Date();
    oneWeekLater.setDate(today.getDate() + 7);
    
    if (filterValue === 'upcoming') {
        filteredList = filteredList.filter(reminder => {
            const reminderDate = new Date(reminder.date);
            return reminderDate <= oneWeekLater && reminderDate >= today;
        });
    } else if (filterValue === 'future') {
        filteredList = filteredList.filter(reminder => {
            const reminderDate = new Date(reminder.date);
            return reminderDate > oneWeekLater;
        });
    } else if (filterValue === 'past') {
        filteredList = filteredList.filter(reminder => {
            const reminderDate = new Date(reminder.date);
            return reminderDate < today;
        });
    }
    
    renderReminders(filteredList);
}

// 檢查是否有即將到期的提醒事項
function checkUpcomingReminders() {
    const today = new Date();
    const oneWeekLater = new Date();
    oneWeekLater.setDate(today.getDate() + 7);
    
    const upcomingReminders = reminders.filter(reminder => {
        const reminderDate = new Date(reminder.date);
        return reminderDate <= oneWeekLater && reminderDate >= today;
    });
    
    if (upcomingReminders.length > 0 && Notification.permission === 'granted') {
        const notification = new Notification('提醒事項通知', {
            body: `您有 ${upcomingReminders.length} 個即將到期的提醒事項`,
            icon: 'https://cdn-icons-png.flaticon.com/512/1827/1827347.png'
        });
        
        notification.onclick = function() {
            window.focus();
        };
    }
    
    // 更新頁面標題，如果有即將到期的提醒事項
    if (upcomingReminders.length > 0) {
        document.title = `(${upcomingReminders.length}) 提醒記事本`;
    } else {
        document.title = '提醒記事本';
    }
    
    return upcomingReminders.length;
}

// 請求通知權限
function requestNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    showAlert('通知權限已啟用！', 'success');
                }
            });
        }
    }
}

// 格式化日期
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });
}

// 計算剩餘天數
function calculateDaysLeft(date, today) {
    const timeDiff = date - today;
    return Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
}

// 顯示提示訊息
function showAlert(message, type) {
    const alertElement = document.createElement('div');
    alertElement.className = `alert ${type}`;
    alertElement.textContent = message;
    
    document.body.appendChild(alertElement);
    
    // 2秒後自動消失
    setTimeout(() => {
        alertElement.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(alertElement);
        }, 300);
    }, 2000);
}

// HTML 轉義，防止 XSS 攻擊
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 匯出提醒事項
function exportReminders() {
    const dataStr = JSON.stringify(reminders, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `reminders_${new Date().toISOString().slice(0, 10)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showAlert('提醒事項已匯出！', 'success');
}

// 匯入提醒事項
function importReminders(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (Array.isArray(importedData)) {
                // 合併現有和匯入的提醒事項，避免重複
                const existingIds = reminders.map(r => r.id);
                const newReminders = importedData.filter(r => !existingIds.includes(r.id));
                
                reminders = [...reminders, ...newReminders];
                saveReminders();
                renderReminders();
                
                showAlert(`成功匯入 ${newReminders.length} 個提醒事項！`, 'success');
            } else {
                showAlert('匯入的檔案格式不正確！', 'error');
            }
        } catch (error) {
            showAlert('匯入失敗：' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    
    // 重置檔案輸入，以便可以再次選擇同一個檔案
    event.target.value = '';
}

// 當頁面載入完成後初始化應用程式
window.addEventListener('DOMContentLoaded', initApp);