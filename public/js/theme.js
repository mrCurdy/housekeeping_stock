// Light / dark / system theme, same model as the boilerplate (data-theme on <html>, choice in localStorage).
// The first paint is handled by the inline script in index.html.
const ORDER = ['system', 'light', 'dark'];

export function useTheme() {
  const read = () => {
    try {
      const v = localStorage.getItem('theme');
      return ORDER.includes(v) ? v : 'system';
    } catch {
      return 'system';
    }
  };
  const theme = Vue.ref(read());
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const apply = () => {
    const dark = theme.value === 'dark' || (theme.value === 'system' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  };
  media.addEventListener('change', apply);

  const cycleTheme = () => {
    theme.value = ORDER[(ORDER.indexOf(theme.value) + 1) % ORDER.length];
    try { localStorage.setItem('theme', theme.value); } catch { /* storage unavailable */ }
    apply();
  };

  apply();
  return { theme, cycleTheme };
}
