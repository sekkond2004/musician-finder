/**
 * Shared browser code: a small API client, the site header, and form helpers.
 * Every page loads this file first.
 */
(function () {
  const MF = {};

  /** Call the JSON API. Throws an Error with .status, .code and .fields on failure. */
  MF.api = async function api(path, { method = 'GET', body } = {}) {
    const options = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetch(path, options);
    } catch {
      const err = new Error('Could not reach the server. Check your connection and try again.');
      err.status = 0;
      throw err;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const info = data.error || {};
      const err = new Error(info.message || 'Something went wrong. Please try again.');
      err.status = response.status;
      err.code = info.code;
      err.fields = info.fields || {};
      if (response.status === 401 && !path.startsWith('/api/auth/')) {
        window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
      }
      throw err;
    }
    return data;
  };

  MF.escape = function escape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  MF.initials = function initials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  };

  /** Stable colour per user id so avatars are easy to tell apart. */
  MF.avatarColor = function avatarColor(id) {
    const colors = ['#2d6a6a', '#7a2e5c', '#b23a48', '#3b5a8c', '#6a4c2d', '#4d6a2d'];
    return colors[Math.abs(Number(id) || 0) % colors.length];
  };

  MF.capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

  MF.distanceLabel = function distanceLabel(miles) {
    if (miles === null || miles === undefined) return '';
    if (miles < 1) return 'Less than 1 mile away';
    return miles === 1 ? '1 mile away' : miles + ' miles away';
  };

  let optionsPromise;
  MF.options = function options() {
    if (!optionsPromise) optionsPromise = MF.api('/api/options');
    return optionsPromise;
  };

  MF.availabilityLabel = function availabilityLabel(opts, key) {
    const found = opts.availability.find((a) => a.key === key);
    return found ? found.label : key;
  };

  /** Show server-side field errors next to their inputs. */
  MF.showFieldErrors = function showFieldErrors(form, fields) {
    form.querySelectorAll('[data-error-for]').forEach((el) => {
      el.textContent = '';
    });
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    let first = null;
    Object.entries(fields || {}).forEach(([name, message]) => {
      const slot = form.querySelector(`[data-error-for="${name}"]`);
      if (slot) slot.textContent = message;
      const input = form.querySelector(`[name="${name}"]`);
      if (input) {
        input.setAttribute('aria-invalid', 'true');
        if (!first) first = input;
      }
    });
    if (first) first.focus();
  };

  MF.setAlert = function setAlert(el, message, kind = 'error') {
    if (!el) return;
    el.className = 'alert alert-' + kind;
    el.textContent = message || '';
  };

  MF.setBusy = function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = busyText || 'Please wait…';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  };

  /** Safe redirect target from ?next= (same-site paths only). */
  MF.nextPath = function nextPath(fallback) {
    const next = new URLSearchParams(window.location.search).get('next');
    return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
  };

  /** Render the header nav for a signed-in or signed-out visitor. */
  MF.renderNav = function renderNav(me) {
    const nav = document.getElementById('site-nav');
    if (!nav) return;
    const here = window.location.pathname;
    const link = (href, label) =>
      `<a href="${href}"${here === href ? ' aria-current="page"' : ''}>${label}</a>`;
    if (me) {
      const profileHref = me.hasProfile ? `/musicians/${me.user.id}` : '/profile/edit';
      nav.innerHTML =
        link('/dashboard', 'Dashboard') +
        link('/search', 'Find musicians') +
        link(profileHref, 'My profile') +
        '<button type="button" class="linklike" id="logout-btn">Log out</button>';
      document.getElementById('logout-btn').addEventListener('click', MF.logout);
    } else {
      nav.innerHTML = link('/login', 'Log in') + '<a class="btn btn-primary btn-small" href="/register">Sign up</a>';
    }
  };

  MF.logout = async function logout() {
    try {
      await MF.api('/api/auth/logout', { method: 'POST' });
    } finally {
      // replace() so the back button doesn't return to a signed-in page.
      window.location.replace('/login?loggedOut=1');
    }
  };

  /** Load the current user (or null) and draw the nav. */
  MF.loadMe = async function loadMe() {
    try {
      const me = await MF.api('/api/auth/me');
      MF.renderNav(me);
      return me;
    } catch {
      MF.renderNav(null);
      return null;
    }
  };

  // Pages restored from the back/forward cache after logout re-check the session.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && document.body.dataset.auth === 'required') window.location.reload();
  });

  window.MF = MF;
})();
