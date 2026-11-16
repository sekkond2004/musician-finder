(async function () {
  const me = await MF.loadMe();
  if (!me) {
    window.location.replace('/login');
    return;
  }
  document.getElementById('greeting').textContent = me.displayName
    ? `Hi, ${me.displayName}!`
    : 'Welcome to Musician Finder!';
  document.getElementById('account-line').textContent = `Signed in as ${me.user.email}.`;
  if (me.hasProfile) {
    document.getElementById('view-profile-card').href = `/musicians/${me.user.id}`;
  } else {
    document.getElementById('profile-nudge').hidden = false;
  }
})();
