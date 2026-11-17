// node tools/test-catalog.js — checks the catalog builder on a tiny made-up libretro-database
// (no network): .dat parsing, release kinds and regions, metadata joins by CRC / serial / name, grouping.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseDat, baseTitle, kindOf, regionsOf, norm, buildSystem } = require('./build-catalog.js');
const { matchGames, mergeSameGame } = require('./popularity.js');

// Parser
const parsed = parseDat('clrmamepro (\n\tname "X"\n\tversion "1.2"\n)\ngame (\n\tname "A \\"B\\" (USA)"\n\trom ( name "a.nes" crc 1234ABCD )\n)\n');
assert.deepStrictEqual(parsed[0], ['clrmamepro', [['name', 'X'], ['version', '1.2']]]);
assert.strictEqual(parsed[1][1][0][1], 'A "B" (USA)');
assert.deepStrictEqual(parsed[1][1][1], ['rom', [['name', 'a.nes'], ['crc', '1234ABCD']]]);

// Names
assert.strictEqual(baseTitle('ActRaiser (USA) (Rev 1) [b]'), 'ActRaiser');
assert.deepStrictEqual(regionsOf('Sonic (USA, Europe) (Rev 1)'), ['USA', 'Europe']);
assert.deepStrictEqual(regionsOf('Tetris (En,Fr) (Japan)'), ['Japan']);
assert.strictEqual(kindOf('Zelda (USA) (Proto)'), 'proto');
assert.strictEqual(kindOf('Zelda (USA) (Beta 2)'), 'beta');
assert.strictEqual(kindOf('Final Fantasy VII (USA) (Interactive Sampler CD)'), 'demo');
assert.strictEqual(kindOf('[BIOS] SCPH-1001 (USA)'), 'bios');
assert.strictEqual(kindOf('Game (World) (Aftermarket) (Unl)'), 'homebrew');
assert.strictEqual(kindOf('Game (USA) (DLC)'), 'dlc');
assert.strictEqual(kindOf('Super Mario World (USA)'), undefined);
assert.strictEqual(norm('007: Agent Under Fire (Europe)'), norm('007 - Agent Under Fire (USA)'));
assert.strictEqual(norm('Legend of Zelda, The (USA)'), norm('The Legend of Zelda'));
assert.strictEqual(norm('Pokemon Red (USA)'), norm('Pokémon Red'));
assert.strictEqual(norm('Tom & Jerry'), norm('Tom and Jerry'));

// Popularity: matching catalog titles to Wikidata games
const titles = [
  { title: 'Legend of Zelda, The - A Link to the Past', releases: [{ name: 'Legend of Zelda, The - A Link to the Past (USA)' }] },
  { title: 'Final Fantasy III', releases: [{ name: 'Final Fantasy III (USA)' }] },
  { title: 'Zelda no Densetsu - Kamigami no Triforce', releases: [{ name: 'Zelda no Densetsu - Kamigami no Triforce (Japan)' }] },
  { title: 'Unknown Game', releases: [{ name: 'Unknown Game (Japan)' }] },
];
const games = [
  { qid: 'Q1', wiki: 40, article: 'The Legend of Zelda: A Link to the Past', names: ['The Legend of Zelda: A Link to the Past', 'Zelda no Densetsu: Kamigami no Triforce'] },
  { qid: 'Q2', wiki: 35, article: 'Final Fantasy VI', names: ['Final Fantasy VI', 'Final Fantasy III'] },
  { qid: 'Q3', wiki: 3, article: 'Final Fantasy III (bootleg)', names: ['Final Fantasy III'] },
];
const m = matchGames(titles, games, norm, baseTitle);
assert.strictEqual(m.get(titles[0]).qid, 'Q1');
assert.strictEqual(m.get(titles[1]).qid, 'Q2', 'by alias; the better-known game wins a shared name');
assert.strictEqual(m.get(titles[2]).qid, 'Q1', 'the Japanese name is an alias');
assert.strictEqual(m.has(titles[3]), false);
// The Japanese and English titles of one game become one title, named after the English release
const cat = { titles: titles.map((t, i) => ({ ...t, year: [1991, 1994, 1991, 1990][i], regions: [['USA'], ['USA'], ['Japan'], ['Japan']][i] })) };
mergeSameGame(cat, matchGames(cat.titles, games, norm, baseTitle));
assert.deepStrictEqual(cat.titles.map((t) => t.title), ['Legend of Zelda, The - A Link to the Past', 'Final Fantasy III', 'Unknown Game']);
assert.strictEqual(cat.titles[0].releases.length, 2);
assert.deepStrictEqual(cat.titles[0].regions, ['USA', 'Japan']);


// A fake database: one cartridge system, one disc system
const src = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-test-'));
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true }); fs.writeFileSync(path.join(src, rel), text); };
const cart = 'Test - Cart';
write(`metadat/no-intro/${cart}.dat`, `clrmamepro ( name "${cart}" version "2026.01.01" )
game ( name "Star Quest (USA)" region "USA" rom ( name "Star Quest (USA).bin" size 1 crc AAAA0001 ) )
game ( name "Star Quest (USA)" region "USA" rom ( name "Star Quest (USA).unh" size 1 crc AAAA0002 ) )
game ( name "Star Quest (Japan)" region "Japan" rom ( name "Star Quest (Japan).bin" size 1 crc AAAA0003 ) )
game ( name "Star Quest (USA) (Proto)" region "USA" rom ( name "p.bin" size 1 crc AAAA0004 ) )
game ( name "Moon Bros. (Europe) (Beta)" region "Europe" rom ( name "m.bin" size 1 crc AAAA0005 ) )
`);
write(`metadat/developer/${cart}.dat`, `game ( comment "Star Quest (Japan)" developer "Starsoft" rom ( crc AAAA0003 ) )`);
write(`metadat/publisher/${cart}.dat`, `game ( comment "Star Quest (USA)" publisher "Big Pub" rom ( crc AAAA0001 ) )`);
write(`metadat/releaseyear/${cart}.dat`, `game ( comment "Star Quest (USA)" releaseyear "1991" rom ( crc AAAA0001 ) )
game ( comment "Star Quest (Japan)" releaseyear "1990" rom ( crc AAAA0003 ) )`);
write(`metadat/maxusers/${cart}.dat`, `game ( comment "Star Quest (USA)" users 2 rom ( crc AAAA0002 ) )`);
write(`metadat/genre/${cart}.dat`, `game ( comment "Star Quest (USA)" genre "Shooter" rom ( crc AAAA0001 ) )`);

const disc = 'Test - Disc';
write(`metadat/redump/${disc}.dat`, `clrmamepro ( name "${disc}" version "2026.02.02" )
game ( name "Epic RPG (USA) (Disc 1)" serial "ABCD-00001" rom ( name "t1.bin" size 9 crc BBBB0001 ) rom ( name "t2.bin" size 9 crc BBBB0002 ) )
game ( name "Epic RPG (USA) (Disc 2)" serial "ABCD-00001-1" rom ( name "t1.bin" size 9 crc BBBB0003 ) )
`);
// Serial-keyed metadata (like the PSP / PS2 dats) and a name-keyed one spelled differently (like GameTDB's)
write(`metadat/${disc}.dat`, `game ( name "Epic RPG (USA)" serial "ABCD-00001" genre "Role-playing (RPG)" rom ( serial "ABCD-00001" ) )`);
write(`dat/${disc}.dat`, `game ( name "Epic RPG (USA)" developer "Dev: Studio" releaseyear 1999 rom ( name "x.iso" ) )`);

(async () => {
  const c = await buildSystem({ id: 'cart', name: 'Cart', db: cart, source: 'no-intro' }, { src });
  assert.strictEqual(c.source.version, '2026.01.01');
  assert.strictEqual(c.thumbnails, 'https://raw.githubusercontent.com/libretro-thumbnails/Test_-_Cart/master/');
  assert.strictEqual(c.titles.length, 2);
  const sq = c.titles.find((t) => t.title === 'Star Quest');
  assert.strictEqual(sq.kind, undefined, 'a title with a retail release is retail');
  assert.deepStrictEqual(sq.releases.map((r) => r.name), ['Star Quest (USA)', 'Star Quest (Japan)', 'Star Quest (USA) (Proto)']);
  assert.deepStrictEqual(sq.releases[0].crc, ['AAAA0001', 'AAAA0002'], 'the .bin and .unh dumps are one release');
  assert.strictEqual(sq.year, 1990, 'the earliest release year');
  assert.strictEqual(sq.pub, 'Big Pub');
  assert.strictEqual(sq.dev, 'Starsoft', 'fields missing on the main release come from another region');
  assert.strictEqual(sq.players, 2, 'matched by the second CRC');
  assert.strictEqual(sq.genre, 'Shooter');
  assert.deepStrictEqual(sq.regions, ['USA', 'Japan']);
  assert.strictEqual(sq.releases[2].kind, 'proto');
  const moon = c.titles.find((t) => t.title === 'Moon Bros.');
  assert.strictEqual(moon.kind, 'beta');
  assert.strictEqual(c.stats.retail, 1);
  assert.strictEqual(c.stats.coverage.year, 100);

  const d = await buildSystem({ id: 'disc', name: 'Disc', db: disc, source: 'redump' }, { src });
  assert.strictEqual(d.titles.length, 1);
  const rpg = d.titles[0];
  assert.strictEqual(rpg.releases.length, 1, 'discs join their game');
  assert.strictEqual(rpg.releases[0].discs, 2);
  assert.deepStrictEqual(rpg.releases[0].serial, ['ABCD-00001'], 'per-disc serial suffixes are dropped');
  assert.deepStrictEqual(rpg.releases[0].crc, ['BBBB0001', 'BBBB0003'], 'first track of each disc');
  assert.strictEqual(rpg.genre, 'Role-playing (RPG)', 'joined by serial');
  assert.strictEqual(rpg.dev, 'Dev: Studio', 'joined by name');
  assert.strictEqual(rpg.year, 1999);

  fs.rmSync(src, { recursive: true });
  console.log('catalog: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
