/* ================= НАСТРОЙКА FIREBASE ================= */
// ⚠️ ЗАМЕНИТЕ эти данные на конфигурацию вашего проекта из консоли Firebase (firebase.google.com)
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
const COOLDOWN_MS = 15000;

let employeesCache = [];
let logsCache = [];

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

/* ================= СИНХРОНИЗАЦИЯ С ОБЛАКОМ (REALTIME) ================= */
// Слушаем сотрудников в реальном времени
db.collection("employees").onSnapshot((snapshot) => {
  employeesCache = [];
  snapshot.forEach((doc) => {
    employeesCache.push({ id: doc.id, ...doc.data() });
  });
  renderEmployees();
  updateAuthUI();
});

// Слушаем журнал посещений в реальном времени
db.collection("logs")
  .orderBy("ts", "desc")
  .onSnapshot((snapshot) => {
    logsCache = [];
    snapshot.forEach((doc) => {
      logsCache.push({ id: doc.id, ...doc.data() });
    });
    renderTable();
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
    // Добавляем сотрудника в Firestore (облако)
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

["reg-name", "reg-pass", "reg-pass2"].forEach((id) =>
  document.getElementById(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("reg-btn").click();
  }),
);

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

["login-name", "login-pass"].forEach((id) =>
  document.getElementById(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("login-btn").click();
  }),
);

document.getElementById("logout-btn").addEventListener("click", () => {
  clearSession();
  updateAuthUI();
});

/* ================= СОСТОЯНИЕ АВТОРИЗАЦИИ ================= */
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
  } else {
    document.getElementById("scan-user").style.display = "none";
  }
}

/* ================= СКАНИРОВАНИЕ ================= */
let lastScan = { type: null, time: 0 };

async function handleScan(text) {
  const code = (text || "").trim();
  const now = new Date();
  const nowMs = now.getTime();

  const isIn = code === QR_ENTRANCE;
  const isOut = code === QR_EXIT;
  if (!isIn && !isOut) {
    showResult(false, "❌ Это не QR-код кухни. Сканируйте код на двери.");
    return;
  }

  const user = currentUser();
  if (!user) {
    showResult(false, "❌ Сначала войдите в аккаунт.");
    return;
  }

  const type = isIn ? "in" : "out";
  if (type === lastScan.type && nowMs - lastScan.time < COOLDOWN_MS) {
    showResult(false, "⏳ Уже отмечено.");
    return;
  }
  lastScan = { type, time: nowMs };

  try {
    // Сохраняем отметку в облако
    await db.collection("logs").add({
      ts: nowMs,
      date: fmtDate(now),
      time: fmtTime(now),
      name: user.name,
      type: type,
    });

    showResult(
      true,
      (type === "in"
        ? "👋 " + esc(user.name) + " — пришёл на работу"
        : "🚪 " + esc(user.name) + " — ушёл с работы") +
        "<br><span class='muted'>" +
        fmtTime(now) +
        " · " +
        fmtDate(now) +
        "</span>",
    );
  } catch (e) {
    showResult(false, "❌ Ошибка сохранения: " + e.message);
  }
}

function showResult(ok, html) {
  const box = document.getElementById("result");
  box.classList.remove("hidden", "bad");
  if (!ok) box.classList.add("bad");
  document.getElementById("result-icon").textContent = ok ? "✅" : "⚠️";
  document.getElementById("result-text").innerHTML = html;
  clearTimeout(showResult._t);
  showResult._t = setTimeout(() => box.classList.add("hidden"), 8000);
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
    status.textContent =
      "⚠️ Камера недоступна: " +
      e.message +
      ". Сайт должен открываться по HTTPS или на localhost.";
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
  } else {
    msg.textContent = "❌ Неверный пароль.";
  }
}

document.getElementById("admin-lock-btn").addEventListener("click", () => {
  adminOpen = false;
  document.getElementById("admin-lock").classList.remove("hidden");
  document.getElementById("admin-content").classList.add("hidden");
});

/* ================= АДМИН: ЖУРНАЛ ================= */
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
    tr.innerHTML =
      "<td>" +
      e.date +
      "</td>" +
      "<td>" +
      e.time +
      "</td>" +
      "<td>" +
      esc(e.name) +
      "</td>" +
      '<td><span class="badge ' +
      e.type +
      '">' +
      (e.type === "in" ? "Вход" : "Выход") +
      "</span></td>";
    tbody.appendChild(tr);
  });
}

function renderEmployees() {
  if (!adminOpen) return;
  const tbody = document.querySelector("#emp-table tbody");
  tbody.innerHTML = "";

  if (employeesCache.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="3" class="muted" style="text-align:center;">Нет зарегистрированных сотрудников</td>';
    tbody.appendChild(tr);
    return;
  }

  employeesCache.forEach((e) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" +
      esc(e.name) +
      "</td>" +
      "<td>" +
      (e.regDate || "—") +
      "</td>" +
      '<td><button class="btn danger sm del-emp-btn" data-id="' +
      e.id +
      '" data-name="' +
      esc(e.name) +
      '">Удалить</button></td>';
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

document.getElementById("filter-date").addEventListener("change", renderTable);
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
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
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

/* ================= ИНИЦИАЛИЗАЦИЯ ================= */
document.getElementById("filter-date").value = fmtDate(new Date());
buildDoorQr();
