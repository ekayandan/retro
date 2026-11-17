#!/usr/bin/env node
// Builds catalog/<system>.json from public game lists: No-Intro (cartridges) and Redump (discs) as collected
// by libretro-database, joined with its metadata (developer, publisher, genre, year, players, franchise,
// ESRB, serial). Only facts about games are kept: no game files, no descriptions, no images.
//
//   node tools/build-catalog.js                      download from GitHub (raw.githubusercontent.com)
//   node tools/build-catalog.js --src ../libretro-database   use a local clone instead (much faster)
//   node tools/build-catalog.js --only snes,psx      just these systems
//   node tools/build-catalog.js --popularity         also add popularity from Wikidata + Wikipedia pageviews
//                                                    (needs query.wikidata.org and wikimedia.org; behind a proxy
//                                                    run with NODE_USE_ENV_PROXY=1); --no-views skips the pageviews
//
// libretro-database is CC BY-SA 4.0, so the generated files are too (see catalog/README.md).

const fs = require('fs');
const path = require('path');

const { addPopularity } = require('./popularity.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'catalog');
const RAW = 'https://raw.githubusercontent.com/libretro/libretro-database/master/';

// Metadata dats, most trusted first: the first value found for a field wins.
const META_DIRS = ['developer', 'publisher', 'genre', 'releaseyear', 'releasemonth', 'maxusers', 'franchise', 'esrb', 'serial', 'origin'];
const FIELDS = { developer: 'dev', publisher: 'pub', genre: 'genre', releaseyear: 'year', users: 'players', franchise: 'franchise', esrb_rating: 'esrb', serial: 'serial' };

// ---------- clrmamepro .dat parser ----------

// Returns a list of [key, value] pairs; a value is a string or a nested list.
function parseDat(text) {
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|\(|\)|[^\s()"]+/g) || [];
  let i = 0;
  function block() {
    const out = [];
    while (i < tokens.length) {
      const key = tokens[i++];
      if (key === ')') return out;
      const v = tokens[i++];
      if (v === undefined) break;
      out.push([key, v === '(' ? block() : unquote(v)]);
    }
    return out;
  }
  return block();
}
const unquote = (s) => (s[0] === '"' ? s.slice(1, -1).replace(/\\"/g, '"') : s);
const get = (list, key) => list.find(([k]) => k === key)?.[1];
const getAll = (list, key) => list.filter(([k]) => k === key).map(([, v]) => v);

// ---------- names ----------

// "ActRaiser (USA) (Rev 1)" -> "actraiser"; "007: Agent Under Fire" == "007 - Agent Under Fire"
// "Pokémon" == "Pokemon", "Ghosts 'n Goblins" == "Ghosts n Goblins", "Tom & Jerry" == "Tom and Jerry"
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '')
  .replace(/&/g, ' and ').trim().replace(/^the |, the\b/g, '').replace(/[^a-z0-9]+/g, '');
const normFull = (s) => s.toLowerCase().replace(/[^a-z0-9()]+/g, '');
const normSerial = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

// The title shown for a group of releases: the name without its (tags) and [flags].
function baseTitle(name) {
  return name.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim();
}

// What kind of release a No-Intro / Redump name describes. Retail games have no kind.
const KIND_TAGS = [
  [/\((DLC|Update|Patch|Theme|Avatar|Add-On|Costume)[^)]*\)/i, 'dlc'],
  [/^\[BIOS\]|\(BIOS\)|\(Enhancement Chip\)/i, 'bios'],
  [/\((Proto|Prototype)( \d+)?\)|\(\d{4}-\d{2}-\d{2}\)/i, 'proto'],
  [/\(Beta( \d+)?\)/i, 'beta'],
  [/\([^)]*\b(Demo|Sample|Sampler|Kiosk|Trial|Promo|Preview|Previews|Taikenban|Not for Resale)\b[^)]*\)/i, 'demo'],
  [/\(Pirate\)/i, 'pirate'],
  [/\((Aftermarket|Homebrew)\)/i, 'homebrew'],
  [/\(Unl\)/i, 'unlicensed'],
  [/\((Program|Test Program|Application|Utility)\)/i, 'app'],
  [/\(Hack\)/i, 'hack'],
];
function kindOf(name) {
  for (const [re, k] of KIND_TAGS) if (re.test(name)) return k;
  return undefined;
}

// Region tags: "(USA, Europe)" -> ["USA", "Europe"]
const REGIONS = new Set(['World', 'USA', 'Europe', 'Japan', 'Asia', 'Australia', 'Brazil', 'Canada', 'China', 'France',
  'Germany', 'Hong Kong', 'Italy', 'Korea', 'Netherlands', 'Spain', 'Sweden', 'Taiwan', 'UK', 'Russia', 'Scandinavia',
  'Denmark', 'Finland', 'Norway', 'Portugal', 'Greece', 'Poland', 'Mexico', 'Argentina', 'New Zealand', 'India',
  'Latin America', 'Belgium', 'Switzerland', 'Austria', 'Ireland', 'Israel', 'South Africa', 'United Arab Emirates', 'Unknown']);
function regionsOf(name) {
  for (const m of name.matchAll(/\(([^)]*)\)/g)) {
    const parts = m[1].split(/,\s*/);
    if (parts.every((p) => REGIONS.has(p))) return parts;
  }
  return [];
}
// Which release's metadata speaks for the title: an English-language retail release if there is one.
const REGION_RANK = ['USA', 'World', 'Europe', 'UK', 'Australia', 'Canada', 'Japan'];
const rank = (r) => {
  const i = Math.min(...r.regions.map((x) => (REGION_RANK.includes(x) ? REGION_RANK.indexOf(x) : 50)), 99);
  const extraTags = (r.name.match(/\(/g) || []).length - 1; // "(USA)" beats "(USA) (Virtual Console)"
  return (r.kind ? 1000 : 0) + i + 0.1 * extraTags;
};

// ---------- loading ----------

async function load(rel, opts) {
  if (opts.src) {
    const f = path.join(opts.src, rel);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(RAW + rel.split('/').map(encodeURIComponent).join('/'));
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(r.status + ' ' + rel);
      return await r.text();
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
    }
  }
}

// One metadata index per system: crc / serial / name -> { field: value }
function indexMeta(texts) {
  const byCrc = new Map(), bySerial = new Map(), byName = new Map(), byFull = new Map();
  const add = (map, key, rec) => {
    if (!key) return;
    const cur = map.get(key);
    if (!cur) return map.set(key, { ...rec });
    for (const [k, v] of Object.entries(rec)) if (cur[k] === undefined) cur[k] = v;
  };
  for (const text of texts) {
    for (const [k, g] of parseDat(text)) {
      if (k !== 'game' || !Array.isArray(g)) continue;
      const rec = {};
      for (const [src, dst] of Object.entries(FIELDS)) {
        const v = get(g, src);
        if (typeof v === 'string' && v.trim()) rec[dst] = v.trim();
      }
      const month = get(g, 'releasemonth');
      if (month) rec.month = month;
      if (!Object.keys(rec).length) continue;
      const roms = getAll(g, 'rom').filter(Array.isArray);
      for (const rom of roms) {
        add(byCrc, get(rom, 'crc')?.toUpperCase(), rec);
        const s = get(rom, 'serial');
        if (s) add(bySerial, normSerial(s), rec);
      }
      if (get(g, 'serial')) add(bySerial, normSerial(get(g, 'serial')), rec);
      const name = get(g, 'name') || get(g, 'comment');
      if (name) {
        // Name-only matches are weaker: keyed by the full name with tags, and by the bare title for
        // dats (like GameTDB's) that spell names differently.
        add(byFull, normFull(name), rec);
        add(byName, norm(name) + '|' + regionsOf(name).join(','), rec);
      }
    }
  }
  return { byCrc, bySerial, byName, byFull };
}

function lookupMeta(idx, release) {
  const found = [];
  for (const c of release.crcs) if (idx.byCrc.has(c)) found.push(idx.byCrc.get(c));
  for (const s of release.serials) if (idx.bySerial.has(normSerial(s))) found.push(idx.bySerial.get(normSerial(s)));
  if (idx.byFull.has(normFull(release.name))) found.push(idx.byFull.get(normFull(release.name)));
  const k = norm(release.name) + '|' + release.regions.join(',');
  if (idx.byName.has(k)) found.push(idx.byName.get(k));
  const out = {};
  for (const rec of found) for (const [f, v] of Object.entries(rec)) if (out[f] === undefined) out[f] = v;
  return out;
}

// ---------- building ----------

async function buildSystem(sys, opts) {
  const mainRel = `metadat/${sys.source}/${sys.db}.dat`;
  const main = await load(mainRel, opts);
  if (!main) throw new Error('missing ' + mainRel);
  const metaRels = [...META_DIRS.map((d) => `metadat/${d}/${sys.db}.dat`), `metadat/${sys.db}.dat`, `dat/${sys.db}.dat`];
  const metaTexts = (await Promise.all(metaRels.map((rel) => load(rel, opts)))).filter(Boolean);
  const idx = indexMeta([main, ...metaTexts]);

  const parsed = parseDat(main);
  const header = get(parsed, 'clrmamepro') || [];
  // Releases: one per name. Discs ("(Disc 2)") join their game; No-Intro lists some games twice (.nes / .unh).
  const releases = new Map();
  for (const [k, g] of parsed) {
    if (k !== 'game' || !Array.isArray(g)) continue;
    const fullName = get(g, 'name');
    if (!fullName) continue;
    const name = fullName.replace(/\s*\(Disc \d+\)/i, '').trim();
    let r = releases.get(name);
    if (!r) {
      r = { name, regions: regionsOf(name), kind: kindOf(name), crcs: [], serials: [], discs: new Set() };
      if (!r.regions.length && get(g, 'region')) r.regions = get(g, 'region').split(/,\s*/);
      releases.set(name, r);
    }
    r.discs.add(fullName.match(/\(Disc (\d+)\)/i)?.[1] || '1');
    const roms = getAll(g, 'rom').filter(Array.isArray);
    const gs = get(g, 'serial');
    if (gs) for (const s of gs.split(/,\s*/)) if (!r.serials.includes(s)) r.serials.push(s);
    for (const rom of roms) {
      const crc = get(rom, 'crc')?.toUpperCase();
      // Cartridges: the checksum identifies the player's file. Discs: only the serial does (CHD/ISO differ).
      if (sys.source === 'no-intro' && crc && !r.crcs.includes(crc)) r.crcs.push(crc);
      const rs = get(rom, 'serial');
      if (rs) for (const s of rs.split(/,\s*/)) if (!r.serials.includes(s)) r.serials.push(s);
    }
    if (sys.source === 'redump' && roms[0]) {
      // Keep the first track's checksum anyway: it identifies .cue/.bin sets.
      const crc = get(roms[0], 'crc')?.toUpperCase();
      if (crc && !r.crcs.includes(crc)) r.crcs.push(crc);
    }
  }

  // Titles: releases grouped by bare name ("ActRaiser (USA)", "ActRaiser (Europe)" -> "ActRaiser").
  const titles = new Map();
  for (const r of releases.values()) {
    if (r.kind === 'dlc') continue; // add-ons and updates aren't games
    // "SCUS-94163, SCUS-94163-0, SCUS-94163-1" -> "SCUS-94163": per-disc suffixes add nothing
    r.serials = r.serials.filter((s) => !r.serials.some((t) => t !== s && s.startsWith(t + '-')));
    r.meta = lookupMeta(idx, r);
    const key = norm(r.name) || r.name;
    if (!titles.has(key)) titles.set(key, []);
    titles.get(key).push(r);
  }

  const out = [];
  for (const rels of titles.values()) {
    rels.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    const best = rels[0];
    const t = { title: baseTitle(best.name) || best.name };
    for (const f of ['dev', 'pub', 'genre', 'franchise', 'esrb', 'players']) {
      const v = [best, ...rels].map((r) => r.meta[f]).find((x) => x !== undefined);
      if (v !== undefined) t[f] = f === 'players' ? +v || undefined : v;
    }
    // A year before the system came out is a data error (the first dev kits went out about a year early)
    const years = rels.map((r) => +r.meta.year).filter((y) => y >= (sys.year || 1970) - 1 && y <= 2100);
    if (years.length) t.year = Math.min(...years);
    // A title's kind is its best release's: a game with a retail release is a retail game.
    if (best.kind) t.kind = best.kind;
    t.regions = [...new Set(rels.filter((r) => r.kind === best.kind).flatMap((r) => r.regions))];
    t.releases = rels.map((r) => {
      const o = { name: r.name };
      if (r.kind) o.kind = r.kind;
      if (r.meta.year) o.year = +r.meta.year;
      const serials = r.serials.length ? r.serials : r.meta.serial ? r.meta.serial.split(/,\s*/) : [];
      if (serials.length) o.serial = serials;
      if (r.crcs.length) o.crc = r.crcs;
      if (r.discs.size > 1) o.discs = r.discs.size;
      return o;
    });
    out.push(t);
  }
  out.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
  for (const t of out) if (t.players === undefined) delete t.players;

  return {
    id: sys.id,
    name: sys.name,
    source: { list: sys.source === 'no-intro' ? 'No-Intro' : 'Redump', db: sys.db, version: get(header, 'version') || null },
    license: 'CC BY-SA 4.0, from libretro-database (https://github.com/libretro/libretro-database)',
    thumbnails: `https://raw.githubusercontent.com/libretro-thumbnails/${sys.db.replace(/ /g, '_')}/master/`,
    stats: stats(out),
    titles: out,
  };
}

function stats(titles) {
  const retail = titles.filter((t) => !t.kind);
  const pct = (f) => (retail.length ? Math.round((100 * retail.filter((t) => t[f] !== undefined).length) / retail.length) : 0);
  const s = {
    titles: titles.length, retail: retail.length, releases: titles.reduce((n, t) => n + t.releases.length, 0),
    coverage: { year: pct('year'), genre: pct('genre'), dev: pct('dev'), pub: pct('pub'), players: pct('players') },
  };
  if (titles.some((t) => t.wiki)) s.coverage.popularity = pct('wiki');
  return s;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const opts = { src: opt('--src'), popularity: args.includes('--popularity'), views: !args.includes('--no-views') };
  const only = opt('--only')?.split(',');
  const { systems } = JSON.parse(fs.readFileSync(path.join(OUT, 'systems.json'), 'utf8'));
  const index = [];
  for (const sys of systems) {
    if (only && !only.includes(sys.id)) {
      const prev = path.join(OUT, 'data', sys.id + '.json');
      if (fs.existsSync(prev)) index.push(summary(sys, JSON.parse(fs.readFileSync(prev, 'utf8'))));
      continue;
    }
    process.stdout.write(sys.id.padEnd(10));
    const cat = await buildSystem(sys, opts);
    let pop = '';
    if (opts.popularity && sys.wikidata) {
      try {
        const r = await addPopularity(cat, sys.wikidata, norm, baseTitle, opts);
        cat.stats = stats(cat.titles); // titles that turned out to be one game were merged
        pop = `  popular ${cat.stats.coverage.popularity}% (${r.matched}/${r.wikidataGames} Wikidata games)`;
      } catch (e) {
        pop = '  popularity failed: ' + e.message; // the catalog still works, just without the "popular" sort
      }
    }
    fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'data', sys.id + '.json'), JSON.stringify(cat));
    index.push(summary(sys, cat));
    const s = cat.stats;
    console.log(`${String(s.titles).padStart(6)} titles ${String(s.retail).padStart(6)} retail   year ${s.coverage.year}%  genre ${s.coverage.genre}%  dev ${s.coverage.dev}%${pop}`);
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), systems: index }, null, 1) + '\n');
}

function summary(sys, cat) {
  const { db, source, ...rest } = sys;
  return { ...rest, version: cat.source.version, list: cat.source.list, thumbnails: cat.thumbnails, stats: cat.stats };
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { parseDat, baseTitle, kindOf, regionsOf, norm, buildSystem, stats };
