(async function () {
  const me = await MF.loadMe();
  if (me) {
    document.getElementById('hero-actions').innerHTML =
      '<a class="btn btn-primary" href="/search">Find musicians</a>' +
      '<a class="btn btn-secondary" href="/dashboard">Go to dashboard</a>';
  }
})();
