// Hand-maintained game rules. Building stats live in data/buildings.json (generated).

// Default plot size in studs. Editable in the toolbar (Bigger Plot research adds rows).
export const DEFAULT_PLOT = { cols: 170, rows: 128 };

// Each worker adds the mine's per-worker output; a super worker adds 50% more than a normal one.
export const SUPER_WORKER_GEM_BONUS = 0.5;

// Gem mine mutations and their production speed multipliers.
// Alien is 2x; the others are roughly 1.5x–1.75x.
export const MUTATIONS = { None: 1, Alien: 2, Anomaly: 1.75, Radioactive: 1.5 };

export const CATEGORY_COLORS = {
  Factory: "#3f6212",
  House: "#92400e",
  Military: "#7f1d1d",
  Special: "#334155",
  "Black Market": "#4c1d95",
};
