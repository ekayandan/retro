/* Color scheme (palettes in themes.css). Loaded in <head>, after themes.css, so the saved scheme is on
 * <html data-theme> before the first paint. Settings calls Theme.set(); friends' controllers get the
 * host's scheme in the 'hello' message (link.js) and call Theme.set() too. */
const Theme = (() => {
  const KEY = 'retro.theme';
  const ALL = ['arcade', 'gameboy', 'nes', 'pico8', 'c64', 'zx', 'cga', 'dos', 'phosphor', 'amber'];
  const valid = (t) => (ALL.includes(t) ? t : 'arcade');
  let current = 'arcade';
  try { current = valid(localStorage.getItem(KEY)); } catch { /* storage blocked: default scheme */ }

  function apply() {
    document.documentElement.dataset.theme = current;
    // Phones color their status bar from <meta name="theme-color" data-themed>.
    const meta = document.querySelector('meta[name="theme-color"][data-themed]');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (meta && bg) meta.content = bg;
  }
  apply();

  return {
    all: ALL,
    get: () => current,
    set(t) {
      if (valid(t) === current) return;
      current = valid(t);
      try { localStorage.setItem(KEY, current); } catch { /* not saved, still applied */ }
      apply();
    },
  };
})();
