# MiniWar Base Planner

Plan Mini War (Roblox) base layouts on a stud grid and see your gem income.

- Drag buildings from the sidebar onto the plot, drag to move, Alt+drag or Ctrl+D to duplicate, R to rotate, Del to remove, Ctrl+Z to undo.
- Select a Gem Mine to set its workers, super workers and mutation. The header shows total gems per hour and per day, plus super workers assigned against the capacity of your placed houses.
- Layouts autosave in the browser. "Copy share link" puts the whole layout in a URL.

## Run

It's a static site. Serve the folder with any web server:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. It also deploys as-is to GitHub Pages.

## Data

- `data/buildings.json` and `assets/buildings/` are generated from the fan wikis by `python3 tools/build_catalog.py`. Re-run it when the wiki updates.
- Sizes the wikis don't list go in `data/size-overrides.json` as `{"Building Name": [w, h]}`. Re-run the script afterwards. Buildings without a size show greyed out.
- Gem formula and mutation multipliers live in `rules.js`:
  `gems/h = gems per worker per hour × (workers + 1.5 × super workers) × mutation`
- Buildings the wikis have no stat card for (e.g. Gem Deep Mine) go in `data/extra-buildings.json`.

Building data and icons come from the community wikis (miniwar-roblox.fandom.com and mini-war-roblox.fandom.com). This is a fan tool, not affiliated with Roblox or the game's developers.
