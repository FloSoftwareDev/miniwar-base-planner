import { DEFAULT_PLOT, SUPER_WORKER_GEM_BONUS, MUTATIONS, CATEGORY_COLORS } from "./rules.js";

const STORAGE_KEY = "miniwar-planner-layout";
const $ = (id) => document.getElementById(id);

const catalog = await loadCatalog();
const state = loadLayout();
const undoStack = [];
let drag = null;

// ---------- data ----------

async function loadCatalog() {
  const res = await fetch("data/buildings.json");
  if (!res.ok) throw new Error(`Failed to load building data: ${res.status}`);
  const list = await res.json();
  return Object.fromEntries(list.map((b) => [b.id, b]));
}

function isGemMine(item) {
  return "gemsPerWorkerHour" in catalog[item.id];
}

function newItem(id, x, y, rot) {
  const item = { uid: crypto.randomUUID(), id, x, y, rot };
  if (isGemMine(item)) Object.assign(item, { workers: 0, superWorkers: 0, mutation: "None" });
  return item;
}

function footprint(item) {
  const [w, h] = catalog[item.id].size;
  return item.rot ? [h, w] : [w, h];
}

function fits(item, x, y) {
  const [w, h] = footprint(item);
  if (x < 0 || y < 0 || x + w > state.cols || y + h > state.rows) return false;
  return state.items.every((o) => {
    if (o.uid === item.uid) return true;
    const [ow, oh] = footprint(o);
    return x + w <= o.x || o.x + ow <= x || y + h <= o.y || o.y + oh <= y;
  });
}

function gemsPerHour(item) {
  const workerUnits = item.workers + item.superWorkers * (1 + SUPER_WORKER_GEM_BONUS);
  return catalog[item.id].gemsPerWorkerHour * workerUnits * MUTATIONS[item.mutation];
}

function superWorkerCapacity() {
  return state.items.reduce((sum, i) => sum + (catalog[i.id].maxSuperWorkers ?? 0), 0);
}

// ---------- persistence ----------

function encodeLayout() {
  const { cols, rows, items } = state;
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ cols, rows, items }))));
}

function decodeLayout(text) {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0))));
}

function loadLayout() {
  const shared = location.hash.slice(1);
  const saved = localStorage.getItem(STORAGE_KEY);
  const layout = shared ? decodeLayout(shared) : saved ? JSON.parse(saved) : { ...DEFAULT_PLOT, items: [] };
  for (const item of layout.items) {
    if (!catalog[item.id]) throw new Error(`Unknown building in layout: ${item.id}`);
  }
  return { ...layout, selected: null };
}

function save() {
  const { cols, rows, items } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ cols, rows, items }));
}

// ---------- mutations ----------

function commit(change) {
  undoStack.push(JSON.stringify({ cols: state.cols, rows: state.rows, items: state.items }));
  change();
  save();
  render();
}

function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  Object.assign(state, JSON.parse(prev));
  if (!state.items.some((i) => i.uid === state.selected)) state.selected = null;
  save();
  render();
}

function selectedItem() {
  return state.items.find((i) => i.uid === state.selected);
}

function rotate(item) {
  const turned = { ...item, rot: item.rot ? 0 : 1 };
  if (!fits(turned, item.x, item.y)) return;
  commit(() => { item.rot = turned.rot; });
}

function nearestFreeSpot(item) {
  let best = null;
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      const d = Math.abs(x - item.x) + Math.abs(y - item.y);
      if ((!best || d < best.d) && fits(item, x, y)) best = { x, y, d };
    }
  }
  return best;
}

function duplicate(item) {
  const copy = { ...item, uid: crypto.randomUUID() };
  const spot = nearestFreeSpot(copy);
  if (!spot) return alert("No free space for a copy.");
  commit(() => {
    state.items.push({ ...copy, x: spot.x, y: spot.y });
    state.selected = copy.uid;
  });
}

function remove(item) {
  commit(() => {
    state.items = state.items.filter((i) => i.uid !== item.uid);
    state.selected = null;
  });
}

function resizePlot(cols, rows) {
  const outside = state.items.filter((i) => {
    const [w, h] = footprint(i);
    return i.x + w > cols || i.y + h > rows;
  });
  if (outside.length) {
    alert(`${outside.length} building(s) would fall outside a ${cols}×${rows} plot. Move them first.`);
    render();
    return;
  }
  commit(() => { state.cols = cols; state.rows = rows; });
}

// ---------- rendering ----------

function render() {
  renderGrid();
  renderStats();
  renderInspector();
}

function cellPx() {
  return Number($("zoom").value);
}

function placeElement(item, cls) {
  const b = catalog[item.id];
  const [w, h] = footprint(item);
  const el = document.createElement("div");
  el.className = `placed ${cls}`;
  el.style.background = CATEGORY_COLORS[b.category];
  el.style.width = `calc(var(--cell) * ${w})`;
  el.style.height = `calc(var(--cell) * ${h})`;
  el.title = b.name;
  if (b.icon) el.innerHTML = `<img src="${b.icon}" alt="">`;
  el.insertAdjacentHTML("beforeend", `<span class="label">${b.name}</span>`);
  return el;
}

function positionElement(el, x, y) {
  el.style.left = `calc(var(--cell) * ${x})`;
  el.style.top = `calc(var(--cell) * ${y})`;
}

function renderGrid() {
  const grid = $("grid");
  grid.style.width = `calc(var(--cell) * ${state.cols})`;
  grid.style.height = `calc(var(--cell) * ${state.rows})`;
  grid.replaceChildren();
  for (const item of state.items) {
    const el = placeElement(item, item.uid === state.selected ? "selected" : "");
    positionElement(el, item.x, item.y);
    if (isGemMine(item)) el.insertAdjacentHTML("beforeend", `<span class="gems">${format(gemsPerHour(item))}/h</span>`);
    el.addEventListener("pointerdown", (e) => startDrag(e, e.altKey ? "copy" : "move", item));
    grid.append(el);
  }
  $("plotCols").value = state.cols;
  $("plotRows").value = state.rows;
}

function renderStats() {
  const mines = state.items.filter(isGemMine);
  const total = mines.reduce((sum, m) => sum + gemsPerHour(m), 0);
  const assigned = mines.reduce((sum, m) => sum + m.superWorkers, 0);
  $("gemsHour").textContent = format(total);
  $("gemsDay").textContent = format(total * 24);
  $("superWorkers").textContent = `${assigned} / ${superWorkerCapacity()}`;
}

function format(n) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function renderInspector() {
  const panel = $("inspector");
  const item = selectedItem();
  if (!item) {
    panel.innerHTML = `<p class="muted">Select a building to edit it.</p>`;
    return;
  }
  const b = catalog[item.id];
  const [w, h] = footprint(item);
  panel.innerHTML = `
    <h2>${b.name}</h2>
    <div class="muted">${b.rarity} · ${b.category} · ${w}×${h}</div>
    <div class="buttons">
      <button data-action="rotate">Rotate</button>
      <button data-action="duplicate">Duplicate</button>
      <button data-action="remove">Delete</button>
    </div>
    ${isGemMine(item) ? gemMineControls(item, b) : ""}
    <ul>${b.stats.map((s) => `<li>${s}</li>`).join("")}</ul>`;
  panel.querySelector("[data-action=rotate]").onclick = () => rotate(item);
  panel.querySelector("[data-action=duplicate]").onclick = () => duplicate(item);
  panel.querySelector("[data-action=remove]").onclick = () => remove(item);
  if (isGemMine(item)) bindGemMineControls(panel, item, b);
}

function gemMineControls(item, b) {
  const options = Object.keys(MUTATIONS)
    .map((m) => `<option ${m === item.mutation ? "selected" : ""}>${m}</option>`).join("");
  return `
    <label>Workers <input type="number" name="workers" min="0" max="${b.civilianSlots}" value="${item.workers}"></label>
    <label>Super workers <input type="number" name="superWorkers" min="0" max="${b.civilianSlots}" value="${item.superWorkers}"></label>
    <label>Mutation <select name="mutation">${options}</select></label>
    <div class="muted">${b.civilianSlots} civilian slots shared by workers and super workers</div>
    <div class="mine-output">This mine: <strong>${format(gemsPerHour(item))}</strong> gems/h</div>`;
}

function bindGemMineControls(panel, item, b) {
  for (const name of ["workers", "superWorkers"]) {
    const other = name === "workers" ? "superWorkers" : "workers";
    panel.querySelector(`[name=${name}]`).onchange = (e) => {
      const value = Math.max(0, Math.min(Number(e.target.value), b.civilianSlots - item[other]));
      commit(() => { item[name] = value; });
    };
  }
  panel.querySelector("[name=mutation]").onchange = (e) => commit(() => { item.mutation = e.target.value; });
}

function renderPalette() {
  const query = $("search").value.toLowerCase();
  const palette = $("palette");
  palette.replaceChildren();
  const byCategory = Object.groupBy(
    Object.values(catalog).filter((b) => b.name.toLowerCase().includes(query)),
    (b) => b.category,
  );
  for (const [category, buildings] of Object.entries(byCategory)) {
    palette.insertAdjacentHTML("beforeend", `<h3>${category}</h3>`);
    for (const b of buildings) {
      const el = document.createElement("div");
      el.className = `palette-item ${b.size ? "" : "disabled"}`;
      el.title = b.size ? b.name : `${b.name}: size unknown, add it to data/size-overrides.json`;
      el.innerHTML = `${b.icon ? `<img src="${b.icon}" alt="">` : `<span class="noicon"></span>`}
        <span>${b.name}</span><span class="size">${b.size ? b.size.join("×") : "size ?"}</span>`;
      if (b.size) el.addEventListener("pointerdown", (e) => startDrag(e, "new", newItem(b.id, 0, 0, 0)));
      palette.append(el);
    }
  }
}

// ---------- dragging ----------

function startDrag(e, mode, item) {
  if (e.button !== 0) return;
  e.preventDefault();
  const [w, h] = footprint(item);
  const dragged = mode === "move" ? item : { ...item, uid: crypto.randomUUID() };
  const grab = mode === "new"
    ? { x: w / 2, y: h / 2 }
    : { x: pointerCell(e).x - item.x, y: pointerCell(e).y - item.y };
  const ghost = placeElement(dragged, "ghost");
  $("grid").append(ghost);
  drag = { mode, item: dragged, original: item, grab, ghost, target: null, moved: false };
  if (mode !== "new") {
    state.selected = item.uid;
    renderInspector();
  }
  moveDrag(e);
}

function pointerCell(e) {
  const rect = $("grid").getBoundingClientRect();
  return { x: (e.clientX - rect.left) / cellPx(), y: (e.clientY - rect.top) / cellPx() };
}

function moveDrag(e) {
  const p = pointerCell(e);
  const x = Math.round(p.x - drag.grab.x);
  const y = Math.round(p.y - drag.grab.y);
  drag.moved ||= drag.mode === "new" || x !== drag.original.x || y !== drag.original.y;
  drag.target = fits(drag.item, x, y) ? { x, y } : null;
  positionElement(drag.ghost, x, y);
  drag.ghost.classList.toggle("invalid", !drag.target);
}

function endDrag() {
  const { mode, item, target, ghost, moved } = drag;
  ghost.remove();
  drag = null;
  if (!target || !moved) return render();
  commit(() => {
    if (mode === "move") Object.assign(item, target);
    else state.items.push({ ...item, ...target });
    state.selected = item.uid;
  });
}

// ---------- wiring ----------

window.addEventListener("pointermove", (e) => drag && moveDrag(e));
window.addEventListener("pointerup", () => drag && endDrag());

$("grid").addEventListener("pointerdown", (e) => {
  if (e.target !== e.currentTarget) return;
  state.selected = null;
  render();
});

window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select")) return;
  const item = selectedItem();
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === "z") { e.preventDefault(); undo(); }
  else if ((e.ctrlKey || e.metaKey) && key === "d" && item) { e.preventDefault(); duplicate(item); }
  else if (key === "r" && item) rotate(item);
  else if ((key === "delete" || key === "backspace") && item) remove(item);
  else if (key === "escape") { state.selected = null; render(); }
});

$("zoom").addEventListener("input", (e) => document.documentElement.style.setProperty("--cell", `${e.target.value}px`));
$("search").addEventListener("input", renderPalette);
$("undoBtn").onclick = undo;
$("clearBtn").onclick = () => confirm("Remove all buildings?") && commit(() => { state.items = []; state.selected = null; });
$("shareBtn").onclick = async () => {
  const url = `${location.origin}${location.pathname}#${encodeLayout()}`;
  await navigator.clipboard.writeText(url);
  $("shareBtn").textContent = "Link copied!";
  setTimeout(() => { $("shareBtn").textContent = "Copy share link"; }, 1500);
};
for (const id of ["plotCols", "plotRows"]) {
  $(id).onchange = () => resizePlot(Number($("plotCols").value), Number($("plotRows").value));
}

window.history.replaceState(null, "", location.pathname);
save();
renderPalette();
render();
