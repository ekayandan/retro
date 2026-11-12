// Box art comes from the libretro-thumbnails project on GitHub (CORS-enabled),
// is shrunk to a small JPEG and kept in IndexedDB, so the library works offline.
const Art = (() => {
  const REPO = {
    nes: 'https://raw.githubusercontent.com/libretro-thumbnails/Nintendo_-_Nintendo_Entertainment_System/master/',
  };
  const KINDS = ['Named_Boxarts', 'Named_Titles'];
  const REGION = { U: 'USA', E: 'Europe', J: 'Japan', W: 'World', UE: 'USA, Europe', JU: 'Japan, USA' };
  const RETRY_AFTER = 7 * 24 * 3600 * 1000; // try again weekly if nothing was found

  // "Super Mario Bros. (U) [!].nes" -> "Super Mario Bros. (USA)"
  function cleanTitle(fileName) {
    return fileName
      .replace(/\.[^.]+$/, '')
      .replace(/\s*\[[^\]]*\]/g, '')
      .replace(/\((U|E|J|W|UE|JU)\)/g, (_, r) => `(${REGION[r]})`)
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Bare display name without tags: "Super Mario Bros."
  function displayTitle(fileName) {
    return cleanTitle(fileName).replace(/\s*\([^)]*\)/g, '').trim() || fileName;
  }

  // libretro replaces these characters with "_" in file names
  const safe = (s) => s.replace(/[&*/:`<>?\\|"]/g, '_');

  function candidates(fileName) {
    const full = cleanTitle(fileName);
    const bare = displayTitle(fileName);
    const list = [full];
    for (const r of ['USA', 'World', 'USA, Europe', 'Europe', 'Japan']) list.push(`${bare} (${r})`);
    list.push(bare);
    return [...new Set(list.map(safe))];
  }

  async function shrink(blob, width = 240) {
    const bmp = await createImageBitmap(blob);
    const h = Math.round((bmp.height / bmp.width) * width);
    const c = document.createElement('canvas');
    c.width = width; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, width, h);
    return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  }

  async function find(game) {
    const base = REPO[game.system];
    if (!base) return null;
    for (const kind of KINDS) {
      for (const name of candidates(game.name)) {
        try {
          const r = await fetch(base + kind + '/' + encodeURIComponent(name) + '.png');
          if (r.ok) return shrink(await r.blob());
        } catch { return undefined; } // offline / network error: try another day
      }
    }
    return null; // not found
  }

  // Fetch art for one game if it's missing and we're online. Returns true if new art was stored.
  async function ensure(game, force = false) {
    if (!navigator.onLine || localStorage.getItem('retro.art') === 'off') return false;
    if (!force && (game.art === 'ok' || (game.art === 'none' && Date.now() - game.artTried < RETRY_AFTER))) return false;
    const blob = await find(game);
    if (blob === undefined) return false;
    game.artTried = Date.now();
    game.art = blob ? 'ok' : 'none';
    if (blob) await Store.put('art', game.id, blob);
    await Store.put('games', game.id, game);
    return !!blob;
  }

  return { ensure, displayTitle, candidates };
})();
