import { Level, findLevels, levelName, readMap, readTiles, saveMap, tileEntry } from "../core/levels";
import { Rom } from "../core/rom";

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector(s) as T;
const input = (s: string): HTMLInputElement => $<HTMLInputElement>(s);
const select = (s: string): HTMLSelectElement => $<HTMLSelectElement>(s);

type Tool = "paint" | "fill" | "pick" | "erase";

/** Tile-layer editor for the game's rooms. Edits are written to the ROM on every stroke. */
export class LevelEditor {
  private rom: Rom | null = null;
  private levels: Level[] = [];
  private cur: Level | null = null;
  private entries: Uint16Array = new Uint16Array(0);
  private tiles: Uint8Array = new Uint8Array(0);
  private pal: number[][][] = [];            // [row][index] -> [r, g, b]
  private cache = new Map<number, ImageData>();
  private tool: Tool = "paint";
  private selTile = 1;
  private painting = false;
  private dirty = false;
  private fillStart: { x: number; y: number } | null = null;

  constructor(private onChange: () => void, private toast: (m: string) => void) {
    this.wire();
  }

  /** Called when a ROM is loaded. */
  open(rom: Rom): void {
    this.rom = rom;
    this.levels = findLevels(rom);
    const areas = [...new Set(this.levels.map((l) => l.area))];
    const sa = select("#lvArea");
    sa.textContent = "";
    for (const a of areas) sa.appendChild(new Option(`Area ${a}`, String(a)));
    if (!this.levels.length) {
      $("#lvInfo").textContent = "No level maps found in this ROM.";
      this.cur = null;
      return;
    }
    this.fillRooms(this.levels[0].area);
    this.selectLevel(this.levels[0]);
  }

  /** Reload from the ROM after something else changed it (undo, reset, load edits). */
  refresh(): void {
    if (this.cur && this.rom) this.load(false);
  }

  private fillRooms(area: number): void {
    const sr = select("#lvRoom");
    sr.textContent = "";
    for (const l of this.levels.filter((x) => x.area === area)) sr.appendChild(new Option(`${l.room} (${l.w}x${l.h})`, String(l.tag)));
  }

  private selectLevel(l: Level): void {
    this.cur = l;
    select("#lvArea").value = String(l.area);
    this.fillRooms(l.area);
    select("#lvRoom").value = String(l.tag);
    const sp = select("#lvPal");
    sp.textContent = "";
    for (let r = 0; r < l.palRows; r++) sp.appendChild(new Option(String(r), String(r)));
    this.selTile = Math.min(this.selTile, 767);
    this.load(true);
  }

  private load(resetView: boolean): void {
    const l = this.cur!, rom = this.rom!;
    const m = readMap(rom, l);
    if (!m) { $("#lvInfo").textContent = "Could not read this map."; return; }
    this.entries = m.entries;
    this.tiles = readTiles(rom, l);
    this.pal = [];
    for (let r = 0; r < 16; r++) {
      const row: number[][] = [];
      for (let c = 0; c < 16; c++) {
        const v = r < l.palRows ? rom.u16(l.palPtr + r * 32 + c * 2) : 0;
        row.push([((v & 31) * 255) / 31, (((v >> 5) & 31) * 255) / 31, (((v >> 10) & 31) * 255) / 31]);
      }
      this.pal.push(row);
    }
    this.cache.clear();
    const cv = $<HTMLCanvasElement>("#lvMap");
    if (cv.width !== l.w * 8 || cv.height !== l.h * 8) { cv.width = l.w * 8; cv.height = l.h * 8; }
    this.drawAll();
    this.drawPicker();
    this.applyZoom();
    $("#lvTitle").textContent = `${levelName(l)} / scene ${l.tag}`;
    $("#lvInfo").textContent =
      `${l.w} x ${l.h} tiles. Tileset ${(this.tiles.length / 32) | 0} tiles at ROM 0x${l.tilesOff.toString(16).toUpperCase()}, ` +
      `${l.palRows} palette rows at 0x${l.palPtr.toString(16).toUpperCase()}. Map stored at 0x${m.off.toString(16).toUpperCase()} (${m.used} bytes).`;
    if (resetView) $("#lvScroll").scrollTo(0, 0);
  }

  // ---- drawing ----
  private tileImage(entry: number): ImageData {
    let img = this.cache.get(entry);
    if (img) return img;
    img = new ImageData(8, 8);
    const t = entry & 1023, hf = (entry >> 10) & 1, vf = (entry >> 11) & 1, row = this.pal[entry >> 12];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sx = hf ? 7 - x : x, sy = vf ? 7 - y : y;
      const b = this.tiles[t * 32 + sy * 4 + (sx >> 1)] ?? 0;
      const idx = sx & 1 ? b >> 4 : b & 15;
      const p = (y * 8 + x) * 4;
      if (!idx) continue;
      img.data[p] = row[idx][0]; img.data[p + 1] = row[idx][1]; img.data[p + 2] = row[idx][2]; img.data[p + 3] = 255;
    }
    this.cache.set(entry, img);
    return img;
  }

  private drawTile(x: number, y: number): void {
    const l = this.cur!;
    $<HTMLCanvasElement>("#lvMap").getContext("2d")!.putImageData(this.tileImage(this.entries[y * l.w + x]), x * 8, y * 8);
  }

  private drawAll(): void {
    const l = this.cur!;
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) this.drawTile(x, y);
  }

  private drawPicker(): void {
    const n = Math.max(1, (this.tiles.length / 32) | 0), cols = 32, rows = Math.ceil(n / cols);
    const cv = $<HTMLCanvasElement>("#lvPicker");
    cv.width = cols * 8;
    cv.height = rows * 8;
    cv.style.width = cols * 16 + "px";
    cv.style.height = rows * 16 + "px";
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#555a6e";
    ctx.fillRect(0, 0, cv.width, cv.height);
    const row = Number(select("#lvPal").value) || 0;
    const e = (t: number) => tileEntry(t, input("#lvH").checked, input("#lvV").checked, row);
    for (let t = 0; t < n; t++) ctx.putImageData(this.tileImage(e(t)), (t % cols) * 8, ((t / cols) | 0) * 8);
    this.placePickSel();
  }

  private placePickSel(): void {
    const s = $("#lvPickSel"), t = this.selTile;
    s.style.left = (t % 32) * 16 + "px";
    s.style.top = ((t / 32) | 0) * 16 + "px";
    s.style.width = "16px";
    s.style.height = "16px";
  }

  private applyZoom(): void {
    const l = this.cur;
    if (!l) return;
    const z = Number(select("#lvZoom").value);
    const cv = $<HTMLCanvasElement>("#lvMap");
    cv.style.width = l.w * 8 * z + "px";
    cv.style.height = l.h * 8 * z + "px";
    const stage = $("#lvStage");
    stage.style.setProperty("--cell", 8 * z + "px");
    stage.classList.toggle("grid", input("#lvGrid").checked);
  }

  // ---- editing ----
  private cell(e: PointerEvent): { x: number; y: number } | null {
    const l = this.cur;
    if (!l) return null;
    const rc = $<HTMLCanvasElement>("#lvMap").getBoundingClientRect();
    const x = Math.floor(((e.clientX - rc.left) / rc.width) * l.w), y = Math.floor(((e.clientY - rc.top) / rc.height) * l.h);
    return x < 0 || y < 0 || x >= l.w || y >= l.h ? null : { x, y };
  }

  private newEntry(): number {
    return tileEntry(this.selTile, input("#lvH").checked, input("#lvV").checked, Number(select("#lvPal").value) || 0);
  }

  private set(x: number, y: number, entry: number): void {
    const l = this.cur!, i = y * l.w + x;
    if (this.entries[i] === entry) return;
    this.entries[i] = entry;
    this.dirty = true;
    this.drawTile(x, y);
  }

  private commit(): void {
    if (!this.dirty || !this.cur || !this.rom) return;
    this.dirty = false;
    try {
      const r = saveMap(this.rom, this.cur, this.entries);
      $("#lvInfo").textContent += r.relocated
        ? ` Saved: moved to 0x${r.off.toString(16).toUpperCase()} (${r.bytes} bytes; it no longer fit its original ${r.original}).`
        : ` Saved in place (${r.bytes} of ${r.original} bytes).`;
      this.onChange();
    } catch (err) {
      this.toast(String((err as Error).message));
      this.load(false);
    }
  }

  private applyAt(x: number, y: number): void {
    const l = this.cur!;
    if (this.tool === "paint") this.set(x, y, this.newEntry());
    else if (this.tool === "erase") this.set(x, y, 0);
    else if (this.tool === "pick") {
      const e = this.entries[y * l.w + x];
      this.selTile = e & 1023;
      input("#lvH").checked = !!((e >> 10) & 1);
      input("#lvV").checked = !!((e >> 11) & 1);
      select("#lvPal").value = String(Math.min(e >> 12, l.palRows - 1));
      this.drawPicker();
    }
  }

  private setTool(t: Tool): void {
    this.tool = t;
    for (const [id, name] of [["#lvPaint", "paint"], ["#lvFill", "fill"], ["#lvPick", "pick"], ["#lvErase", "erase"]] as const) {
      $(id).classList.toggle("on", name === t);
    }
  }

  private updateBox(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const z = Number(select("#lvZoom").value) * 8, box = $("#lvBox");
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    box.style.display = "block";
    box.style.left = x0 * z + "px";
    box.style.top = y0 * z + "px";
    box.style.width = (x1 - x0 + 1) * z + "px";
    box.style.height = (y1 - y0 + 1) * z + "px";
  }

  private wire(): void {
    select("#lvArea").onchange = () => {
      const a = Number(select("#lvArea").value), first = this.levels.find((l) => l.area === a);
      if (first) this.selectLevel(first);
    };
    select("#lvRoom").onchange = () => {
      const l = this.levels.find((x) => x.tag === Number(select("#lvRoom").value));
      if (l) this.selectLevel(l);
    };
    for (const [id, t] of [["#lvPaint", "paint"], ["#lvFill", "fill"], ["#lvPick", "pick"], ["#lvErase", "erase"]] as const) $(id).onclick = () => this.setTool(t);
    select("#lvZoom").onchange = () => this.applyZoom();
    input("#lvGrid").onchange = () => this.applyZoom();
    select("#lvPal").onchange = () => this.drawPicker();
    input("#lvH").onchange = () => this.drawPicker();
    input("#lvV").onchange = () => this.drawPicker();

    $("#lvPicker").addEventListener("click", (e) => {
      const rc = $<HTMLCanvasElement>("#lvPicker").getBoundingClientRect();
      const cols = 32, x = Math.floor(((e as MouseEvent).clientX - rc.left) / 16), y = Math.floor(((e as MouseEvent).clientY - rc.top) / 16);
      const t = y * cols + x;
      if (t >= 0 && t < this.tiles.length / 32) {
        this.selTile = t;
        this.placePickSel();
        $("#lvTileInfo").textContent = `tile ${t} (0x${t.toString(16)})`;
        if (this.tool === "erase" || this.tool === "pick") this.setTool("paint");
      }
    });

    const map = $<HTMLCanvasElement>("#lvMap");
    map.addEventListener("pointerdown", (e) => {
      const c = this.cell(e);
      if (!c || !this.cur) return;
      map.setPointerCapture(e.pointerId);
      this.painting = true;
      if (this.tool === "fill") { this.fillStart = c; this.updateBox(c, c); return; }
      this.applyAt(c.x, c.y);
      if (this.tool === "pick") this.painting = false;
    });
    map.addEventListener("pointermove", (e) => {
      const c = this.cell(e), l = this.cur;
      if (c && l) {
        const en = this.entries[c.y * l.w + c.x];
        $("#lvHover").textContent = `(${c.x},${c.y}) entry 0x${en.toString(16).padStart(4, "0")}: tile ${en & 1023}, palette ${en >> 12}${en & 0x400 ? ", hflip" : ""}${en & 0x800 ? ", vflip" : ""}`;
      }
      if (!this.painting || !c) return;
      if (this.tool === "fill" && this.fillStart) this.updateBox(this.fillStart, c);
      else this.applyAt(c.x, c.y);
    });
    const end = (e: PointerEvent): void => {
      if (!this.painting) return;
      this.painting = false;
      if (this.tool === "fill" && this.fillStart) {
        const c = this.cell(e) ?? this.fillStart, a = this.fillStart;
        for (let y = Math.min(a.y, c.y); y <= Math.max(a.y, c.y); y++) for (let x = Math.min(a.x, c.x); x <= Math.max(a.x, c.x); x++) this.set(x, y, this.newEntry());
        this.fillStart = null;
        $("#lvBox").style.display = "none";
      }
      this.commit();
    };
    map.addEventListener("pointerup", end);
    map.addEventListener("pointercancel", end);
  }
}
