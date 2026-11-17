import {
  PLOT_SIZES, MAX_GENERALS, SUPER_WORKER_GEM_BONUS, MUTATIONS, RESEARCH_SPEED, RESEARCH_AUTOMATION,
  GENERALS, STATUES, CATEGORY_COLORS,
} from "./rules.js";

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
  return "gemsPerCycle" in catalog[item.id];
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
  const plot = plotSize();
  if (x < 0 || y < 0 || x + w > plot.cols || y + h > plot.rows) return false;
  return state.items.every((o) => {
    if (o.uid === item.uid) return true;
    const [ow, oh] = footprint(o);
    return x + w <= o.x || o.x + ow <= x || y + h <= o.y || o.y + oh <= y;
  });
}

function center(item) {
  const [w, h] = footprint(item);
  return { x: item.x + w / 2, y: item.y + h / 2 };
}

// Strongest statue whose radius reaches the item's center (statue boosts don't stack).
function statueSpeed(item) {
  const c = center(item);
  return state.items
    .filter((s) => STATUES[s.id])
    .filter((s) => Math.hypot(center(s).x - c.x, center(s).y - c.y) <= STATUES[s.id].radius)
    .reduce((best, s) => Math.max(best, STATUES[s.id].speed), 0);
}

function plotSize() {
  return PLOT_SIZES[state.biggerPlot ? "bigger" : "normal"];
}

function maxGenerals() {
  return MAX_GENERALS[state.boosts.generalsGamepass ? "gamepass" : "normal"];
}

function generalsSpeed() {
  return state.boosts.generals.reduce((sum, g) => sum + GENERALS[g], 0);
}

function speedMultiplier(item) {
  return 1 + RESEARCH_SPEED[state.boosts.research] + generalsSpeed() + statueSpeed(item);
}

function gemsPerHour(item) {
  const b = catalog[item.id];
  const perWorkerCycle = b.gemsPerCycle + RESEARCH_AUTOMATION[state.boosts.automation];
  const workerUnits = item.workers + item.superWorkers * (1 + SUPER_WORKER_GEM_BONUS);
  const cyclesPerHour = 3600 / b.cycleSeconds;
  return perWorkerCycle * workerUnits * cyclesPerHour * speedMultiplier(item) * MUTATIONS[item.mutation];
}

function superWorkerCapacity() {
  return state.items.reduce((sum, i) => sum + (catalog[i.id].maxSuperWorkers ?? 0), 0);
}

// ---------- persistence ----------

function snapshot() {
  const { biggerPlot, items, boosts } = state;
  return JSON.stringify({ biggerPlot, items, boosts });
}

function encodeLayout() {
  return btoa(String.fromCharCode(...new TextEncoder().encode(snapshot())));
}

function decodeLayout(text) {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0))));
}

function loadLayout() {
  const shared = location.hash.slice(1);
  const saved = localStorage.getItem(STORAGE_KEY);
  const layout = shared ? decodeLayout(shared) : saved ? JSON.parse(saved) : newLayout();
  for (const item of layout.items) {
    if (!catalog[item.id]) throw new Error(`Unknown building in layout: ${item.id}`);
  }
  return { ...layout, selected: null };
}

function newLayout() {
  return {
    biggerPlot: false,
    items: [],
    boosts: { research: "None", automation: "None", generals: [], generalsGamepass: false },
  };
}

function save() {
  localStorage.setItem(STORAGE_KEY, snapshot());
}

// ---------- mutations ----------

function commit(change) {
  undoStack.push(snapshot());
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
  const plot = plotSize();
  for (let y = 0; y < plot.rows; y++) {
    for (let x = 0; x < plot.cols; x++) {
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

function setBiggerPlot(bigger) {
  const { cols, rows } = PLOT_SIZES[bigger ? "bigger" : "normal"];
  const outside = state.items.filter((i) => {
    const [w, h] = footprint(i);
    return i.x + w > cols || i.y + h > rows;
  });
  if (outside.length) {
    alert(`${outside.length} building(s) would fall outside a ${cols}×${rows} plot. Move them first.`);
    render();
    return;
  }
  commit(() => { state.biggerPlot = bigger; });
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
  const plot = plotSize();
  grid.style.width = `calc(var(--cell) * ${plot.cols})`;
  grid.style.height = `calc(var(--cell) * ${plot.rows})`;
  grid.replaceChildren();
  for (const item of state.items) {
    const el = placeElement(item, item.uid === state.selected ? "selected" : "");
    positionElement(el, item.x, item.y);
    if (isGemMine(item)) el.insertAdjacentHTML("beforeend", `<span class="gems">${format(gemsPerHour(item))}/h</span>`);
    el.addEventListener("pointerdown", (e) => startDrag(e, e.altKey ? "copy" : "move", item));
    grid.append(el);
  }
  const selected = selectedItem();
  if (selected && STATUES[selected.id]) grid.append(radiusElement(selected));
  $("biggerPlot").checked = state.biggerPlot;
  $("plotSize").textContent = `${plot.cols}×${plot.rows}`;
}

function radiusElement(statue) {
  const { radius } = STATUES[statue.id];
  const c = center(statue);
  const el = document.createElement("div");
  el.className = "radius";
  el.style.width = el.style.height = `calc(var(--cell) * ${radius * 2})`;
  positionElement(el, c.x - radius, c.y - radius);
  return el;
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
  if (!item) return renderBoosts(panel);
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
  return `
    <label>Workers <input type="number" name="workers" min="0" max="${b.civilianSlots}" value="${item.workers}"></label>
    <label>Super workers <input type="number" name="superWorkers" min="0" max="${b.civilianSlots}" value="${item.superWorkers}"></label>
    <label>Mutation <select name="mutation">${options(Object.keys(MUTATIONS), item.mutation)}</select></label>
    <div class="muted">${b.civilianSlots} civilian slots shared by workers and super workers</div>
    <div class="mine-output">This mine: <strong>${format(gemsPerHour(item))}</strong> gems/h</div>
    <div class="muted">Speed ×${format(speedMultiplier(item))} (statue +${format(statueSpeed(item) * 100)}%)</div>`;
}

function options(values, selected) {
  return values.map((v) => `<option ${v === selected ? "selected" : ""}>${v}</option>`).join("");
}

function renderBoosts(panel) {
  const { research, automation, generals, generalsGamepass } = state.boosts;
  const full = generals.length >= maxGenerals();
  panel.innerHTML = `
    <h2>Boosts</h2>
    <p class="muted">Apply to every gem mine. Select a building to edit it.</p>
    <label>Production research <select name="research">${options(Object.keys(RESEARCH_SPEED), research)}</select></label>
    <label>Automation research <select name="automation">${options(Object.keys(RESEARCH_AUTOMATION), automation)}</select></label>
    <h3>Generals (${generals.length} / ${maxGenerals()})</h3>
    <label class="check"><span><input type="checkbox" name="generalsGamepass" ${generalsGamepass ? "checked" : ""}> Extra general gamepass</span></label>
    ${Object.entries(GENERALS).map(([g, v]) => {
      const checked = generals.includes(g);
      return `
      <label class="check"><span><input type="checkbox" name="general" value="${g}" ${checked ? "checked" : ""} ${full && !checked ? "disabled" : ""}> ${g}</span>
      <span class="muted">+${format(v * 100)}%</span></label>`;
    }).join("")}
    <p class="muted">Statues boost mines within their radius. Select a statue to see its range.</p>`;
  for (const name of ["research", "automation"]) {
    panel.querySelector(`[name=${name}]`).onchange = (e) => commit(() => { state.boosts[name] = e.target.value; });
  }
  for (const box of panel.querySelectorAll("[name=general]")) {
    box.onchange = () => commit(() => {
      state.boosts.generals = [...panel.querySelectorAll("[name=general]:checked")].map((b) => b.value);
    });
  }
  panel.querySelector("[name=generalsGamepass]").onchange = (e) => commit(() => {
    state.boosts.generalsGamepass = e.target.checked;
    state.boosts.generals = state.boosts.generals.slice(0, maxGenerals());
  });
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
$("biggerPlot").onchange = (e) => setBiggerPlot(e.target.checked);

window.history.replaceState(null, "", location.pathname);
save();
renderPalette();
render();
