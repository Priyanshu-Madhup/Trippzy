"""Builds the bundled profile-avatar pack: mobile/assets/avatars/a01.png, a02.png, ...

The images come from DiceBear (https://www.dicebear.com) and use only styles released under CC0 1.0 (public domain):
  - Lorelei  (Lisa Wischofsky)
  - Notionists  (Zoish)
  - Open Peeps  (Pablo Stanley)
  - Thumbs  (DiceBear)
Bundling them means the app needs no network call (and shares nothing with a third party) when a user picks one.

Existing files are kept, so adding a style to PACK only downloads the new ones. After adding files, also add them to
mobile/src/lib/avatars.ts (or run this with --list to print the lines). Re-run:

    python tools/make_avatars.py            # download whatever is missing
    python tools/make_avatars.py --list     # print the require() lines for avatars.ts
"""

import sys
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parent.parent / "mobile" / "assets" / "avatars"
BACKGROUNDS = ["f6e7c8", "d6ecff", "ffd9d6", "dff3e0", "e8defa", "ffe9c2"]
# Order matters: the file number is the running position, so only ever append. (a01-a12 were the first three styles.)
# (style, how many, first seed number). Seeds make each picture reproducible.
PACK = [
    ("lorelei", 4, 1),
    ("notionists", 4, 1),
    ("thumbs", 4, 1),
    ("open-peeps", 4, 1),
    ("lorelei", 4, 5),
    ("notionists", 4, 5),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    total = sum(c for _, c, _ in PACK)
    if "--list" in sys.argv:
        print("\n".join(f"  require('../../assets/avatars/a{i:02d}.png')," for i in range(1, total + 1)))
        return
    with httpx.Client(timeout=30, headers={"user-agent": "Trippzy/1.0 (avatar pack build)"}) as http:
        for style, count, first in PACK:
            for i in range(first - 1, first - 1 + count):
                n += 1
                target = OUT / f"a{n:02d}.png"
                if target.exists():
                    continue
                r = http.get(
                    f"https://api.dicebear.com/9.x/{style}/png",
                    params={"seed": f"trippzy-{style}-{i + 1}", "size": 256, "backgroundColor": BACKGROUNDS[(n - 1) % len(BACKGROUNDS)]},
                )
                r.raise_for_status()
                target.write_bytes(r.content)
                print(f"{target.name}  {style:19s} {len(r.content):6d} bytes")


if __name__ == "__main__":
    main()
