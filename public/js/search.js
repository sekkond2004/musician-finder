(async function () {
  const form = document.getElementById('search-form');
  const resultsEl = document.getElementById('results');
  const countEl = document.getElementById('results-count');
  const alertBox = document.getElementById('search-alert');
  const emptyEl = document.getElementById('empty');
  const widenBtn = document.getElementById('widen');
  const pager = document.getElementById('pager');

  const [me, opts] = await Promise.all([MF.loadMe(), MF.options()]);
  if (!me) return;
  if (!me.hasProfile) {
    document.getElementById('profile-required').hidden = false;
    document.getElementById('search-layout').hidden = true;
    return;
  }

  const fill = (select, items) => {
    select.insertAdjacentHTML(
      'beforeend',
      items.map((i) => `<option value="${MF.escape(i.value)}">${MF.escape(i.label)}</option>`).join(''),
    );
  };
  fill(form.instrument, opts.instruments.map((i) => ({ value: i.id, label: i.name })));
  fill(form.genre, opts.genres.map((g) => ({ value: g.id, label: g.name })));
  fill(form.skill, opts.skillLevels.map((s) => ({ value: s, label: MF.capitalize(s) })));
  fill(form.distance, opts.distances.map((d) => ({ value: d, label: `${d} miles` })));

  // Filters live in the URL so a search can be bookmarked or shared and the back button works.
  function readUrl() {
    const params = new URLSearchParams(window.location.search);
    form.instrument.value = params.get('instrument') || '';
    form.genre.value = params.get('genre') || '';
    form.skill.value = params.get('skill') || '';
    form.distance.value = params.get('distance') || '25';
    return Number(params.get('page')) || 1;
  }

  function currentParams(page) {
    const params = new URLSearchParams();
    ['instrument', 'skill', 'genre', 'distance'].forEach((name) => {
      if (form[name].value) params.set(name, form[name].value);
    });
    if (page > 1) params.set('page', String(page));
    return params;
  }

  function renderResult(m) {
    const instruments = m.instruments
      .map((i) => `<span class="tag inst">${MF.escape(i.name)} · ${MF.escape(MF.capitalize(i.skillLevel))}</span>`)
      .join('');
    const genres = m.genres.map((g) => `<span class="tag">${MF.escape(g.name)}</span>`).join('');
    return `<li class="card result">
      <span class="avatar" style="background:${MF.avatarColor(m.id)}" aria-hidden="true">${MF.escape(MF.initials(m.displayName))}</span>
      <div>
        <a class="name" href="/musicians/${m.id}">${MF.escape(m.displayName)}</a>
        <div class="tags">${instruments}</div>
        <div class="tags">${genres}</div>
      </div>
      <span class="distance">${MF.escape(MF.distanceLabel(m.distanceMiles))}</span>
    </li>`;
  }

  let state = { page: 1, totalPages: 1 };

  async function runSearch(page, { push = true } = {}) {
    MF.setAlert(alertBox, '');
    const params = currentParams(page);
    if (push) history.pushState(null, '', `/search${params.toString() ? '?' + params : ''}`);
    countEl.textContent = 'Searching…';
    try {
      const data = await MF.api(`/api/musicians?${params}`);
      state = { page: data.page, totalPages: data.totalPages };
      resultsEl.innerHTML = data.results.map(renderResult).join('');
      countEl.textContent = data.total
        ? `${data.total} musician${data.total === 1 ? '' : 's'} within ${data.filters.distance} miles`
        : '';
      emptyEl.hidden = data.total !== 0;
      document.getElementById('empty-message').textContent = data.suggestion || '';
      widenBtn.hidden = !data.widerDistance;
      widenBtn.dataset.distance = data.widerDistance || '';
      widenBtn.textContent = data.widerDistance ? `Search within ${data.widerDistance} miles` : '';
      pager.hidden = data.totalPages <= 1;
      document.getElementById('page-info').textContent = `Page ${data.page} of ${data.totalPages}`;
      document.getElementById('prev').disabled = data.page <= 1;
      document.getElementById('next').disabled = data.page >= data.totalPages;
    } catch (err) {
      countEl.textContent = '';
      resultsEl.innerHTML = '';
      MF.setAlert(alertBox, err.message);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch(1);
  });
  document.getElementById('reset-filters').addEventListener('click', () => {
    form.reset();
    form.distance.value = '25';
    runSearch(1);
  });
  widenBtn.addEventListener('click', () => {
    form.distance.value = widenBtn.dataset.distance;
    runSearch(1);
  });
  document.getElementById('prev').addEventListener('click', () => runSearch(state.page - 1));
  document.getElementById('next').addEventListener('click', () => {
    runSearch(state.page + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('popstate', () => runSearch(readUrl(), { push: false }));

  runSearch(readUrl(), { push: false });
})();
