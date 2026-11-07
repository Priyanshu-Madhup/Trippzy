"""Builds the bundled profile-avatar pack: mobile/assets/avatars/a01.png … a12.png.

The images come from DiceBear (https://www.dicebear.com) using only styles released under CC0 1.0 (public domain):
Lorelei (Lisa Wischofsky), Notionists (Zoish) and Thumbs (DiceBear). Bundling them means the app needs no network
call (and shares nothing with a third party) when a user picks one. Re-run to regenerate:

    python tools/make_avatars.py
"""

from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parent.parent / "mobile" / "assets" / "avatars"
BACKGROUNDS = ["f6e7c8", "d6ecff", "ffd9d6", "dff3e0", "e8defa", "ffe9c2"]
PACK = [("lorelei", 4), ("notionists", 4), ("thumbs", 4)]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    with httpx.Client(timeout=30, headers={"user-agent": "Trippzy/1.0 (avatar pack build)"}) as http:
        for style, count in PACK:
            for i in range(count):
                n += 1
                r = http.get(
                    f"https://api.dicebear.com/9.x/{style}/png",
                    params={"seed": f"trippzy-{style}-{i + 1}", "size": 256, "backgroundColor": BACKGROUNDS[(n - 1) % len(BACKGROUNDS)]},
                )
                r.raise_for_status()
                (OUT / f"a{n:02d}.png").write_bytes(r.content)
                print(f"a{n:02d}.png  {style:11s} {len(r.content):6d} bytes")


if __name__ == "__main__":
    main()
