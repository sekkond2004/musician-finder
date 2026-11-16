(function () {
  MF.renderNav(null);
  const form = document.getElementById('login-form');
  const alertBox = document.getElementById('form-alert');
  if (new URLSearchParams(window.location.search).get('loggedOut')) {
    document.getElementById('logged-out').hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    MF.setAlert(alertBox, '');
    document.getElementById('logged-out').hidden = true;
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) {
      MF.setAlert(alertBox, 'Enter your email and password.');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    MF.setBusy(button, true, 'Logging in…');
    try {
      const data = await MF.api('/api/auth/login', { method: 'POST', body: { email, password } });
      window.location.href = data.redirectTo === '/dashboard' ? MF.nextPath('/dashboard') : data.redirectTo;
    } catch (err) {
      // US-2: one generic message that never says which field was wrong.
      MF.setAlert(alertBox, err.message);
      form.password.value = '';
      form.password.focus();
      MF.setBusy(button, false);
    }
  });
})();
