import { Rom } from "../src/core/rom";

/**
 * Builds a tiny synthetic ROM that has the same structures as the real game (sprite database,
 * palette bank, tile bank, Kirby color-slot table) so tests need no copyrighted data.
 *
 * Layout (file offsets): 0x100 db header, 0x200 B table, 0x220 anim list, 0x240 record,
 * 0x300 D table, 0x320 piece list, 0x400 palette bank (8 rows), 0x500 tile bank,
 * 0x600 color scripts, 0x700 color-slot table.
 */
export const SIZE = 0x1000;
export const PAL_BANK = 0x400;
export const TILE_BANK = 0x500;
export const SCRIPTS = 0x600;
export const SLOT_TABLE = 0x700;
export const ptr = (off: number): number => 0x08000000 + off;

export function buildRomBytes(): Uint8Array {
  const buf = new Uint8Array(SIZE);
  const dv = new DataView(buf.buffer);
  const w32 = (o: number, v: number): void => dv.setUint32(o, v >>> 0, true);
  const w16 = (o: number, v: number): void => dv.setUint16(o, v, true);

  buf.set(new TextEncoder().encode("AGB KIRBY AM"), 0xa0);
  buf.set(new TextEncoder().encode("B8KE"), 0xac);

  // database header: [flags][ptr][self][B][C][D][P][T]
  w32(0x100 + 8, ptr(0x100));
  w32(0x10c, ptr(0x200));  // B animation table
  w32(0x110, ptr(0x2f0));  // C (unused by the parser)
  w32(0x114, ptr(0x300));  // D piece lists
  w32(0x118, ptr(PAL_BANK));
  w32(0x11c, ptr(TILE_BANK));

  // B table -> animation list -> record
  w32(0x200, ptr(0x220));
  w32(0x220, ptr(0x240));
  [-2, 3, 16, -1, 0, 1, 4, 0, -4].forEach((v, i) => dv.setInt32(0x240 + i * 4, v, true)); // palette row 3, tile 0, 1 tile, image 0

  // D table -> piece list: one 8x8 piece, then an invalid piece (shape 3) to stop
  w32(0x300, ptr(0x320));
  w16(0x320, 0); w16(0x322, 0); w16(0x324, 0);
  w16(0x326, 0xc000);

  // palette bank: row r, color i = (r * 16 + i) so every color is unique; index 2 of row 3 is a known pink
  for (let r = 0; r < 8; r++) for (let i = 0; i < 16; i++) w16(PAL_BANK + r * 32 + i * 2, (r << 8) | (i << 2));
  w16(PAL_BANK + 3 * 32 + 4, 0x625f);

  // tile 0: every pixel uses palette index 2 (byte 0x22)
  buf.fill(0x22, TILE_BANK, TILE_BANK + 32);

  // color-slot scripts: [-2][row][16][1][-1][-3 or -4]; rows 2,6,7,8, first slot overlays row 1
  const rows = [2, 6, 7, 8];
  rows.forEach((row, i) => {
    const a = SCRIPTS + i * 0x20;
    [-2, row, 16, 1, -1, i === 0 ? -3 : -4].forEach((v, k) => dv.setInt32(a + k * 4, v, true));
    w32(SLOT_TABLE + i * 4, ptr(a));
  });
  return buf;
}

export const buildRom = (): Rom => new Rom(buildRomBytes(), "test.gba");
