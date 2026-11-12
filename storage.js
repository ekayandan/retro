// Everything is kept in IndexedDB on the device.
//   games:  id -> { id, name, title, system, size, added, played, art: 'ok'|'none'|undefined, artTried }
//   roms:   id -> Uint8Array (the game file)
//   sram:   id -> Uint8Array (battery save, 8 KB)
//   states: `${id}:auto` | `${id}:1` -> save state object
//   art:    id -> Blob (small JPEG cover)
const Store = (() => {
  const STORES = ['games', 'roms', 'sram', 'states', 'art'];
  let dbp;
  function open() {
    return (dbp ||= new Promise((resolve, reject) => {
      const req = indexedDB.open('retro', 1);
      req.onupgradeneeded = () => STORES.forEach((s) => req.result.createObjectStore(s));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }
  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  return {
    get: (s, k) => run(s, 'readonly', (o) => o.get(k)),
    put: (s, k, v) => run(s, 'readwrite', (o) => o.put(v, k)),
    del: (s, k) => run(s, 'readwrite', (o) => o.delete(k)),
    all: (s) => run(s, 'readonly', (o) => o.getAll()),
    async removeGame(id) {
      await Promise.all([
        Store.del('games', id), Store.del('roms', id), Store.del('sram', id),
        Store.del('states', id + ':auto'), Store.del('states', id + ':1'), Store.del('art', id),
      ]);
    },
  };
})();

// Minimal .zip reader: pulls every .nes file out of an archive.
async function unzip(buffer, wanted = /\.nes$/i) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted.test(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const comp = u8.subarray(start, start + csize);
    let data;
    if (method === 0) data = comp.slice();
    else if (method === 8) {
      const stream = new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else continue;
    out.push({ name: name.split('/').pop(), data });
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { unzip };
