(async function () {
  const id = window.location.pathname.split('/').pop();
  const errorBox = document.getElementById('load-error');
  if (new URLSearchParams(window.location.search).get('saved')) {
    document.getElementById('saved').hidden = false;
  }
  if (document.referrer && new URL(document.referrer).pathname === '/search') {
    document.getElementById('back-link').addEventListener('click', (e) => {
      e.preventDefault();
      history.back();
    });
  }

  const [me, opts] = await Promise.all([MF.loadMe(), MF.options()]);
  if (!me) return;

  let musician;
  try {
    ({ musician } = await MF.api(`/api/musicians/${encodeURIComponent(id)}`));
  } catch (err) {
    MF.setAlert(errorBox, err.message);
    return;
  }

  document.title = `${musician.displayName} — Musician Finder`;
  const avatar = document.getElementById('avatar');
  avatar.textContent = MF.initials(musician.displayName);
  avatar.style.background = MF.avatarColor(musician.id);
  document.getElementById('name').textContent = musician.displayName;
  document.getElementById('distance').textContent = musician.isOwnProfile
    ? 'This is your profile'
    : MF.distanceLabel(musician.distanceMiles);

  document.getElementById('instruments').innerHTML = musician.instruments
    .map((i) => `<div>${MF.escape(i.name)} <span class="skill">— ${MF.escape(MF.capitalize(i.skillLevel))}</span></div>`)
    .join('');
  document.getElementById('genres').innerHTML = musician.genres.length
    ? `<div class="tags">${musician.genres.map((g) => `<span class="tag">${MF.escape(g.name)}</span>`).join('')}</div>`
    : '<span class="muted">Not listed</span>';
  document.getElementById('availability').textContent = musician.availability.length
    ? musician.availability.map((a) => MF.availabilityLabel(opts, a)).join(', ')
    : 'Not listed';
  const bio = document.getElementById('bio');
  bio.textContent = musician.bio || 'No bio yet.';
  if (!musician.bio) bio.classList.add('muted');
  document.getElementById('links').innerHTML = musician.links.length
    ? musician.links
        .map((l) => `<div><a href="${MF.escape(l)}" target="_blank" rel="noopener noreferrer nofollow">${MF.escape(l)}</a></div>`)
        .join('')
    : '<span class="muted">None yet</span>';

  const actions = document.getElementById('actions');
  if (musician.isOwnProfile) {
    actions.innerHTML = '<a class="btn btn-primary" href="/profile/edit">Edit profile</a>';
  } else {
    actions.innerHTML = `<button type="button" class="btn btn-primary" disabled aria-describedby="message-note">Message ${MF.escape(
      musician.displayName.split(' ')[0],
    )}</button>`;
    document.getElementById('message-note').hidden = false;
  }
  document.getElementById('profile').hidden = false;
})();
