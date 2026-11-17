// Hand-maintained game rules. Building stats live in data/buildings.json (generated).

// Default plot size in studs. Editable in the toolbar (Bigger Plot research adds rows).
export const DEFAULT_PLOT = { cols: 100, rows: 100 };

// Super worker bonus on gem mines (wiki: +50% production speed per super worker).
export const SUPER_WORKER_GEM_BONUS = 0.5;

// Gem mine mutations and their production multipliers.
export const MUTATIONS = { None: 1 };

export const CATEGORY_COLORS = {
  Factory: "#3f6212",
  House: "#92400e",
  Military: "#7f1d1d",
  Special: "#334155",
  "Black Market": "#4c1d95",
};
