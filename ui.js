// Presentation-only controls. Attendance and Firebase logic stay in app.js.
document.querySelectorAll('[data-auth-mode]').forEach(button => {
  button.addEventListener('click', () => {
    const login = button.dataset.authMode === 'login';
    document.getElementById('login-panel').classList.toggle('hidden', !login);
    document.getElementById('register-panel').classList.toggle('hidden', login);
    document.querySelectorAll('[data-auth-mode]').forEach(item => {
      const selected = item === button;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    document.getElementById('auth-msg').textContent = '';
  });
});
