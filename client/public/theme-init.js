// Runs before first paint (see index.html) to avoid a flash of the wrong theme.
try {
  var t = localStorage.getItem('theme') || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch (e) {}
