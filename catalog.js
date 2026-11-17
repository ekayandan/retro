/* Game catalog page: browse every known game for each system, offered or planned.
 * Data: catalog/index.json and catalog/data/<system>.json, built by tools/build-catalog.js. */
(() => {
  const $ = (s) => document.querySelector(s);
  const TIERS = [
    ['offered', 'Plays here now'],
    ['browser', 'Coming to the browser'],
    ['desktop', 'Desktop app & hosted'],
  ];
  const KIND_LABEL = { proto: 'Proto', beta: 'Beta', demo: 'Demo', pirate: 'Pirate', homebrew: 'Homebrew', unlicensed: 'Unl', app: 'App', hack: 'Hack', bios: 'BIOS' };
  const PAGE = 120;

  let systems = [];
  let current = null;   // { sys, data }
  let list = [];        // filtered titles
  let shown = 0;
  const cache = new Map();

  const params = new URLSearchParams(location.search);
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };
  const fmt = (n) => n.toLocaleString('en');

  // libretro-thumbnails names files after the release, with these characters replaced by "_"
  const artUrl = (base, name, kind = 'Named_Boxarts') =>
    base + kind + '/' + encodeURIComponent(name.replace(/[&*/:`<>?\\|"]/g, '_')) + '.png';

  // Try each release's box art in turn (they're named per region), then give up and show the title.
  function artImg(t, base, onFail) {
    const names = t.releases.slice(0, 3).map((r) => r.name);
    const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
    let i = 0;
    img.onerror = () => { if (++i < names.length) img.src = artUrl(base, names[i]); else onFail(); };
    img.src = artUrl(base, names[0]);
    return img;
  }

  async function init() {
    let index;
    try {
      index = await (await fetch('catalog/index.json')).json();
    } catch {
      $('#summary').textContent = 'The catalog data isn’t built yet. Run: node tools/build-catalog.js';
      return;
    }
    systems = index.systems;
    const nav = $('#systems');
    for (const [tier, label] of TIERS) {
      const row = el('div');
      for (const s of systems.filter((x) => x.tier === tier)) {
        const b = el('button', { className: 'chip', type: 'button', title: `${s.maker}, ${s.year}` }, s.name, el('small', { textContent: fmt(s.stats.retail) }));
        b.dataset.id = s.id;
        b.setAttribute('aria-pressed', 'false');
        b.onclick = () => pick(s.id);
        row.append(b);
      }
      if (row.children.length) nav.append(el('section', { className: 'cat-tier' }, el('h2', { textContent: label }), row));
    }
    $('#q').value = params.get('q') || '';
    $('#extra').checked = params.get('all') === '1';
    for (const id of ['#q', '#genre', '#decade', '#players', '#sort', '#extra']) $(id).addEventListener('input', () => { filter(); save(); });
    new IntersectionObserver((e) => { if (e[0].isIntersecting) more(); }, { rootMargin: '800px' }).observe($('#more'));
    $('#detail').addEventListener('click', (e) => { if (e.target === $('#detail')) $('#detail').close(); });
    await pick(systems.some((s) => s.id === params.get('system')) ? params.get('system') : systems[0].id, true);
  }

  async function pick(id, keepFilters = false) {
    const sys = systems.find((s) => s.id === id);
    document.querySelectorAll('.chip').forEach((c) => {
      c.setAttribute('aria-pressed', String(c.dataset.id === id));
      if (c.dataset.id === id) c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // phones: rows scroll sideways
    });
    $('#summary').textContent = 'Loading ' + sys.name + '…';
    let data = cache.get(id);
    if (!data) {
      try {
        data = await (await fetch(`catalog/data/${id}.json`)).json();
      } catch {
        $('#summary').textContent = `Couldn’t load ${sys.name}.`;
        return;
      }
      cache.set(id, data);
    }
    current = { sys, data };
    // Genre and decade lists come from this system's games
    const genres = [...new Set(data.titles.flatMap((t) => (t.genre ? t.genre.split(/\s*[/,]\s*/) : [])))].sort();
    const decades = [...new Set(data.titles.filter((t) => t.year).map((t) => Math.floor(t.year / 10) * 10))].sort();
    fillSelect('#genre', 'All genres', genres.map((g) => [g, g]), keepFilters ? params.get('genre') : '');
    fillSelect('#decade', 'Any year', decades.map((d) => [d, d + 's']), keepFilters ? params.get('decade') : '');
    if (keepFilters) {
      $('#players').value = params.get('players') || '';
      $('#sort').value = params.get('sort') || 'title';
    }
    filter();
    save();
  }

  function fillSelect(sel, all, options, value) {
    const s = $(sel);
    s.replaceChildren(el('option', { value: '', textContent: all }), ...options.map(([v, label]) => el('option', { value: v, textContent: label })));
    s.value = options.some(([v]) => String(v) === value) ? value : '';
  }

  function filter() {
    if (!current) return;
    const q = $('#q').value.trim().toLowerCase();
    const genre = $('#genre').value, decade = +$('#decade').value, players = +$('#players').value;
    const extra = $('#extra').checked, sort = $('#sort').value;
    list = current.data.titles.filter((t) => {
      if (!extra && t.kind) return false;
      if (genre && !(t.genre && t.genre.split(/\s*[/,]\s*/).includes(genre))) return false;
      if (decade && !(t.year >= decade && t.year < decade + 10)) return false;
      if (players && !(t.players >= players)) return false;
      if (q) {
        const hay = [t.title, t.dev, t.pub, t.franchise, ...t.releases.flatMap((r) => [r.name, ...(r.serial || [])])].join('\n').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort !== 'title') {
      const dir = sort === 'year' ? 1 : -1;
      list = [...list].sort((a, b) => (a.year ? 0 : 1) - (b.year ? 0 : 1) || dir * ((a.year || 0) - (b.year || 0)) || a.title.localeCompare(b.title));
    }
    const { sys, data } = current;
    const c = data.stats.coverage;
    $('#summary').replaceChildren(
      el('b', { textContent: `${fmt(list.length)} ${list.length === 1 ? 'game' : 'games'}` }),
      ` · ${sys.name} (${sys.maker}, ${sys.year}) · from ${data.source.list} ${data.source.version || ''} · known: year ${c.year}%, genre ${c.genre}%, developer ${c.dev}%, players ${c.players}%`,
    );
    $('#grid').replaceChildren();
    shown = 0;
    more();
  }

  function more() {
    if (!current || shown >= list.length) return;
    const base = current.data.thumbnails;
    const frag = document.createDocumentFragment();
    for (const t of list.slice(shown, shown + PAGE)) {
      const art = el('div', { className: 'cat-art' });
      const noart = () => art.replaceChildren(el('div', { className: 'noart', textContent: t.title }), ...tag());
      const tag = () => (t.kind ? [el('span', { className: 'tag', textContent: KIND_LABEL[t.kind] || t.kind })] : []);
      art.append(artImg(t, base, noart), ...tag());
      const sub = [t.year, t.genre].filter(Boolean).join(' · ');
      const btn = el('button', { className: 'cat-card', type: 'button' }, art, el('b', { textContent: t.title }), sub ? el('span', { textContent: sub }) : null);
      btn.onclick = () => openDetail(t);
      frag.append(el('li', {}, btn));
    }
    shown += PAGE;
    $('#grid').append(frag);
  }

  function openDetail(t) {
    const { sys, data } = current;
    $('#d-sys').textContent = sys.name;
    $('#d-title').textContent = t.title;
    const img = $('#d-art');
    img.removeAttribute('src');
    const names = t.releases.map((r) => r.name);
    let i = 0;
    img.onerror = () => { if (++i < Math.min(names.length, 4)) img.src = artUrl(data.thumbnails, names[i]); else img.removeAttribute('src'); };
    img.src = artUrl(data.thumbnails, names[0]);
    const facts = [
      ['Released', t.year], ['Developer', t.dev], ['Publisher', t.pub], ['Genre', t.genre],
      ['Players', t.players], ['Series', t.franchise], ['ESRB', t.esrb], ['Regions', t.regions?.join(', ')],
    ].filter(([, v]) => v);
    $('#d-facts').replaceChildren(...facts.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: String(v) })]));
    $('#d-releases').replaceChildren(...t.releases.map((r) => el('tr', {},
      el('td', {}, r.name, r.discs ? ` · ${r.discs} discs` : '', r.kind ? el('span', { className: 'tag', textContent: KIND_LABEL[r.kind] || r.kind }) : null),
      el('td', { textContent: r.year || '' }),
      el('td', { textContent: (r.serial || []).join(', ') }),
      el('td', { textContent: (r.crc || []).join(' ') }),
    )));
    $('#detail').showModal();
  }

  // Keep the view in the address bar so it can be shared or bookmarked
  function save() {
    if (!current) return;
    const p = new URLSearchParams({ system: current.sys.id });
    const add = (k, v) => { if (v) p.set(k, v); };
    add('q', $('#q').value.trim()); add('genre', $('#genre').value); add('decade', $('#decade').value);
    add('players', $('#players').value); add('sort', $('#sort').value === 'title' ? '' : $('#sort').value);
    add('all', $('#extra').checked ? '1' : '');
    history.replaceState(null, '', '?' + p);
    for (const [k, v] of p) params.set(k, v);
  }

  init();
})();
