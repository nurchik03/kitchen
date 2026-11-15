/* ================= НАСТРОЙКА FIREBASE ================= */
const firebaseConfig = {
  apiKey: "AIzaSyBlQjEaTNs7dHjmzZphzU4TdqDoBOtXIJw",
  authDomain: "kitchen-app-8ab79.firebaseapp.com",
  projectId: "kitchen-app-8ab79",
  storageBucket: "kitchen-app-8ab79.firebasestorage.app",
  messagingSenderId: "610956700538",
  appId: "1:610956700538:web:e356316c6ee5a9ca3c44c3",
  measurementId: "G-6PR2V1ZD1E",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ================= НАСТРОЙКИ ПРИЛОЖЕНИЯ ================= */
const QR_ENTRANCE = "KITCHEN_DOOR_IN";
const QR_EXIT = "KITCHEN_DOOR_OUT";
const ADMIN_PASS = "admin123";

const LS_SESSION = "kitchen_session_v1";
const SS_ADMIN = "kitchen_admin_open_v1";
const COOLDOWN_MS = 8000;

let employeesCache = [];
let logsCache = [];
let announcementsCache = [];
let weeklyChartInstance = null;
let adminOpen = sessionStorage.getItem(SS_ADMIN) === "true";

/* ================= РАБОТА С СЕССИЕЙ ================= */
function getSession() {
  try {
    return JSON.parse(localStorage.getItem(LS_SESSION));
  } catch {
    return null;
  }
}
function setSession(name) {
  localStorage.setItem(LS_SESSION, JSON.stringify({ name }));
}
function clearSession() {
  localStorage.removeItem(LS_SESSION);
}
function currentUser() {
  const s = getSession();
  return s ? employeesCache.find((e) => e.name === s.name) || null : null;
}

/* ================= УТИЛИТЫ ================= */
function pad(n) {
  return String(n).padStart(2, "0");
}
function fmtTime(d) {
  return (
    pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
  );
}
function fmtDate(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

/* ================= РАСЧЁТ ЧАСОВ ================= */
function calculateEmployeeHours(empName, targetDateStr) {
  const empLogs = logsCache
    .filter((l) => l.name === empName && l.date === targetDateStr)
    .sort((a, b) => a.ts - b.ts);

  let totalMs = 0;
  let lastInTs = null;

  empLogs.forEach((log) => {
    if (log.type === "in") {
      lastInTs = log.ts;
    } else if (log.type === "out" && lastInTs !== null) {
      totalMs += log.ts - lastInTs;
      lastInTs = null;
    }
  });

  if (lastInTs !== null && targetDateStr === fmtDate(new Date())) {
    totalMs += Date.now() - lastInTs;
  }

  const totalMinutes = Math.floor(totalMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return { hours, minutes, totalMs };
}

/* ================= СИНХРОНИЗАЦИЯ С ОБЛАКОМ ================= */
db.collection("employees").onSnapshot((snapshot) => {
  employeesCache = [];
  snapshot.forEach((doc) => {
    employeesCache.push({ id: doc.id, ...doc.data() });
  });
  renderEmployees();
  updateAuthUI();
  updateAdminEmployeeSelects();
});

db.collection("logs")
  .orderBy("ts", "desc")
  .onSnapshot((snapshot) => {
    logsCache = [];
    snapshot.forEach((doc) => {
      logsCache.push({ id: doc.id, ...doc.data() });
    });
    renderTable();
    renderEmployees();
    updateAuthUI();
    updateWeeklyChart();
    renderUserHistory();
    renderAdminUserHistory();
  });

db.collection("announcements")
  .orderBy("ts", "desc")
  .onSnapshot((snapshot) => {
    announcementsCache = [];
    snapshot.forEach((doc) => {
      announcementsCache.push({ id: doc.id, ...doc.data() });
    });
    renderAnnouncements();
    renderAdminAnnouncements();
    updateAnnouncementsBadge();
  });

/* ================= НАВИГАЦИЯ ================= */
function switchTab(id) {
  if (id === "admin") {
    document
      .querySelectorAll(".tab")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === "admin"));
    document
      .querySelectorAll(".page")
      .forEach((p) => p.classList.toggle("active", p.id === "admin"));

    if (adminOpen) {
      document.getElementById("admin-lock").classList.add("hidden");
      document.getElementById("admin-content").classList.remove("hidden");
      renderTable();
      renderEmployees();
      renderAdminAnnouncements();
      updateWeeklyChart();
      updateAdminEmployeeSelects();
    } else {
      document.getElementById("admin-lock").classList.remove("hidden");
      document.getElementById("admin-content").classList.add("hidden");
    }
    return;
  }

  document
    .querySelectorAll(".tab")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.toggle("active", p.id === id));

  if (id === "scan" && !scanner) {
    startScanner();
  }
  updateAuthUI();
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

/* ================= СЕКРЕТНЫЙ ТРИГГЕР АДМИНКИ ================= */
let secretClicks = 0;
let secretTimer = null;

document
  .getElementById("secret-admin-trigger")
  .addEventListener("click", () => {
    secretClicks++;
    clearTimeout(secretTimer);
    secretTimer = setTimeout(() => {
      secretClicks = 0;
    }, 1000);

    if (secretClicks >= 5) {
      secretClicks = 0;
      const adminTab = document.getElementById("admin-tab");
      adminTab.classList.remove("hidden");
      switchTab("admin");
    }
  });

/* ================= АВТОРИЗАЦИЯ ================= */
document.getElementById("reg-btn").addEventListener("click", async () => {
  const name = document.getElementById("reg-name").value.trim();
  const p1 = document.getElementById("reg-pass").value;
  const p2 = document.getElementById("reg-pass2").value;
  const msg = document.getElementById("auth-msg");

  if (name.length < 2) {
    msg.textContent = "⚠️ Введите имя и фамилию.";
    return;
  }
  if (employeesCache.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    msg.textContent = "⚠️ Такой сотрудник уже зарегистрирован. Войдите.";
    return;
  }
  if (p1.length < 4) {
    msg.textContent = "⚠️ Пароль минимум 4 символа.";
    return;
  }
  if (p1 !== p2) {
    msg.textContent = "⚠️ Пароли не совпадают.";
    return;
  }

  try {
    await db.collection("employees").add({
      name: name,
      pass: p1,
      regDate: fmtDate(new Date()),
    });
    setSession(name);
    msg.textContent = "";
    ["reg-name", "reg-pass", "reg-pass2"].forEach(
      (i) => (document.getElementById(i).value = ""),
    );
    updateAuthUI();
    switchTab("scan");
  } catch (e) {
    msg.textContent = "❌ Ошибка регистрации: " + e.message;
  }
});

document.getElementById("login-btn").addEventListener("click", () => {
  const name = document.getElementById("login-name").value.trim();
  const pass = document.getElementById("login-pass").value;
  const msg = document.getElementById("auth-msg");

  const emp = employeesCache.find(
    (e) => e.name.toLowerCase() === name.toLowerCase(),
  );
  if (!emp || emp.pass !== pass) {
    msg.textContent = "❌ Неверное имя или пароль.";
    return;
  }
  setSession(emp.name);
  msg.textContent = "";
  document.getElementById("login-name").value = "";
  document.getElementById("login-pass").value = "";
  updateAuthUI();
  switchTab("scan");
});

function updateAuthUI() {
  const user = currentUser();
  document.getElementById("auth-forms").classList.toggle("hidden", !!user);
  document.getElementById("logged-view").classList.toggle("hidden", !user);

  if (user) {
    document.getElementById("logged-name").innerHTML =
      `👤 <b>${esc(user.name)}</b> <span class='muted'>(в системе с ${user.regDate})</span>`;
    document.getElementById("scan-user").innerHTML = `
      <div class="avatar">${esc(user.name.trim()[0].toUpperCase())}</div>
      <div><div class="who-name">${esc(user.name)}</div><div class="muted">Аккаунт активен для сканирования</div></div>
    `;
    document.getElementById("scan-user").style.display = "flex";

    const todayStr = fmtDate(new Date());
    const userLogs = logsCache.filter((l) => l.name === user.name);
    const lastLog = userLogs.length > 0 ? userLogs[0] : null;
    const isInside = lastLog && lastLog.type === "in";

    const statusEl = document.getElementById("user-current-status");
    statusEl.innerHTML = isInside
      ? "<span class='status-badge in'>🟢 На кухне</span>"
      : "<span class='status-badge out'>🔴 Вне кухни</span>";

    const timeData = calculateEmployeeHours(user.name, todayStr);
    document.getElementById("user-today-hours").textContent =
      `${timeData.hours} ч. ${timeData.minutes} мин.`;

    renderUserHistory();
  } else {
    document.getElementById("scan-user").style.display = "none";
  }
}

/* ================= ИСТОРИЯ ПОЛЬЗОВАТЕЛЯ В ПРОФИЛЕ ================= */
function renderUserHistory() {
  const user = currentUser();
  const tbody = document.querySelector("#user-history-table tbody");
  const noMsg = document.getElementById("user-no-history");
  if (!tbody) return;

  tbody.innerHTML = "";
  if (!user) return;

  const userLogs = logsCache.filter((l) => l.name === user.name);
  if (userLogs.length === 0) {
    noMsg.style.display = "block";
    return;
  }
  noMsg.style.display = "none";

  userLogs.forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${l.date}</td><td>${l.time}</td><td><span class="badge ${l.type}">${l.type === "in" ? "Вход" : "Выход"}</span></td>`;
    tbody.appendChild(tr);
  });
}

/* ================= СКАНИРОВАНИЕ ================= */
let lastScanTime = 0;
async function handleScan(text) {
  const code = (text || "").trim();
  const now = new Date();
  const nowMs = now.getTime();

  const isIn = code === QR_ENTRANCE;
  const isOut = code === QR_EXIT;
  if (!isIn && !isOut) {
    showResult(false, "❌ Неверный QR-код", "Это не код двери кухни.");
    return;
  }

  const user = currentUser();
  if (!user) {
    showResult(
      false,
      "❌ Ошибка",
      "Сначала войдите в аккаунт на этом устройстве.",
    );
    return;
  }

  if (nowMs - lastScanTime < COOLDOWN_MS) return;

  const targetType = isIn ? "in" : "out";
  const userLogs = logsCache.filter((l) => l.name === user.name);
  const lastUserLog = userLogs.length > 0 ? userLogs[0] : null;
  const currentStatus = lastUserLog ? lastUserLog.type : "out";

  if (targetType === "in" && currentStatus === "in") {
    showResult(false, "⚠️ Вы уже внутри!", "Сначала отсканируйте код выхода.");
    lastScanTime = nowMs;
    return;
  }
  if (targetType === "out" && currentStatus === "out") {
    showResult(false, "⚠️ Вы ещё не вошли!", "Сначала отсканируйте код входа.");
    lastScanTime = nowMs;
    return;
  }

  lastScanTime = nowMs;

  try {
    await db.collection("logs").add({
      ts: nowMs,
      date: fmtDate(now),
      time: fmtTime(now),
      name: user.name,
      type: targetType,
    });

    if (targetType === "in") {
      showResult(
        true,
        "🟢 ВХОД УСПЕШЕН!",
        `Добро пожаловать, ${esc(user.name)}!<br><span class='muted'>Время: ${fmtTime(now)}</span>`,
      );
    } else {
      showResult(
        true,
        "🔴 ВЫХОД УСПЕШЕН!",
        `До свидания, ${esc(user.name)}!<br><span class='muted'>Время: ${fmtTime(now)}</span>`,
      );
    }
  } catch (e) {
    showResult(false, "❌ Ошибка сохранения", e.message);
  }
}

function showResult(ok, title, html) {
  const box = document.getElementById("result");
  box.classList.remove("hidden", "bad");
  if (!ok) box.classList.add("bad");

  document.getElementById("result-icon").textContent = ok ? "✅" : "⚠️";
  document.getElementById("result-text").innerHTML = `
    <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">${title}</div>
    <div>${html}</div>
  `;

  clearTimeout(showResult._t);
  showResult._t = setTimeout(
    () => box.classList.add("hidden"),
    ok ? 8000 : 5000,
  );
}

/* ================= КАМЕРА ================= */
let scanner = null;
async function startScanner() {
  const status = document.getElementById("cam-status");
  if (typeof Html5Qrcode === "undefined") {
    status.textContent = "⚠️ Модуль камеры не загружен.";
    return;
  }
  if (scanner) return;

  scanner = new Html5Qrcode("reader");
  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      handleScan,
      () => {},
    );
    status.textContent = "📷 Камера активна. Наведите на QR-код.";
  } catch (e) {
    scanner = null;
    status.textContent = "⚠️ Ошибка камеры: " + e.message;
  }
}

/* ================= АДМИН-ПАНЕЛЬ ================= */
document
  .getElementById("admin-unlock")
  .addEventListener("click", tryAdminUnlock);
document.getElementById("admin-pass").addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryAdminUnlock();
});

function tryAdminUnlock() {
  const msg = document.getElementById("admin-lock-msg");
  const inputPass = document.getElementById("admin-pass").value;

  if (inputPass === ADMIN_PASS) {
    adminOpen = true;
    sessionStorage.setItem(SS_ADMIN, "true");
    document.getElementById("admin-pass").value = "";
    document.getElementById("admin-lock").classList.add("hidden");
    document.getElementById("admin-content").classList.remove("hidden");

    // Скрываем сканер для админа
    document.querySelector('.tab[data-tab="scan"]').classList.add("hidden");

    msg.textContent = "";
    renderTable();
    renderEmployees();
    renderAdminAnnouncements();
    updateWeeklyChart();
    updateAdminEmployeeSelects();
  } else {
    msg.textContent = "❌ Неверный пароль.";
  }
}

document.getElementById("admin-lock-btn").addEventListener("click", () => {
  adminOpen = false;
  sessionStorage.removeItem(SS_ADMIN);
  document.getElementById("admin-tab").classList.add("hidden");
  document.getElementById("admin-lock").classList.remove("hidden");
  document.getElementById("admin-content").classList.add("hidden");

  // Возвращаем сканер при выходе из админки
  document.querySelector('.tab[data-tab="scan"]').classList.remove("hidden");

  switchTab("auth");
});

if (adminOpen) {
  document.getElementById("admin-tab").classList.remove("hidden");
  document.getElementById("admin-lock").classList.add("hidden");
  document.getElementById("admin-content").classList.remove("hidden");
  document.querySelector('.tab[data-tab="scan"]').classList.add("hidden");
}

/* ================= ОБЪЯВЛЕНИЯ ================= */
function renderAnnouncements() {
  const container = document.getElementById("announcements-feed");
  if (announcementsCache.length === 0) {
    container.innerHTML =
      '<p class="muted" id="no-announcements">Пока нет ни одного объявления.</p>';
    return;
  }

  let html = "";
  announcementsCache.forEach((ann) => {
    let imgHtml = ann.image
      ? `<img src="${esc(ann.image)}" class="announcement-img" alt="Фото">`
      : "";
    html += `
      <div class="announcement-card">
        <h3>${esc(ann.title)}</h3>
        <div class="announcement-meta">📅 Опубликовано: ${ann.date} в ${ann.time}</div>
        <div class="announcement-text">${esc(ann.text)}</div>
        ${imgHtml}
      </div>
    `;
  });
  container.innerHTML = html;
}

function updateAnnouncementsBadge() {
  const badge = document.getElementById("ann-badge");
  if (announcementsCache.length > 0) {
    badge.textContent = announcementsCache.length;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

document
  .getElementById("publish-ann-btn")
  .addEventListener("click", async () => {
    const title = document.getElementById("ann-title").value.trim();
    const text = document.getElementById("ann-text").value.trim();
    const image = document.getElementById("ann-image").value.trim();
    const msg = document.getElementById("ann-publish-msg");

    if (!title || !text) {
      msg.textContent = "⚠️ Заполните заголовок и текст!";
      return;
    }

    const now = new Date();
    try {
      await db.collection("announcements").add({
        title,
        text,
        image: image || "",
        date: fmtDate(now),
        time: fmtTime(now),
        ts: now.getTime(),
      });
      document.getElementById("ann-title").value = "";
      document.getElementById("ann-text").value = "";
      document.getElementById("ann-image").value = "";
      msg.textContent = "✅ Опубликовано!";
      setTimeout(() => (msg.textContent = ""), 3000);
    } catch (e) {
      msg.textContent = "❌ Ошибка: " + e.message;
    }
  });

function renderAdminAnnouncements() {
  if (!adminOpen) return;
  const tbody = document.querySelector("#admin-ann-table tbody");
  const noMsg = document.getElementById("admin-no-ann");
  tbody.innerHTML = "";

  if (announcementsCache.length === 0) {
    noMsg.style.display = "block";
    return;
  }
  noMsg.style.display = "none";

  announcementsCache.forEach((ann) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${ann.date}</td><td><b>${esc(ann.title)}</b></td><td><button class="btn danger sm del-ann-btn" data-id="${ann.id}">Удалить</button></td>`;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".del-ann-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      if (confirm("Удалить объявление?")) {
        await db.collection("announcements").doc(id).delete();
      }
    });
  });
}

/* ================= ТАБЛИЦЫ И СТАТИСТИКА ================= */
function renderTable() {
  if (!adminOpen) return;
  const tbody = document.querySelector("#log-table tbody");
  const dateFilter = document.getElementById("filter-date").value;
  const log = logsCache.filter((e) => !dateFilter || e.date === dateFilter);

  tbody.innerHTML = "";
  document.getElementById("empty-msg").style.display = log.length
    ? "none"
    : "block";

  log.forEach((e) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${e.date}</td><td>${e.time}</td><td>${esc(e.name)}</td><td><span class="badge ${e.type}">${e.type === "in" ? "Вход" : "Выход"}</span></td>`;
    tbody.appendChild(tr);
  });
}

function renderEmployees() {
  if (!adminOpen) return;
  const tbody = document.querySelector("#emp-table tbody");
  tbody.innerHTML = "";

  if (employeesCache.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="muted" style="text-align:center;">Нет сотрудников</td></tr>';
    return;
  }

  const todayStr = fmtDate(new Date());
  employeesCache.forEach((e) => {
    const userLogs = logsCache.filter((l) => l.name === e.name);
    const lastLog = userLogs.length > 0 ? userLogs[0] : null;
    const isInside = lastLog && lastLog.type === "in";
    const statusHtml = isInside
      ? '<span class="badge in">Внутри</span>'
      : '<span class="badge out">Вне кухни</span>';
    const timeData = calculateEmployeeHours(e.name, todayStr);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${esc(e.name)}</b></td>
      <td>${statusHtml}</td>
      <td><b>${timeData.hours} ч. ${timeData.minutes} мин.</b></td>
      <td><button class="btn danger sm del-emp-btn" data-id="${e.id}" data-name="${esc(e.name)}">Удалить</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".del-emp-btn").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      const id = event.target.dataset.id;
      const name = event.target.dataset.name;
      if (confirm(`Удалить сотрудника ${name}?`)) {
        await db.collection("employees").doc(id).delete();
      }
    });
  });
}

/* ================= ОБНОВЛЕНИЕ ВСЕХ ВЫПАДАЮЩИХ СПИСКОВ СОТРУДНИКОВ ================= */
function updateAdminEmployeeSelects() {
  const selectUser = document.getElementById("admin-employee-select");
  const selectChart = document.getElementById("chart-employee-select");

  if (selectUser) {
    const currentVal = selectUser.value;
    selectUser.innerHTML =
      '<option value="">-- Выберите сотрудника --</option>';
    employeesCache.forEach((e) => {
      const opt = document.createElement("option");
      opt.value = e.name;
      opt.textContent = e.name;
      if (e.name === currentVal) opt.selected = true;
      selectUser.appendChild(opt);
    });
  }

  if (selectChart) {
    const currentVal = selectChart.value;
    selectChart.innerHTML =
      '<option value="all">Все сотрудники (общий)</option>';
    employeesCache.forEach((e) => {
      const opt = document.createElement("option");
      opt.value = e.name;
      opt.textContent = e.name;
      if (e.name === currentVal) opt.selected = true;
      selectChart.appendChild(opt);
    });
  }
}

function renderAdminUserHistory() {
  if (!adminOpen) return;
  const select = document.getElementById("admin-employee-select");
  const tbody = document.querySelector("#admin-user-history-table tbody");
  const noMsg = document.getElementById("admin-user-no-history");
  if (!select || !tbody) return;

  const selectedName = select.value;
  tbody.innerHTML = "";

  if (!selectedName) {
    noMsg.style.display = "block";
    noMsg.textContent =
      "Выберите сотрудника из списка выше, чтобы увидеть его историю.";
    return;
  }

  const userLogs = logsCache.filter((l) => l.name === selectedName);
  if (userLogs.length === 0) {
    noMsg.style.display = "block";
    noMsg.textContent = `У сотрудника ${selectedName} пока нет записей о посещениях.`;
    return;
  }
  noMsg.style.display = "none";

  userLogs.forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${l.date}</td><td>${l.time}</td><td><span class="badge ${l.type}">${l.type === "in" ? "Вход" : "Выход"}</span></td>`;
    tbody.appendChild(tr);
  });
}

document
  .getElementById("admin-employee-select")
  .addEventListener("change", renderAdminUserHistory);
document
  .getElementById("chart-employee-select")
  .addEventListener("change", updateWeeklyChart);

document.getElementById("export-user-csv").addEventListener("click", () => {
  const select = document.getElementById("admin-employee-select");
  const selectedName = select.value;
  if (!selectedName) {
    alert("Сначала выберите сотрудника из выпадающего списка!");
    return;
  }

  const userLogs = logsCache.filter((l) => l.name === selectedName);
  if (userLogs.length === 0) {
    alert("У выбранного сотрудника нет записей для экспорта.");
    return;
  }

  const rows = [["Дата", "Время", "Сотрудник", "Тип"]];
  userLogs.forEach((e) =>
    rows.push([e.date, e.time, e.name, e.type === "in" ? "Вход" : "Выход"]),
  );

  const csv =
    "\uFEFF" + rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  a.download = `report_${selectedName.replace(/\s+/g, "_")}.csv`;
  a.click();
});

/* ================= ЭКСПОРТ ОБЩЕГО ЖУРНАЛА ================= */
document.getElementById("export-csv").addEventListener("click", () => {
  const period = document.getElementById("export-period").value;
  const dateFilterInput = document.getElementById("filter-date").value;
  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let filteredLogs = logsCache;

  if (period === "day") {
    filteredLogs = logsCache.filter(
      (e) => !dateFilterInput || e.date === dateFilterInput,
    );
  } else if (period === "week") {
    const weekAgo = nowMs - 7 * dayMs;
    filteredLogs = logsCache.filter((e) => e.ts >= weekAgo);
  } else if (period === "month") {
    const monthAgo = nowMs - 30 * dayMs;
    filteredLogs = logsCache.filter((e) => e.ts >= monthAgo);
  }

  if (filteredLogs.length === 0) {
    alert("За выбранный период нет записей для экспорта.");
    return;
  }

  const rows = [["Дата", "Время", "Сотрудник", "Тип"]];
  filteredLogs.forEach((e) =>
    rows.push([e.date, e.time, e.name, e.type === "in" ? "Вход" : "Выход"]),
  );

  const csv =
    "\uFEFF" + rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  a.download = `kitchen-log-${period}.csv`;
  a.click();
});

/* ================= ГРАФИК (CHART.JS) ================= */
function updateWeeklyChart() {
  if (!adminOpen) return;
  const ctx = document.getElementById("weeklyChart");
  if (!ctx) return;

  const chartSelect = document.getElementById("chart-employee-select");
  const selectedEmp = chartSelect ? chartSelect.value : "all";

  const labels = [];
  const dataCounts = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = fmtDate(d);
    labels.push(
      d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
    );

    const dayInCount = logsCache.filter((l) => {
      const matchDate = l.date === dateStr && l.type === "in";
      if (selectedEmp === "all") return matchDate;
      return matchDate && l.name === selectedEmp;
    }).length;

    dataCounts.push(dayInCount);
  }

  const chartLabel =
    selectedEmp === "all"
      ? "Входов за день (все)"
      : `Входов за день (${selectedEmp})`;

  if (weeklyChartInstance) {
    weeklyChartInstance.data.labels = labels;
    weeklyChartInstance.data.datasets[0].label = chartLabel;
    weeklyChartInstance.data.datasets[0].data = dataCounts;
    weeklyChartInstance.update();
  } else {
    weeklyChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: chartLabel,
            data: dataCounts,
            backgroundColor: "#4f46e5",
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
}

document.getElementById("filter-date").value = fmtDate(new Date());
document.getElementById("filter-date").addEventListener("change", renderTable);
document.getElementById("show-all").addEventListener("click", () => {
  document.getElementById("filter-date").value = "";
  renderTable();
});

document.getElementById("clear-data").addEventListener("click", async () => {
  if (confirm("Удалить ВСЕ записи журнала посещений?")) {
    const snapshot = await db.collection("logs").get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
});

/* ================= QR-КОДЫ ДВЕРЕЙ ================= */
function buildDoorQr() {
  const list = document.getElementById("door-qr-list");
  if (!list) return;
  list.innerHTML = "";
  const doors = [
    { label: "🟢 ВХОД на кухню", text: QR_ENTRANCE },
    { label: "🔴 ВЫХОД с кухни", text: QR_EXIT },
  ];
  doors.forEach((d) => {
    const item = document.createElement("div");
    item.className = "qr-item";
    const holder = document.createElement("div");
    const btn = document.createElement("button");
    btn.className = "btn ghost sm";
    btn.textContent = "Печать";
    item.appendChild(holder);
    item.insertAdjacentHTML("beforeend", `<div class="name">${d.label}</div>`);
    item.appendChild(btn);
    list.appendChild(item);

    if (typeof QRCode !== "undefined") {
      new QRCode(holder, { text: d.text, width: 130, height: 130 });
    }
    btn.addEventListener("click", () => {
      const win = window.open("", "_blank");
      win.document.write(
        `<html><head><title>${d.label}</title></head><body style="text-align:center;padding:40px;font-family:sans-serif"><h2>${d.label}</h2>${holder.innerHTML}</body></html>`,
      );
      win.document.close();
      win.print();
    });
  });
}

buildDoorQr();
