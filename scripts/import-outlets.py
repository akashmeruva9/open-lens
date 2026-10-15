#!/usr/bin/env python3
"""Merge researched news outlets into data/sources/{allowlist,feeds}.json.

Usage: python3 scripts/import-outlets.py outlets-a.json [outlets-b.json ...]

Each input is an array of researched outlets (feed checked live, robots.txt checked, lean from a
published rater). Outlets are added as quote-only sources: OpenLens reads them for fact extraction,
then publishes its own writing with attribution, a link and short quotes. Paywalled or
robots-blocked outlets are skipped. Existing domains/feed ids are left untouched.
"""
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLOW = ROOT / "data/sources/allowlist.json"
FEEDS = ROOT / "data/sources/feeds.json"
QUOTE_ONLY_USAGE = "link-and-short-quote"  # keep in sync with packages/config QUOTE_ONLY_USAGE
TODAY = date.today().isoformat()


def rating_basis(o):
    if o.get("lens") in ("left", "center", "right") and o.get("rater"):
        url = f" {o['ratingUrl']}" if o.get("ratingUrl") else ""
        return f"{o['rater']}: {o.get('raterLabel', o['lens'])} (checked {TODAY}){url}"
    return f"No published rating found (AllSides, Ad Fontes Media, MBFC checked {TODAY})"


def main(paths):
    allow = json.loads(ALLOW.read_text())
    feeds = json.loads(FEEDS.read_text())
    have_domains = {e["domain"] for e in allow["entries"]}
    have_feeds = {f["id"] for f in feeds["feeds"]}
    added_a = added_f = 0
    skipped = []
    for p in paths:
        for o in json.loads(Path(p).read_text()):
            if o.get("paywall"):
                skipped.append(f"{o['publisher']}: paywall")
                continue
            if o.get("robotsOk") is False:
                skipped.append(f"{o['publisher']}: robots.txt")
                continue
            domain = o["domain"].lower().removeprefix("www.")
            lens = o.get("lens") if o.get("lens") in ("left", "center", "right") and o.get("rater") else "unrated"
            if domain not in have_domains:
                allow["entries"].append({
                    "domain": domain,
                    "publisher": o["publisher"],
                    "market": o["market"],
                    "sourceType": "reporting",
                    "lens": {"rating": lens, "ratingBasis": rating_basis(o)},
                    "rights": {
                        "license": f"Third-party copyright ({o['publisher']}). Read for fact extraction only; never republished.",
                        "usage": QUOTE_ONLY_USAGE,
                    },
                    "verified": True,
                    "verifiedNote": f"Open-web aggregation approved by project owner {TODAY}: attribution + link + short quotes; robots.txt respected.",
                })
                have_domains.add(domain)
                added_a += 1
            fid = o["id"]
            if fid not in have_feeds:
                feeds["feeds"].append({
                    "id": fid,
                    "market": o["market"],
                    "url": o["feedUrl"],
                    "domain": domain,
                    "type": "rss",
                    "enabled": True,
                    # Outlet reports need a second, independent publisher before they become a story.
                    "seedsStory": False,
                    "note": f"{o['publisher']} ({o.get('country', o['market'])}, {o.get('language', 'en')}); lean: {lens}.",
                })
                have_feeds.add(fid)
                added_f += 1
    ALLOW.write_text(json.dumps(allow, ensure_ascii=False, indent=2) + "\n")
    FEEDS.write_text(json.dumps(feeds, ensure_ascii=False, indent=2) + "\n")
    print(f"allowlist +{added_a}, feeds +{added_f}")
    for s in skipped:
        print("skipped", s)


if __name__ == "__main__":
    main(sys.argv[1:])
