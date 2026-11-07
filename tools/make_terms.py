"""Builds docs/legal/terms.html from mobile/src/lib/legal.json, so the app and the website say the same thing.
Run:  python tools/make_terms.py"""
import html
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
data = json.loads((root / "mobile/src/lib/legal.json").read_text(encoding="utf-8"))
e = html.escape

rows = "\n".join(f"    <tr><td><strong>{e(l['what'])}</strong><br><span class=\"muted\">{e(l['note'])}</span></td><td>{e(l['where'])}</td></tr>" for l in data["locations"])
sections = "\n".join(f"  <h2>{e(s['title'])}</h2>\n" + "\n".join(f"  <p>{e(p)}</p>" for p in s["body"]) for s in data["sections"])

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trippzy — Terms &amp; Privacy</title>
<style>
  :root {{ color-scheme: light dark; --bg:#f7f7f5; --ink:#111110; --muted:#77746c; --line:rgba(17,17,16,.12); }}
  @media (prefers-color-scheme: dark) {{ :root {{ --bg:#0b0b0c; --ink:#f4f4f1; --muted:#9a9891; --line:rgba(255,255,255,.14); }} }}
  body {{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif; }}
  main {{ max-width:720px; margin:0 auto; padding:48px 20px 96px; }}
  h1 {{ font-size:34px; letter-spacing:-.03em; margin:0 0 6px; }}
  h2 {{ font-size:20px; margin:40px 0 8px; letter-spacing:-.01em; }}
  .muted {{ color:var(--muted); font-size:14px; }}
  table {{ width:100%; border-collapse:collapse; margin:12px 0; font-size:15px; }}
  th, td {{ text-align:left; padding:10px 12px 10px 0; border-bottom:1px solid var(--line); vertical-align:top; }}
  th {{ color:var(--muted); font-weight:500; }}
  a {{ color:inherit; }}
</style>
</head>
<body>
<main>
  <h1>{e(data['title'])}</h1>
  <p class="muted">Trippzy · Version {e(data['version'])} · See also the full <a href="privacy.html">Privacy Policy</a></p>
  <p>{e(data['intro'])}</p>

  <h2>Where your data lives</h2>
  <table>
    <tr><th>Data</th><th>Country / region</th></tr>
{rows}
  </table>

{sections}
</main>
</body>
</html>
"""
(root / "docs/legal/terms.html").write_text(page, encoding="utf-8", newline="\n")
print("wrote docs/legal/terms.html")
