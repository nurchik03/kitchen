<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Учёт посещений кухни</title>
  <link rel="stylesheet" href="style.css">
  <base target="_blank">
  <!-- Firebase SDK -->
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>
</head>
<body>
<header class="top">
  <h1>🍳 Учёт посещений кухни</h1>
  <nav class="tabs" id="tabs">
    <button class="tab" data-tab="scan">📷 Сканер</button>
    <button class="tab active" data-tab="auth">🔑 Вход</button>
    <button class="tab" data-tab="admin" id="admin-tab">📋 Админ-панель</button>
  </nav>
</header>

<!-- ===== СКАНЕР ===== -->
<section id="scan" class="page">
  <div class="card">
    <h2 class="card-title">Отметка через QR-код</h2>
    <div id="scan-user" class="scan-user"></div>
    <p class="muted">Наведите камеру на QR-код у двери.</p>

    <div id="reader" class="reader"></div>

    <div id="result" class="result hidden">
      <div id="result-icon">✅</div>
      <div id="result-text"></div>
    </div>
    <div id="cam-status" class="muted last-scan"></div>
  </div>
</section>

<!-- ===== ВХОД / РЕГИСТРАЦИЯ ===== -->
<section id="auth" class="page active">
  <div class="card">
    <div id="auth-forms">
      <h2 class="card-title">Вход</h2>
      <div class="form">
        <input type="text" id="login-name" placeholder="Имя (как при регистрации)">
        <input type="password" id="login-pass" placeholder="Пароль">
        <button id="login-btn" class="btn">Войти</button>
      </div>
      <hr class="sep">
      <h2 class="card-title">Регистрация (один раз)</h2>
      <div class="form">
        <input type="text" id="reg-name" placeholder="Имя и фамилия, напр. Иван Петров">
        <input type="password" id="reg-pass" placeholder="Придумайте пароль">
        <input type="password" id="reg-pass2" placeholder="Повторите пароль">
        <button id="reg-btn" class="btn ghost">Зарегистрироваться</button>
      </div>
      <div id="auth-msg" class="last-scan"></div>
    </div>

    <div id="logged-view" class="hidden">
      <h2 class="card-title">Вы вошли ✅</h2>
      <p id="logged-name" style="font-size:18px"></p>
      <p class="muted" style="margin:6px 0 14px">Переходите на вкладку «📷 Сканер», чтобы отметиться.</p>
      <button id="logout-btn" class="btn danger">Выйти из аккаунта</button>
    </div>
  </div>
</section>

<!-- ===== АДМИН (по паролю) ===== -->
<section id="admin" class="page">
  <div class="card" id="admin-lock">
    <h2 class="card-title">🔒 Админ-панель</h2>
    <p class="muted">Введите пароль администратора.</p>
    <div class="form">
      <input type="password" id="admin-pass" placeholder="Пароль администратора">
      <button id="admin-unlock" class="btn">Открыть</button>
    </div>
    <div id="admin-lock-msg" class="last-scan"></div>
  </div>

  <div id="admin-content" class="hidden">
    <div class="card">
      <div class="admin-toolbar">
        <label>Дата: <input type="date" id="filter-date"></label>
        <button id="show-all" class="btn ghost">Все записи</button>
        <button id="export-csv" class="btn">⬇ Экспорт CSV</button>
        <button id="clear-data" class="btn danger">🗑 Очистить журнал</button>
      </div>
      <div class="table-wrap">
        <table id="log-table">
          <thead><tr><th>Дата</th><th>Время</th><th>Сотрудник</th><th>Тип</th></tr></thead>
          <tbody></tbody>
        </table>
        <p id="empty-msg" class="muted">Пока нет записей.</p>
      </div>

      <details class="manual qr-gen">
        <summary>👥 Список сотрудников</summary>
        <div class="table-wrap" style="margin-top:10px">
          <table id="emp-table">
            <thead><tr><th>Имя</th><th>Зарегистрирован</th><th>Действие</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </details>

      <details class="manual qr-gen">
        <summary>🔳 QR-коды для дверей (распечатать и повесить)</summary>
        <div id="door-qr-list" class="qr-list"></div>
        <p class="muted" style="margin-top:10px">Левый — у входа, правый — у выхода.</p>
      </details>

      <button id="admin-lock-btn" class="btn ghost" style="margin-top:16px">🔒 Закрыть админку</button>
    </div>
  </div>
</section>

<script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
<script src="app.js"></script>
</body>
</html>
