import "./style.css";
import {
  ChannelOrder, clamp, colToCss, colToHex, grayscale, hex, hslAdjust, invert, parseHexColor, rgbToCol, swapChannels,
} from "../core/color";
import { Project, SHARED_ROW, slotName } from "../core/project";
import { Rom, Write } from "../core/rom";
import { Anim, Rendered, renderFrame } from "../core/sprites";

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector(s) as T;
const input = (s: string): HTMLInputElement => $<HTMLInputElement>(s);
const select = (s: string): HTMLSelectElement => $<HTMLSelectElement>(s);

let rom!: Rom;
let P!: Project;

interface State {
  groups: Map<number, Anim[]>;
  group: number;
  anim: Anim;
  frameIdx: number;
  palRow: number | null;
  selIdx: number;
  mode: "pick" | "paint";
  playTimer: number | null;
  last: Rendered | null;
  thumbs: Map<number, HTMLCanvasElement>;
}
const S: State = {
  groups: new Map(), group: -1, anim: null as unknown as Anim, frameIdx: 0, palRow: null, selIdx: 1,
  mode: "pick", playTimer: null, last: null, thumbs: new Map(),
};

function toast(msg: string): void {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout((toast as unknown as { t?: number }).t);
  (toast as unknown as { t?: number }).t = window.setTimeout(() => t.classList.remove("on"), 2600);
}

function download(name: string, bytes: BlobPart, type = "application/octet-stream"): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const baseName = (): string => rom.name.replace(/\.[^.]+$/, "");

const activeRow = (): number => (S.palRow !== null ? S.palRow : P.rowFor(S.anim));

function drawTo(canvas: HTMLCanvasElement, r: Rendered): void {
  canvas.width = r.CW;
  canvas.height = r.CH;
  canvas.getContext("2d")!.putImageData(new ImageData(r.px as Uint8ClampedArray<ArrayBuffer>, r.CW, r.CH), 0, 0);
}
const render = (a: Anim, fr: Anim["frames"][number], pal: number[], hit = false, highlight?: number): Rendered =>
  renderFrame(rom, P.db, a, fr, pal, { hit, highlight });

// ---------- writing (every edit goes through here so the UI refreshes) ----------
function write(changes: Write[], coalesce = false): void {
  if (rom.writeColors(changes, coalesce)) afterEdit();
}
function writeRaw(changes: Write[]): void {
  if (rom.writeBytes(changes)) afterEdit();
}

// ---------- sprite groups / gallery ----------
function buildGroups(): void {
  S.groups = new Map();
  for (const a of P.db.anims) {
    if (!S.groups.has(a.pal)) S.groups.set(a.pal, []);
    S.groups.get(a.pal)!.push(a);
  }
  const sel = select("#selGroup");
  sel.textContent = "";
  const rows = [...S.groups.keys()].sort((a, b) => a - b);
  rows.forEach((row, n) => {
    const o = document.createElement("option");
    o.value = String(row);
    o.textContent = `Sprite ${n + 1}${row === 0 ? " (Kirby)" : ""} - ${S.groups.get(row)!.length} animations, palette ${row}`;
    sel.appendChild(o);
  });
  const g = $("#gallery");
  g.textContent = "";
  S.thumbs.clear();
  rows.forEach((row) => {
    const b = document.createElement("button");
    b.className = "thumb";
    b.title = `Palette ${row}` + (P.knownRows[row] ? ` (${P.knownRows[row]})` : "");
    const c = document.createElement("canvas");
    b.appendChild(c);
    b.onclick = () => { select("#selGroup").value = String(row); selectGroup(row); };
    b.dataset.row = String(row);
    g.appendChild(b);
    S.thumbs.set(row, c);
  });
  refreshThumbs();
}

function refreshThumbs(pred?: (row: number, a: Anim) => boolean): void {
  const todo = [...S.thumbs].filter(([row]) => !pred || pred(row, S.groups.get(row)![0]));
  let i = 0;
  const step = (): void => {
    for (let k = 0; k < 60 && i < todo.length; k++, i++) {
      const [row, c] = todo[i];
      const a = S.groups.get(row)![0];
      const fr = a.frames[Math.min(a.frames.length - 1, a.frames.length >> 1)];
      const r = render(a, fr, P.getPalette(P.rowFor(a)));
      const tmp = document.createElement("canvas");
      drawTo(tmp, r);
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, 64, 64);
      const sc = Math.min(1, 60 / Math.max(r.CW, r.CH));
      ctx.imageSmoothingEnabled = sc < 1;
      ctx.drawImage(tmp, (64 - r.CW * sc) / 2, (64 - r.CH * sc) / 2, r.CW * sc, r.CH * sc);
    }
    if (i < todo.length) setTimeout(step, 0);
  };
  step();
}

function selectGroup(row: number): void {
  S.group = row;
  document.querySelectorAll<HTMLElement>(".thumb").forEach((b) => b.classList.toggle("sel", Number(b.dataset.row) === row));
  const sel = select("#selAnim");
  sel.textContent = "";
  const list = S.groups.get(row)!;
  list.forEach((a, n) => {
    const o = document.createElement("option");
    o.value = String(n);
    o.textContent = `Animation ${n + 1} (#${a.id}): ${a.frames.length} frame${a.frames.length > 1 ? "s" : ""}, ${a.box.w}x${a.box.h}px`;
    sel.appendChild(o);
  });
  $("#groupNote").textContent = row === 0
    ? "Kirby's animations. In-game they are drawn with whichever color slot applies (see Kirby colors above). Use the Palette menu on the right to preview any slot or row."
    : `${list.length} animation${list.length > 1 ? "s" : ""} list palette row ${row}.`;
  selectAnim(0);
}

function selectAnim(n: number): void {
  stopPlay();
  S.anim = S.groups.get(S.group)![n];
  select("#selAnim").value = String(n);
  S.frameIdx = 0;
  const sf = select("#selFrame");
  sf.textContent = "";
  S.anim.frames.forEach((_, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = `${i + 1} / ${S.anim.frames.length}`;
    sf.appendChild(o);
  });
  buildFilm();
  buildPalSelect();
  renderStage();
  renderPalette();
}

function buildPalSelect(): void {
  const sp = select("#selPal"), prev = S.palRow;
  sp.textContent = "";
  const own = P.rowFor(S.anim);
  const d = document.createElement("option");
  d.value = "";
  d.textContent = `This sprite's palette (row ${own}${P.knownRows[own] ? ": " + P.knownRows[own] : ""})`;
  sp.appendChild(d);
  for (let r = 0; r < P.db.palRows; r++) {
    const o = document.createElement("option");
    o.value = String(r);
    o.textContent = `Row ${r}${P.knownRows[r] ? ": " + P.knownRows[r] : ""}${P.usedBy(r) ? "" : " (unused)"}`;
    sp.appendChild(o);
  }
  sp.value = prev === null ? "" : String(prev);
}

function buildFilm(): void {
  const f = $("#film");
  f.textContent = "";
  const row = activeRow();
  S.anim.frames.slice(0, 80).forEach((fr, i) => {
    const b = document.createElement("button");
    b.className = "thumb" + (i === S.frameIdx ? " sel" : "");
    b.onclick = () => { stopPlay(); S.frameIdx = i; renderStage(); };
    const c = document.createElement("canvas");
    b.appendChild(c);
    f.appendChild(b);
    drawTo(c, render(S.anim, fr, P.getPalette(row)));
  });
}
const highlightFilm = (): void => {
  document.querySelectorAll("#film .thumb").forEach((b, i) => b.classList.toggle("sel", i === S.frameIdx));
};

function renderStage(): void {
  if (!S.anim) return;
  const fr = S.anim.frames[S.frameIdx];
  const r = render(S.anim, fr, P.getPalette(activeRow(), true), true, input("#chkIso").checked ? S.selIdx : undefined);
  S.last = r;
  const cv = $<HTMLCanvasElement>("#stage");
  drawTo(cv, r);
  const zv = select("#selZoom").value;
  const z = zv === "auto" ? clamp(Math.floor(380 / Math.max(r.CW, r.CH)), 3, 16) : Number(zv);
  cv.style.width = r.CW * z + "px";
  cv.style.height = r.CH * z + "px";
  select("#selFrame").value = String(S.frameIdx);
  highlightFilm();
}

function stopPlay(): void {
  if (S.playTimer !== null) {
    clearInterval(S.playTimer);
    S.playTimer = null;
    $("#btnPlay").textContent = "▶ Play";
  }
}
function togglePlay(): void {
  if (S.playTimer !== null) return stopPlay();
  $("#btnPlay").textContent = "Pause";
  S.playTimer = window.setInterval(() => { S.frameIdx = (S.frameIdx + 1) % S.anim.frames.length; renderStage(); }, 130);
}

// ---------- palette panel ----------
function renderPalette(): void {
  if (!S.anim) return;
  const row = activeRow(), pal = P.getPalette(row, true), box = $("#swatches");
  box.textContent = "";
  for (let c = 0; c < 16; c++) {
    const o = P.palOff(row, c), d = document.createElement("div");
    d.className = "sw" + (c === 0 ? " c0" : "") + (c === S.selIdx ? " sel" : "") + (P.isModified(row, c) ? " mod" : "");
    d.style.backgroundColor = c !== 0 ? colToCss(pal[c]) : "transparent";
    d.title = c === 0
      ? "Index 0 is transparent"
      : `Index ${c} / ROM 0x${hex(o)} / BGR555 0x${hex(pal[c], 4)}` + (P.isShared(row, c) ? " / overlaid in-game from row 1" : "");
    if (P.isShared(row, c)) d.style.borderStyle = "dashed";
    d.innerHTML = `<span>${c}</span>`;
    d.onclick = () => selectIdx(c);
    box.appendChild(d);
  }
  const strip = $("#palStrip");
  strip.textContent = "";
  pal.forEach((v, c) => { const i = document.createElement("i"); i.style.background = c ? colToCss(v) : "#000"; strip.appendChild(i); });
  $("#palInfo").textContent = `ROM 0x${hex(P.palOff(row))}`;
  const n = P.usedBy(row);
  $("#shareNote").textContent = P.overlayRows().includes(row)
    ? `Row ${row} is a Kirby color (${P.knownRows[row]}). In-game, its colors 12-14 are replaced by the shared accent colors stored in row ${SHARED_ROW}, so those three are edited there and affect every color that uses the overlay.`
    : P.knownRows[row] && row !== SHARED_ROW ? `Row ${row} is a Kirby color (${P.knownRows[row]}).`
    : n > 1 ? `Heads up: palette row ${row} is shared by ${n} animations, so changes show up on all of them.`
    : n === 1 ? "This palette is used by one animation." : "No animation uses this palette by default (it may be used by game code instead).";
  updateColorUi();
}
function selectIdx(c: number): void { S.selIdx = c; renderPalette(); if (input("#chkIso").checked) renderStage(); }
function updateColorUi(): void {
  const c = S.selIdx, ok = c > 0, v = P.color(activeRow(), c);
  for (const id of ["#picker", "#inR", "#inG", "#inB"]) input(id).disabled = !ok;
  if (ok) {
    input("#picker").value = colToHex(v);
    input("#inR").value = String(v & 31);
    input("#inG").value = String((v >> 5) & 31);
    input("#inB").value = String((v >> 10) & 31);
  }
  $("#selInfo").textContent = ok ? `index ${c}` : "index 0 = transparent";
}
function setSelColor(v: number, coalesce: boolean): void {
  if (S.selIdx > 0) write([{ off: P.palOff(activeRow(), S.selIdx), val: v }], coalesce);
}

// ---------- stage interaction ----------
interface PixelHit { x: number; y: number; off: number; nib: number; idx: number }
function pixelAt(e: MouseEvent): PixelHit | null {
  const cv = $<HTMLCanvasElement>("#stage"), rc = cv.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rc.left) / rc.width) * cv.width);
  const y = Math.floor(((e.clientY - rc.top) / rc.height) * cv.height);
  const L = S.last;
  if (!L || !L.hit || !L.hidx || x < 0 || y < 0 || x >= L.CW || y >= L.CH) return null;
  const k = y * L.CW + x, h = L.hit[k];
  return { x, y, off: h < 0 ? -1 : h >> 1, nib: h & 1, idx: h < 0 ? 0 : L.hidx[k] };
}
function setMode(m: "pick" | "paint"): void {
  S.mode = m;
  $("#modePick").classList.toggle("on", m === "pick");
  $("#modePaint").classList.toggle("on", m === "paint");
}

// ---------- Kirby color slots ----------
function renderSlots(): void {
  const box = $("#slots");
  if (!P.slots) return;
  const a = S.groups.get(0)?.[0];
  if (!a) return;
  const fr = a.frames[0];
  box.textContent = "";
  P.slots.slots.forEach((s, i) => {
    const row = P.slotRow(i), card = document.createElement("div");
    card.className = "slot";
    const c = document.createElement("canvas");
    drawTo(c, render(a, fr, P.getPalette(row)));
    card.innerHTML = `<div class="stitle">${slotName(i)}</div>`;
    card.insertBefore(c, card.firstChild);
    const rowSel = document.createElement("select");
    rowSel.title = "Which palette row this slot uses";
    for (let r = 0; r < P.db.palRows; r++) {
      const o = document.createElement("option");
      o.value = String(r);
      o.textContent = `Palette row ${r}`;
      rowSel.appendChild(o);
    }
    rowSel.value = String(row);
    rowSel.onchange = () => { P.setSlotRow(i, Number(rowSel.value)); afterEdit(); };
    const mk = (label: string, val: string, idxs: number[], base: number): HTMLLabelElement => {
      const l = document.createElement("label");
      l.className = "small";
      l.textContent = label + " ";
      const inp = document.createElement("input");
      inp.type = "color";
      inp.value = val;
      inp.onchange = () => write(P.rampRecolor(P.slotRow(i), idxs, base, inp.value));
      l.appendChild(inp);
      return l;
    };
    const rowDiv = document.createElement("div");
    rowDiv.className = "row";
    rowDiv.append(
      mk("Body", colToHex(P.color(row, 4)), [2, 3, 4, 5, 6, 7, 8], 4),
      mk("Shoes", colToHex(P.color(row, 9)), [9, 10, 11], 9),
    );
    const btn = document.createElement("button");
    btn.textContent = "Edit all colors";
    btn.onclick = () => {
      S.palRow = P.slotRow(i);
      select("#selGroup").value = "0";
      selectGroup(0);
      select("#selPal").value = String(S.palRow);
      S.selIdx = 4;
      renderPalette();
      renderStage();
      $("#colR").scrollIntoView({ behavior: "smooth" });
    };
    card.append(rowSel, rowDiv, btn);
    if (s.overlay) {
      const n = document.createElement("div");
      n.className = "small dim";
      n.textContent = "colors 12-14 come from row 1";
      card.appendChild(n);
    }
    box.appendChild(card);
  });
}

// ---------- refresh ----------
function afterEdit(): void {
  const row = activeRow();
  renderStage();
  renderPalette();
  buildFilm();
  renderSlots();
  refreshThumbs((_g, a) => P.rowFor(a) === row || (row === SHARED_ROW && P.overlayRows().includes(P.rowFor(a))));
  $<HTMLButtonElement>("#btnUndo").disabled = !rom.canUndo;
  const ch = rom.anyChanged();
  for (const id of ["#btnReset", "#btnSaveEdits", "#btnIps", "#btnRom"]) $<HTMLButtonElement>(id).disabled = !ch;
}

function scopeCols(): number[] {
  if (select("#scope").value === "sel") return S.selIdx > 0 ? [S.selIdx] : [];
  return [...Array(15).keys()].map((i) => i + 1);
}
function applyCols(fn: (c: number) => number): void {
  const cols = scopeCols();
  if (!cols.length) return toast("Select a color (not index 0) first");
  resetSliders();
  write(P.mapColors(activeRow(), cols, fn));
}
function resetSliders(): void {
  input("#sHue").value = input("#sSat").value = input("#sLit").value = "0";
  P.preview = null;
  $("#vHue").textContent = "0°";
  $("#vSat").textContent = "0";
  $("#vLit").textContent = "0";
}
function livePreview(): void {
  const dh = Number(input("#sHue").value), ds = Number(input("#sSat").value), dl = Number(input("#sLit").value);
  $("#vHue").textContent = dh + "°";
  $("#vSat").textContent = String(ds);
  $("#vLit").textContent = String(dl);
  P.preview = null;
  if (dh || ds || dl) {
    P.preview = new Map();
    for (const c of scopeCols()) P.preview.set(c, hslAdjust(P.color(activeRow(), c), dh, ds, dl));
  }
  renderStage();
  renderPalette();
}

// ---------- load ----------
function loadRom(buf: ArrayBuffer, name: string): void {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 0x200 || bytes.length > 0x2000000) return toast("That does not look like a GBA ROM");
  stopPlay();
  const r = new Rom(bytes, name);
  const project = Project.open(r);
  const { title, code } = r.header();
  $("#romInfo").textContent = `${name} / ${(bytes.length / 1048576).toFixed(0)} MB / ${title} [${code}]`;
  if (!project) return toast("Could not find the sprite database in this ROM (is it Kirby & the Amazing Mirror?)");
  rom = r;
  P = project;
  S.palRow = null;
  S.selIdx = 1;
  $("#welcome").hidden = true;
  for (const id of ["#colL", "#colM", "#colR"]) $(id).hidden = false;
  $<HTMLButtonElement>("#btnLoadEdits").disabled = false;
  $("#colK").hidden = !P.slots;
  buildGroups();
  const first = [...S.groups.keys()].sort((a, b) => a - b)[0];
  select("#selGroup").value = String(first);
  selectGroup(first);
  afterEdit();
}
async function openFile(f: File | undefined): Promise<void> {
  if (f) loadRom(await f.arrayBuffer(), f.name);
}

// ---------- wiring ----------
$("#btnOpen").onclick = () => input("#file").click();
input("#file").onchange = (e) => void openFile((e.target as HTMLInputElement).files?.[0]);
let dragDepth = 0;
addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; $("#drop").classList.add("on"); });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#drop").classList.remove("on"); } });
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; $("#drop").classList.remove("on"); void openFile(e.dataTransfer?.files[0]); });

select("#selGroup").onchange = (e) => selectGroup(Number((e.target as HTMLSelectElement).value));
select("#selAnim").onchange = (e) => selectAnim(Number((e.target as HTMLSelectElement).value));
select("#selFrame").onchange = (e) => { stopPlay(); S.frameIdx = Number((e.target as HTMLSelectElement).value); renderStage(); };
$("#btnPrev").onclick = () => { stopPlay(); S.frameIdx = (S.frameIdx - 1 + S.anim.frames.length) % S.anim.frames.length; renderStage(); };
$("#btnNext").onclick = () => { stopPlay(); S.frameIdx = (S.frameIdx + 1) % S.anim.frames.length; renderStage(); };
$("#btnPlay").onclick = togglePlay;
select("#selZoom").onchange = renderStage;
input("#chkIso").onchange = renderStage;
$("#modePick").onclick = () => setMode("pick");
$("#modePaint").onclick = () => setMode("paint");
select("#selPal").onchange = (e) => {
  const v = (e.target as HTMLSelectElement).value;
  S.palRow = v === "" ? null : Number(v);
  resetSliders();
  buildFilm();
  renderStage();
  renderPalette();
};

$("#stage").addEventListener("mousemove", (e) => {
  const p = pixelAt(e as MouseEvent), h = $("#hover");
  if (!p) { h.innerHTML = "&nbsp;"; return; }
  h.textContent = p.off < 0
    ? `(${p.x},${p.y}) transparent`
    : `(${p.x},${p.y}) palette index ${p.idx} / ${colToHex(P.color(activeRow(), p.idx))} / tile byte at ROM 0x${hex(p.off)}`;
});
$("#stage").addEventListener("click", (e) => {
  const p = pixelAt(e as MouseEvent);
  if (!p || p.off < 0) return;
  if (S.mode === "pick") { selectIdx(p.idx); input("#picker").focus(); return; }
  if (S.selIdx === p.idx) return;
  const old = rom.data[p.off];
  const nv = p.nib ? (old & 0x0f) | (S.selIdx << 4) : (old & 0xf0) | S.selIdx;
  writeRaw([{ off: p.off, val: nv }]);
  toast("Pixel painted. Other frames that share this tile will change too.");
});

input("#overallColor").onchange = (e) => {
  const r = P.overallRecolor(activeRow(), (e.target as HTMLInputElement).value, S.anim);
  resetSliders();
  write(r.changes);
  $("#overallInfo").textContent = `Used index ${r.idx} as main color, ${r.anims || 1} animation${r.anims > 1 ? "s" : ""} affected`;
};
input("#picker").oninput = (e) => {
  const [r, g, b] = parseHexColor((e.target as HTMLInputElement).value);
  setSelColor(rgbToCol(r, g, b), true);
};
input("#picker").onchange = () => rom.endGesture();
for (const id of ["#inR", "#inG", "#inB"]) {
  input(id).onchange = () => {
    const ch = (s: string) => clamp(Math.trunc(Number(input(s).value)) || 0, 0, 31);
    setSelColor(ch("#inR") | (ch("#inG") << 5) | (ch("#inB") << 10), false);
  };
}
for (const id of ["#sHue", "#sSat", "#sLit", "#scope"]) $(id).oninput = livePreview;
$("#btnApplyHSL").onclick = () => {
  const dh = Number(input("#sHue").value), ds = Number(input("#sSat").value), dl = Number(input("#sLit").value);
  if (!dh && !ds && !dl) return toast("Move a slider first");
  applyCols((c) => hslAdjust(c, dh, ds, dl));
};
$("#btnGray").onclick = () => applyCols(grayscale);
$("#btnInvert").onclick = () => applyCols(invert);
select("#swap").onchange = (e) => {
  const el = e.target as HTMLSelectElement, order = el.value as ChannelOrder | "";
  el.value = "";
  if (order) applyCols((c) => swapChannels(c, order));
};

$("#btnUndo").onclick = () => { if (rom.undo()) afterEdit(); };
$("#btnReset").onclick = () => {
  if (!confirm("Discard all edits and restore the original ROM data?")) return;
  rom.reset();
  refreshThumbs();
  afterEdit();
};
$("#btnRom").onclick = () => download(`${baseName()} (recolor).gba`, rom.data as BlobPart);
$("#btnIps").onclick = () => download(`${baseName()} (recolor).ips`, rom.buildIps() as BlobPart);
$("#btnSaveEdits").onclick = () => download(`${baseName()} edits.json`, rom.exportEdits("KirbySpriteStudio"), "application/json");
$("#btnLoadEdits").onclick = () => input("#editsFile").click();
input("#editsFile").onchange = async (e) => {
  const el = e.target as HTMLInputElement;
  try {
    const n = rom.importEdits(await el.files![0].text());
    refreshThumbs();
    afterEdit();
    toast(`Applied ${n} bytes of edits`);
  } catch {
    toast("Could not read that edits file");
  }
  el.value = "";
};
addEventListener("keydown", (e) => {
  if (!rom || !P || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? "")) return;
  if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); if (rom.undo()) afterEdit(); }
  else if (e.key === "ArrowRight") $("#btnNext").click();
  else if (e.key === "ArrowLeft") $("#btnPrev").click();
});

// Handy for automated testing and debugging in the browser console.
(window as unknown as { KSS: unknown }).KSS = { loadRom, S, get P() { return P; }, get rom() { return rom; } };
