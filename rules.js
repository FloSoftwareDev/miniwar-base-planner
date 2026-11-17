// Hand-maintained game rules. Building stats live in data/buildings.json (generated).

// Plot size in studs, without and with the Bigger Plot research.
export const PLOT_SIZES = { normal: { cols: 128, rows: 112 }, bigger: { cols: 160, rows: 128 } };

// Generals you can equip at once, without and with the gamepass.
export const MAX_GENERALS = { normal: 2, gamepass: 3 };

// Each worker adds the mine's per-worker output; a super worker adds 50% more than a normal one.
export const SUPER_WORKER_GEM_BONUS = 0.5;

// Gem mine mutations and their production speed multipliers.
// Alien is 2x; the others are roughly 1.5x–1.75x.
export const MUTATIONS = { None: 1, Alien: 2, Anomaly: 1.75, Radioactive: 1.5 };

// Production research applies to gem mines the same way it does to factories.
// Production speed research: higher tiers replace lower ones.
export const RESEARCH_SPEED = { None: 0, "Fast Workers": 0.1, "Mass Production": 0.15, "Smart Factories": 0.25 };

// Extra resources per worker per production cycle.
export const RESEARCH_AUTOMATION = { None: 0, Automation: 1 };

// Generals with a production speed bonus. Bonuses of equipped generals add up.
export const GENERALS = {
  "Farmer General": 0.05,
  "Rich Businessman": 0.1,
  Emperor: 0.05,
  "Corrupted General": 0.075,
  "Null General": 0.05,
  "Necromancer General": 0.05,
};

// Worker speed statues by building id. Radius in studs, measured center to center.
// Only the strongest statue in range of a mine counts.
export const STATUES = {
  "worker-statue": { speed: 0.1, radius: 10 },
  "worker-statue-v2": { speed: 0.2, radius: 20 },
  "manager-statue": { speed: 0.25, radius: 15 },
};

export const CATEGORY_COLORS = {
  Factory: "#3f6212",
  House: "#92400e",
  Military: "#7f1d1d",
  Special: "#334155",
  "Black Market": "#4c1d95",
};
