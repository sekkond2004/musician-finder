(function () {
  MF.renderNav(null);
  const form = document.getElementById('register-form');
  const alertBox = document.getElementById('form-alert');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    MF.setAlert(alertBox, '');
    const email = form.email.value.trim();
    const password = form.password.value;
    const confirm = form.confirm.value;

    // Quick checks in the browser; the server validates everything again.
    const errors = {};
    if (!email) errors.email = 'Enter your email address.';
    if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (password !== confirm) errors.confirm = 'Passwords do not match.';
    if (Object.keys(errors).length) {
      MF.showFieldErrors(form, errors);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    MF.setBusy(button, true, 'Creating account…');
    try {
      const data = await MF.api('/api/auth/register', { method: 'POST', body: { email, password } });
      window.location.href = data.redirectTo;
    } catch (err) {
      MF.showFieldErrors(form, err.fields);
      MF.setAlert(alertBox, err.message);
      MF.setBusy(button, false);
    }
  });
})();
