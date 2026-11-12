// Builds a tiny NES test program (mapper 0, battery save) used by the tests.
// It writes $42 to save RAM at $6000, then counts up at $6001 forever.
function makeTestRom() {
  const header = [0x4e, 0x45, 0x53, 0x1a, 1, 1, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 16 KB PRG, 8 KB CHR, battery
  const prg = new Uint8Array(16384);
  prg.set([0xa9, 0x42, 0x8d, 0x00, 0x60, 0xee, 0x01, 0x60, 0x4c, 0x05, 0x80]);
  prg.set([0x00, 0x80, 0x00, 0x80, 0x00, 0x80], 0x3ffa); // NMI, RESET, IRQ -> $8000
  const rom = new Uint8Array(16 + 16384 + 8192);
  rom.set(header); rom.set(prg, 16);
  return rom;
}
module.exports = { makeTestRom };
if (require.main === module) require('fs').writeFileSync(process.argv[2] || 'test.nes', makeTestRom());
