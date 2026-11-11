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

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ================= НАСТРОЙКИ ПРИЛОЖЕНИЯ ================= */
const QR_ENTRANCE = "KITCHEN_DOOR_IN";
const QR_EXIT = "KITCHEN_DOOR_OUT";
const ADMIN_PASS = "admin123";

const LS_SESSION = "kitchen_session_v1";
const COOLDOWN_MS = 8000;

let employeesCache = [];
let logsCache = [];
let announcementsCache = [];
let weeklyChartInstance = null;

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

/* ================= РАСЧЁТ ОТРАБОТАННЫХ ЧАСОВ ================= */
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

/* ================= СИНХРОНИЗАЦИЯ С ОБЛАКОМ (REALTIME) ================= */
db.collection("employees").onSnapshot((snapshot) => {
  employeesCache = [];
  snapshot.forEach((doc) => {
    employeesCache.push({ id: doc.id, ...doc.data() });
  });
  renderEmployees();
  updateAuthUI();
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
  });

// Слушаем объявления в реальном времени
db.collection("announcements")
  .orderBy("ts", "desc")
  .onSnapshot((snapshot) => {
    announcementsCache = [];
    snapshot.forEach((doc) => {
      announcementsCache.push({ id: doc.id, ...doc.data() });
    });
    renderAnnouncements();
    renderAdminAnnouncements();
  });

/* ================= НАВИГАЦИЯ ПО ВКЛАДКАМ ================= */
function switchTab(id) {
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

/* ================= РЕГИСТРАЦИЯ ================= */
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
  } catch (e) {
    msg.textContent = "❌ Ошибка регистрации: " + e.message;
  }
});

/* ================= ВХОД / ВЫХОД ================= */
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
});

document.getElementById("logout-btn").addEventListener("click", () => {
  clearSession();
  updateAuthUI();
});

function updateAuthUI() {
  const user = currentUser();
  document.getElementById("auth-forms").classList.toggle("hidden", !!user);
  document.getElementById("logged-view").classList.toggle("hidden", !user);

  if (user) {
    document.getElementById("logged-name").innerHTML =
      "👤 <b>" +
      esc(user.name) +
      "</b><br><span class='muted'>В системе с " +
      user.regDate +
      "</span>";

    document.getElementById("scan-user").innerHTML =
      '<div class="avatar">' +
      esc(user.name.trim()[0].toUpperCase()) +
      "</div>" +
      '<div><div class="who-name">' +
      esc(user.name) +
      "</div>" +
      '<div class="muted">Отметки будут записываться на ваш аккаунт</div></div>';
    document.getElementById("scan-user").style.display = "flex";

    const todayStr = fmtDate(new Date());
    const userLogs = logsCache.filter((l) => l.name === user.name);
    const lastLog = userLogs.length > 0 ? userLogs[0] : null;
    const isInside = lastLog && lastLog.type === "in";

    const statusEl = document.getElementById("user-current-status");
    if (isInside) {
      statusEl.innerHTML =
        "<span style='color:#2e7d32;'>🟢 На кухне (внутри)</span>";
    } else {
      statusEl.innerHTML = "<span style='color:#ef6c00;'>🔴 Вне кухни</span>";
    }

    const timeData = calculateEmployeeHours(user.name, todayStr);
    document.getElementById("user-today-hours").textContent =
      `${timeData.hours} ч. ${timeData.minutes} мин.`;
  } else {
    document.getElementById("scan-user").style.display = "none";
  }
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
    showResult(
      false,
      "⚠️ Вы уже внутри!",
      "Вы уже отмечены как вошедший. Сначала отсканируйте выход.",
    );
    lastScanTime = nowMs;
    return;
  }
  if (targetType === "out" && currentStatus === "out") {
    showResult(
      false,
      "⚠️ Вы ещё не вошли!",
      "Сначала отсканируйте QR-код на входе.",
    );
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
        `Добро пожаловать на кухню, ${esc(user.name)}!<br><span class='muted'>Время: ${fmtTime(now)}</span>`,
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
  const displayTime = ok ? 10000 : 6000;
  showResult._t = setTimeout(() => box.classList.add("hidden"), displayTime);
}

/* ================= КАМЕРА ================= */
let scanner = null;
async function startScanner() {
  const status = document.getElementById("cam-status");
  if (typeof Html5Qrcode === "undefined") {
    status.textContent = "⚠️ Не загрузился модуль камеры — проверьте интернет.";
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
    status.textContent = "📷 Камера работает. Наведите на QR у двери.";
  } catch (e) {
    scanner = null;
    status.textContent = "⚠️ Камера недоступна: " + e.message + ".";
  }
}

/* ================= АДМИН: ЗАМОК ================= */
let adminOpen = false;
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
    document.getElementById("admin-pass").value = "";
    document.getElementById("admin-lock").classList.add("hidden");
    document.getElementById("admin-content").classList.remove("hidden");
    msg.textContent = "";
    renderTable();
    renderEmployees();
    renderAdminAnnouncements();
    updateWeeklyChart();
  } else {
    msg.textContent = "❌ Неверный пароль.";
  }
}

document.getElementById("admin-lock-btn").addEventListener("click", () => {
  adminOpen = false;
  document.getElementById("admin-lock").classList.remove("hidden");
  document.getElementById("admin-content").classList.add("hidden");
});

/* ================= РАБОТА С ОБЪЯВЛЕНИЯМИ ================= */
function renderAnnouncements() {
  const container = document.getElementById("announcements-feed");
  const noMsg = document.getElementById("no-announcements");

  if (announcementsCache.length === 0) {
    container.innerHTML =
      '<p class="muted" id="no-announcements">Пока нет ни одного объявления.</p>';
    return;
  }

  let html = "";
  announcementsCache.forEach((ann) => {
    let imgHtml = ann.image
      ? `<br><img src="${esc(ann.image)}" class="announcement-img" alt="Фото к объявлению">`
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

// Публикация объявления админом
document
  .getElementById("publish-ann-btn")
  .addEventListener("click", async () => {
    const title = document.getElementById("ann-title").value.trim();
    const text = document.getElementById("ann-text").value.trim();
    const image = document.getElementById("ann-image").value.trim();
    const msg = document.getElementById("ann-publish-msg");

    if (!title || !text) {
      msg.textContent = "⚠️ Заполните заголовок и текст объявления!";
      return;
    }

    const now = new Date();
    try {
      await db.collection("announcements").add({
        title: title,
        text: text,
        image: image || "",
        date: fmtDate(now),
        time: fmtTime(now),
        ts: now.getTime(),
      });

      document.getElementById("ann-title").value = "";
      document.getElementById("ann-text").value = "";
      document.getElementById("ann-image").value = "";
      msg.textContent = "✅ Объявление успешно опубликовано для всех!";
      setTimeout(() => (msg.textContent = ""), 4000);
    } catch (e) {
      msg.textContent = "❌ Ошибка публикации: " + e.message;
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
    tr.innerHTML = `
      <td>${ann.date} ${ann.time}</td>
      <td><b>${esc(ann.title)}</b></td>
      <td><button class="btn danger sm del-ann-btn" data-id="${ann.id}">Удалить</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".del-ann-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      if (confirm("Удалить это объявление?")) {
        try {
          await db.collection("announcements").doc(id).delete();
        } catch (err) {
          alert("Ошибка удаления: " + err.message);
        }
      }
    });
  });
}

/* ================= АДМИН: ЖУРНАЛ И СОТРУДНИКИ ================= */
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
      '<tr><td colspan="4" class="muted" style="text-align:center;">Нет зарегистрированных сотрудников</td></tr>';
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

      if (
        confirm("Вы действительно хотите удалить сотрудника: " + name + "?")
      ) {
        const session = getSession();
        if (session && session.name === name) {
          clearSession();
          updateAuthUI();
        }
        try {
          await db.collection("employees").doc(id).delete();
        } catch (e) {
          alert("Ошибка удаления: " + e.message);
        }
      }
    });
  });
}

/* ================= ГРАФИК АКТИВНОСТИ (CHART.JS) ================= */
function updateWeeklyChart() {
  if (!adminOpen) return;
  const ctx = document.getElementById("weeklyChart");
  if (!ctx) return;

  const labels = [];
  const dataCounts = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = fmtDate(d);
    const labelFormatted = d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
    });
    labels.push(labelFormatted);

    const count = logsCache.filter(
      (l) => l.date === dateStr && l.type === "in",
    ).length;
    dataCounts.push(count);
  }

  if (weeklyChartInstance) {
    weeklyChartInstance.data.labels = labels;
    weeklyChartInstance.data.datasets[0].data = dataCounts;
    weeklyChartInstance.update();
  } else {
    weeklyChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Входов на кухню за день",
            data: dataCounts,
            backgroundColor: "#4caf50",
            borderRadius: 6,
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
document.getElementById("show-all").addEventListener("click", () => {
  document.getElementById("filter-date").value = "";
  renderTable();
});

document.getElementById("export-csv").addEventListener("click", () => {
  const rows = [["Дата", "Время", "Сотрудник", "Тип"]];
  logsCache.forEach((e) =>
    rows.push([e.date, e.time, e.name, e.type === "in" ? "Вход" : "Выход"]),
  );
  const csv =
    "\uFEFF" +
    rows.map((r) => r.map((c) => '"' + c + '"').join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  a.download = "kitchen-log.csv";
  a.click();
});

document.getElementById("clear-data").addEventListener("click", async () => {
  if (confirm("Удалить ВСЕ записи посещений?")) {
    try {
      const snapshot = await db.collection("logs").get();
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (e) {
      alert("Ошибка очистки: " + e.message);
    }
  }
});

/* ================= QR-КОДЫ ДВЕРЕЙ ================= */
function buildDoorQr() {
  const list = document.getElementById("door-qr-list");
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
    btn.className = "btn ghost";
    btn.textContent = "🖨 Печать";
    item.appendChild(holder);
    item.insertAdjacentHTML(
      "beforeend",
      '<div class="name">' + d.label + "</div>",
    );
    item.appendChild(btn);
    list.appendChild(item);
    if (typeof QRCode !== "undefined") {
      new QRCode(holder, { text: d.text, width: 150, height: 150 });
    }
    btn.addEventListener("click", () => {
      const win = window.open("", "_blank");
      win.document.write(
        "<html><head><title>" +
          d.label +
          '</title></head><body style="font-family:sans-serif;text-align:center;padding:40px">' +
          "<h2>" +
          d.label +
          "</h2>" +
          holder.innerHTML +
          "</body></html>",
      );
      win.document.close();
      win.print();
    });
  });
}

document.getElementById("filter-date").value = fmtDate(new Date());
buildDoorQr();
