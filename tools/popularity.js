// Popularity for the catalog, from Wikidata (CC0) and Wikipedia pageviews (Wikimedia, CC0):
//   wiki  = how many Wikipedia language editions have an article about the game (how well known it is)
//   views = English Wikipedia views of that article over the last 60 days (how much interest there is now)
// A game is matched to Wikidata by its name (English or language-neutral label, or an alias) on the same platform.
// Used by tools/build-catalog.js --popularity. Pageviews are cached in .cache/ for the day.
//
// Node's fetch only goes through an HTTPS proxy with NODE_USE_ENV_PROXY=1 (Node >= 22.21).

const fs = require('fs');
const path = require('path');

const UA = 'RetroCatalogBuilder/0.1 (https://github.com/ekayandan/retro; game catalog build)';
const CACHE_DIR = path.join(__dirname, '..', '.cache');
const VIEWS_CACHE = path.join(CACHE_DIR, 'pageviews.json');

async function getJson(url, init = {}, tries = 4) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...init.headers } });
      if (r.status === 404) return null;
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) throw new Error(`${r.status} ${url.slice(0, 120)}`);
    } catch (e) {
      if (attempt >= tries || /^\d{3} /.test(e.message)) throw e;
    }
    if (attempt >= tries) throw new Error(`${r?.status} ${url.slice(0, 120)}`);
    const wait = Math.min(+r?.headers.get('retry-after') || 2 ** attempt, 30);
    await new Promise((res) => setTimeout(res, wait * 1000));
  }
}

// Every game on these platforms: its names, how many Wikipedias cover it, its English article.
async function wikidataGames(platforms) {
  const query = `SELECT ?g ?links ?article (GROUP_CONCAT(DISTINCT ?name; separator="\\u001f") AS ?names) WHERE {
    VALUES ?p { ${platforms.map((q) => 'wd:' + q).join(' ')} }
    ?g wdt:P400 ?p; wikibase:sitelinks ?links.
    FILTER NOT EXISTS { ?g wdt:P31 ?series VALUES ?series { wd:Q7058673 wd:Q196600 } } # game series, media franchises
    { ?g rdfs:label ?name } UNION { ?g skos:altLabel ?name }
    FILTER(LANG(?name) IN ("en", "mul"))
    OPTIONAL { ?article schema:about ?g; schema:isPartOf <https://en.wikipedia.org/> }
  } GROUP BY ?g ?links ?article`;
  const res = await getJson('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'query=' + encodeURIComponent(query),
  });
  return res.results.bindings.map((b) => ({
    qid: b.g.value.split('/').pop(),
    wiki: +b.links.value,
    article: b.article ? decodeURIComponent(b.article.value.split('/wiki/')[1]).replace(/_/g, ' ') : undefined,
    names: b.names.value.split('\u001f'),
  }));
}

// English Wikipedia views over the last 60 days (the most the API gives), 50 articles per request.
// All or nothing: if Wikipedia refuses (it rate-limits shared cloud addresses), returns null and the system
// is ranked by Wikidata alone, so games with and without view counts are never mixed in one ranking.
let viewsRefused = false; // once Wikipedia says no, don't ask again for every system
async function pageviews(articles) {
  if (viewsRefused) return null;
  const today = new Date().toISOString().slice(0, 10);
  let cache = { day: today, views: {} };
  try {
    const c = JSON.parse(fs.readFileSync(VIEWS_CACHE, 'utf8'));
    if (c.day === today) cache = c;
  } catch { /* no cache yet */ }
  const todo = [...new Set(articles)].filter((a) => cache.views[a] === undefined);
  try {
    for (let i = 0; i < todo.length; i += 50) {
      const batch = todo.slice(i, i + 50);
      // Redirects aren't followed: a game whose article redirects to its developer or series page counts only
      // the visits that came through its own name, not the whole page's
      const base = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=pageviews&pvipdays=60'
        + '&maxlag=5&titles=' + encodeURIComponent(batch.join('|'));
      // The API answers for part of the batch at a time and says where to continue
      for (let cont = ''; ;) {
        const res = await getJson(base + cont, {}, 2); // give up quickly: a refusal here usually lasts
        for (const pg of res.query.pages) {
          if (pg.pageviews) cache.views[pg.title] = Object.values(pg.pageviews).reduce((n, v) => n + (v || 0), 0);
        }
        if (!res.continue) break;
        cont = '&' + new URLSearchParams(res.continue);
      }
      for (const t of batch) if (cache.views[t] === undefined) cache.views[t] = 0;
    }
  } catch (e) {
    console.warn('\n  pageviews unavailable, ranking by Wikidata only from here on:', e.message);
    viewsRefused = true;
    return null;
  } finally {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(VIEWS_CACHE, JSON.stringify(cache));
  }
  return cache.views;
}

// Adds wiki / views / wp (the English Wikipedia article) to the catalog's titles. norm() is the catalog's
// name normalizer, so "Legend of Zelda, The - A Link to the Past" meets "The Legend of Zelda: A Link to the Past".
async function addPopularity(catalog, platforms, norm, baseTitle, opts = {}) {
  const games = await wikidataGames(platforms);
  const matched = matchGames(catalog.titles, games, norm, baseTitle);
  mergeSameGame(catalog, matched);
  const views = opts.views === false ? null : await pageviews([...matched.values()].map((g) => g.article).filter(Boolean));
  for (const [t, g] of matched) {
    t.wiki = g.wiki;
    if (g.article) t.wp = g.article;
    if (views && g.article) t.views = views[g.article] || 0;
  }
  catalog.popularity = views
    ? { source: 'Wikidata + English Wikipedia pageviews (CC0)', viewsDays: 60, date: new Date().toISOString().slice(0, 10) }
    : { source: 'Wikidata (CC0)', date: new Date().toISOString().slice(0, 10) };
  return { wikidataGames: games.length, matched: matched.size };
}

// Regional names of one game ("EarthBound" / "Mother 2", "Donkey Kong Country" / "Super Donkey Kong") are
// separate titles in the catalog until Wikidata says they're the same game; then they become one title, named
// after its English-language release.
const ENGLISH = /\((?:[^)]*, )?(USA|World|Europe|UK|Australia)[,)]/;
function mergeSameGame(catalog, matched) {
  const byGame = new Map();
  for (const [t, g] of matched) {
    if (!byGame.has(g.qid)) byGame.set(g.qid, []);
    byGame.get(g.qid).push(t);
  }
  const gone = new Set();
  for (const group of byGame.values()) {
    if (group.length < 2) continue;
    const score = (t) => (t.kind ? 0 : 4) + (ENGLISH.test(t.releases[0].name) ? 2 : 0) + t.releases.length / 1000;
    group.sort((a, b) => score(b) - score(a));
    const [keep, ...rest] = group;
    for (const t of rest) {
      keep.releases.push(...t.releases);
      keep.regions = [...new Set([...(keep.regions || []), ...(t.regions || [])])];
      if (t.year && !(keep.year <= t.year)) keep.year = t.year;
      for (const f of ['dev', 'pub', 'genre', 'franchise', 'esrb', 'players']) if (keep[f] === undefined && t[f] !== undefined) keep[f] = t[f];
      if (!t.kind) delete keep.kind;
      matched.delete(t);
      gone.add(t);
    }
  }
  if (gone.size) catalog.titles = catalog.titles.filter((t) => !gone.has(t));
}

// Catalog title -> Wikidata game, by any of the game's names against the title or any release's bare name.
function matchGames(titles, games, norm, baseTitle) {
  const byName = new Map();
  for (const g of games) {
    for (const n of g.names) {
      const k = norm(n);
      if (!k) continue;
      const cur = byName.get(k);
      if (!cur || g.wiki > cur.wiki) byName.set(k, g); // same name twice on one platform: the better-known one
    }
  }
  const matched = new Map();
  for (const t of titles) {
    const keys = [t.title, ...t.releases.map((r) => baseTitle(r.name))].map(norm);
    const g = keys.map((k) => byName.get(k)).find(Boolean);
    if (g) matched.set(t, g);
  }
  return matched;
}

module.exports = { addPopularity, matchGames, mergeSameGame };
