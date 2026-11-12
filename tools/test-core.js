// node tools/test-core.js — checks the emulator core, battery saves, save states and the zip reader.
const assert = require('assert');
const jsnes = require('../lib/jsnes.min.js');
const { unzip } = require('../storage.js');
const { makeTestRom } = require('./make-test-rom.js');
const zlib = require('zlib');

(async () => {
  const rom = makeTestRom();
  let writes = 0, frames = 0;
  const nes = new jsnes.NES({ onFrame: () => frames++, onAudioSample: () => {}, onBatteryRamWrite: () => writes++ });
  nes.loadROM(rom);
  assert.ok(nes.rom.batteryRam, 'battery flag detected');
  for (let i = 0; i < 10; i++) nes.frame();
  assert.equal(frames, 10);
  assert.equal(nes.cpu.mem[0x6000], 0x42, 'program wrote save RAM');
  assert.ok(writes > 1, 'battery write hook fires');

  const state = structuredClone(nes.toJSON()); // what IndexedDB stores
  const counter = nes.cpu.mem[0x6001];
  for (let i = 0; i < 5; i++) nes.frame();
  nes.fromJSON(state);
  assert.equal(nes.cpu.mem[0x6001], counter, 'save state restores');
  console.log('core ok — state size', JSON.stringify(state).length, 'bytes as JSON');

  // zip with one deflated and one stored file
  const files = [['a/Game One.nes', rom, 8], ['readme.txt', Buffer.from('hi'), 0], ['Game Two.nes', rom, 0]];
  const parts = [], central = []; let off = 0;
  for (const [name, data, method] of files) {
    const n = Buffer.from(name), body = method ? zlib.deflateRawSync(data) : Buffer.from(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(local, n, body); central.push(c, n); off += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  const zip = Buffer.concat([...parts, cd, end]);
  const out = await unzip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length));
  assert.deepEqual(out.map((e) => e.name), ['Game One.nes', 'Game Two.nes']);
  assert.ok(out.every((e) => Buffer.compare(Buffer.from(e.data), Buffer.from(rom)) === 0), 'zip contents intact');
  console.log('zip ok');
})().catch((e) => { console.error(e); process.exit(1); });
