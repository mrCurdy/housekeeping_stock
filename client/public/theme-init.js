// Runs before first paint (see index.html) to avoid a flash of the wrong theme or colour scheme.
try {
  var t = localStorage.getItem('theme') || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  var p = localStorage.getItem('palette');
  if (p === 'ocean' || p === 'berry') document.documentElement.dataset.palette = p;
} catch (e) {}
