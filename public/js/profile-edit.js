(async function () {
  const form = document.getElementById('profile-form');
  const alertBox = document.getElementById('form-alert');
  const rowsEl = document.getElementById('instrument-rows');
  const MAX_INSTRUMENTS = 10;

  const [me, opts, profileData] = await Promise.all([
    MF.loadMe(),
    MF.options(),
    MF.api('/api/profile').catch(() => ({ profile: null })),
  ]);
  if (!me) return;
  const profile = profileData.profile;

  function instrumentRow(selectedId = '', level = '') {
    const row = document.createElement('div');
    row.className = 'instrument-row';
    const n = rowsEl.children.length + 1;
    row.innerHTML =
      `<select aria-label="Instrument ${n}" data-role="instrument"><option value="">Choose instrument…</option>` +
      opts.instruments
        .map((i) => `<option value="${i.id}"${i.id === Number(selectedId) ? ' selected' : ''}>${MF.escape(i.name)}</option>`)
        .join('') +
      `</select><select aria-label="Skill level for instrument ${n}" data-role="level"><option value="">Skill level…</option>` +
      opts.skillLevels
        .map((s) => `<option value="${s}"${s === level ? ' selected' : ''}>${MF.capitalize(s)}</option>`)
        .join('') +
      `</select><button type="button" class="btn btn-secondary btn-small" aria-label="Remove instrument ${n}">Remove</button>`;
    row.querySelector('button').addEventListener('click', () => {
      if (rowsEl.children.length > 1) row.remove();
      else row.querySelectorAll('select').forEach((s) => (s.value = ''));
    });
    rowsEl.appendChild(row);
  }

  function checkboxes(containerId, name, items, selected) {
    document.getElementById(containerId).innerHTML = items
      .map(
        (item) =>
          `<label class="check"><input type="checkbox" name="${name}-option" value="${MF.escape(item.value)}"${
            selected.includes(item.value) ? ' checked' : ''
          }> ${MF.escape(item.label)}</label>`,
      )
      .join('');
  }

  // Fill the form.
  if (profile) {
    document.getElementById('page-title').textContent = 'Edit your profile';
    form.displayName.value = profile.displayName;
    form.zip.value = profile.zip;
    form.bio.value = profile.bio;
    profile.links.forEach((link, i) => {
      if (form[`link${i}`]) form[`link${i}`].value = link;
    });
    profile.instruments.forEach((i) => instrumentRow(i.id, i.skillLevel));
  }
  if (rowsEl.children.length === 0) instrumentRow();

  checkboxes(
    'genre-checks',
    'genre',
    opts.genres.map((g) => ({ value: String(g.id), label: g.name })),
    profile ? profile.genres.map((g) => String(g.id)) : [],
  );
  checkboxes(
    'availability-checks',
    'availability',
    opts.availability.map((a) => ({ value: a.key, label: a.label })),
    profile ? profile.availability : [],
  );

  const bioCount = document.getElementById('bio-count');
  const updateCount = () => (bioCount.textContent = `${form.bio.value.length} / 1000`);
  form.bio.addEventListener('input', updateCount);
  updateCount();

  document.getElementById('add-instrument').addEventListener('click', () => {
    if (rowsEl.children.length < MAX_INSTRUMENTS) instrumentRow();
  });

  function collect() {
    const instruments = [...rowsEl.querySelectorAll('.instrument-row')]
      .map((row) => ({
        instrumentId: Number(row.querySelector('[data-role="instrument"]').value) || null,
        skillLevel: row.querySelector('[data-role="level"]').value,
      }))
      .filter((i) => i.instrumentId || i.skillLevel);
    const checked = (name) => [...form.querySelectorAll(`input[name="${name}-option"]:checked`)].map((c) => c.value);
    return {
      displayName: form.displayName.value.trim(),
      instruments,
      genreIds: checked('genre').map(Number),
      zip: form.zip.value.trim(),
      availability: checked('availability'),
      bio: form.bio.value,
      links: [form.link0.value, form.link1.value, form.link2.value].map((l) => l.trim()).filter(Boolean),
    };
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    MF.setAlert(alertBox, '');
    const body = collect();

    const errors = {};
    if (!body.displayName) errors.displayName = 'Display name is required.';
    if (body.instruments.length === 0) errors.instruments = 'Add at least one instrument with a skill level.';
    else if (body.instruments.some((i) => !i.instrumentId || !i.skillLevel)) {
      errors.instruments = 'Choose both an instrument and a skill level in every row.';
    }
    if (!/^\d{5}$/.test(body.zip)) errors.zip = 'Enter a 5-digit US ZIP code.';
    if (Object.keys(errors).length) {
      MF.showFieldErrors(form, errors);
      MF.setAlert(alertBox, 'Please fix the highlighted fields.');
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    MF.setBusy(button, true, 'Saving…');
    try {
      const data = await MF.api('/api/profile', { method: 'PUT', body });
      window.location.href = data.redirectTo + '?saved=1';
    } catch (err) {
      MF.showFieldErrors(form, err.fields);
      MF.setAlert(alertBox, err.message);
      MF.setBusy(button, false);
    }
  });
})();
