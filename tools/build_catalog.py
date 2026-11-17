"""Build data/buildings.json and assets/buildings/*.png from the Mini War fandom wikis.

Stats and sizes come from miniwar-roblox.fandom.com (the maintained wiki).
Icons, plus sizes the maintained wiki lacks, come from mini-war-roblox.fandom.com.

Buildings neither wiki has a stat card for go in data/extra-buildings.json.
Sizes neither wiki lists go in data/size-overrides.json as {"Building Name": [w, h]}.

Run from the repo root:  python3 tools/build_catalog.py
"""
import html
import json
import math
import re
import urllib.parse
import urllib.request
from pathlib import Path

MAIN_API = "https://miniwar-roblox.fandom.com/api.php"
ICON_API = "https://mini-war-roblox.fandom.com/api.php"
MAIN_PAGES = {"Factories": "Factory", "Houses": "House", "Military": "Military",
              "Special": "Special", "Black Market": "Black Market"}
ROOT = Path(__file__).resolve().parent.parent
INT_FIELDS = {"civilian slots": "civilianSlots", "max possible super workers": "maxSuperWorkers",
              "civilians": "civilians"}
HEADERS = {"User-Agent": "miniwar-base-planner/1.0"}


def api_get(api, params):
    url = api + "?" + urllib.parse.urlencode({**params, "format": "json"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS)) as r:
        return json.load(r)


def fetch_wikitext(api, titles):
    pages = {}
    for i in range(0, len(titles), 50):
        d = api_get(api, {"action": "query", "prop": "revisions", "rvprop": "content",
                          "rvslots": "main", "titles": "|".join(titles[i:i + 50])})
        for p in d["query"]["pages"].values():
            if "revisions" in p:
                pages[p["title"]] = p["revisions"][0]["slots"]["main"]["*"]
    return pages


def all_titles(api):
    d = api_get(api, {"action": "query", "list": "allpages", "aplimit": 500})
    assert "continue" not in d, "more than 500 pages: add pagination"
    return [p["title"] for p in d["query"]["allpages"]]


def clean(s):
    return html.unescape(re.sub(r"<[^>]+>|'''|''", "", s)).replace("’", "'").strip()


def parse_size(s):
    m = re.search(r"([\d.]+)\s*x\s*([\d.]+)", s)
    return [math.ceil(float(m.group(1))), math.ceil(float(m.group(2)))] if m else None


def parse_cards(wikitext, category):
    cards = []
    for block in wikitext.split('<div class="mw-data-card')[1:]:
        title = re.search(r'mw-card-title">(.*?)</div>', block, re.S)
        tier = re.search(r'mw-card-tier">(.*?)</div>', block, re.S)
        stats = [clean(s) for s in re.findall(r'class="mw-stat[^"]*">(.*?)</div>', block, re.S)]
        card = {"name": clean(title.group(1)), "category": category,
                "rarity": clean(tier.group(1)).split("•")[0].strip(), "stats": stats}
        for s in stats:
            key, _, val = s.partition(":")
            key = key.strip().lower()
            if key == "size":
                card["size"] = parse_size(val)
            elif key in INT_FIELDS and re.search(r"\d", val):
                card[INT_FIELDS[key]] = int(re.sub(r"\D", "", val))
        cards.append(card)
    return cards


def parse_gem_production(card):
    """'+4 / 30 min' (per worker) -> (gems per worker per cycle, cycle seconds)."""
    stat = next(s for s in card["stats"] if s.startswith("Production:"))
    m = re.search(r"\+([\d.]+)\s*/\s*(\d+)\s*(min|s|hr)", stat)
    amount, period, unit = float(m.group(1)), int(m.group(2)), m.group(3)
    seconds = period * {"s": 1, "min": 60, "hr": 3600}[unit]
    return amount, seconds


def parse_icon_wiki(pages):
    info = {}
    for title, text in pages.items():
        img = re.search(r'mw-detail-hero-img">\[\[File:([^|\]]+)', text)
        size = re.search(r'Size</div>\s*<div class="mw-detail-stat-value">([^<]+)<', text)
        info[title.lower()] = {"image": img.group(1).strip() if img else None,
                               "size": parse_size(size.group(1)) if size else None}
    return info


def download_icons(file_names, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    urls = {}
    names = sorted(set(file_names))
    for i in range(0, len(names), 50):
        d = api_get(ICON_API, {"action": "query", "prop": "imageinfo", "iiprop": "url",
                               "titles": "|".join("File:" + n for n in names[i:i + 50])})
        for p in d["query"]["pages"].values():
            if "imageinfo" in p:
                urls[p["title"][5:].replace(" ", "_").lower()] = p["imageinfo"][0]["url"]
    for n in names:
        target = out_dir / icon_file(n)
        if not target.exists():
            req = urllib.request.Request(urls[n.replace(" ", "_").lower()], headers=HEADERS)
            with urllib.request.urlopen(req) as r:
                target.write_bytes(r.read())


def icon_file(wiki_file_name):
    return slug(Path(wiki_file_name).stem) + ".png"


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    main_pages = fetch_wikitext(MAIN_API, list(MAIN_PAGES))
    cards = [c for page, cat in MAIN_PAGES.items() for c in parse_cards(main_pages[page], cat)]
    icon_info = parse_icon_wiki(fetch_wikitext(ICON_API, all_titles(ICON_API)))
    size_overrides = json.loads((ROOT / "data" / "size-overrides.json").read_text())
    cards += json.loads((ROOT / "data" / "extra-buildings.json").read_text())
    gem_mine = next(c for c in cards if c["name"] == "Gem Mine")
    gem_mine["gemsPerCycle"], gem_mine["cycleSeconds"] = parse_gem_production(gem_mine)

    buildings, icons, missing_size = [], [], []
    for c in cards:
        extra = icon_info.get(c["name"].lower(), {})
        size = size_overrides.get(c["name"]) or c.get("size") or extra.get("size")
        if not size:
            missing_size.append(c["name"])
        b = {"id": slug(c["name"]), "name": c["name"], "category": c["category"],
             "rarity": c["rarity"], "size": size, "stats": c["stats"]}
        for k in ("civilianSlots", "maxSuperWorkers", "civilians", "gemsPerCycle", "cycleSeconds"):
            if k in c:
                b[k] = c[k]
        image = c.get("image") or extra.get("image")
        if image:
            b["icon"] = "assets/buildings/" + icon_file(image)
            icons.append(image)
        buildings.append(b)

    download_icons(icons, ROOT / "assets" / "buildings")
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "buildings.json").write_text(json.dumps(buildings, indent=1))
    print(f"{len(buildings)} buildings, {len(icons)} icons")
    print("missing size:", missing_size)
    print("missing icon:", [b["name"] for b in buildings if "icon" not in b])


if __name__ == "__main__":
    main()
