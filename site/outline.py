#!/usr/bin/env python3
"""Turn a line of text into one compact SVG path, so the page needs no web font.

Usage:
  python3 outline.py FONT.woff2 TEXT [--weight 500] [--scale 3] [--tracking 0]

Prints an <svg> element with a viewBox and a single path filled with currentColor.
Needs google-chrome and pdftocairo (poppler). The wordmark uses scale 3 and the
motto uses scale 2; higher values are more precise and bigger.

  python3 outline.py cormorant-normal.woff2 "Tyranny" --scale 3 --tracking 0.01
  python3 outline.py cormorant-italic.woff2 "Sic semper tyrannis" --scale 2

Cormorant Garamond is in git history at site/public/fonts/:
  git show 353a0b9:site/public/fonts/cormorant-normal.woff2 > /tmp/c.woff2
"""
import argparse, html, pathlib, re, subprocess, tempfile


def render_svg(font, text, weight, tracking):
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        page = tmp / "text.html"
        page.write_text(f"""<!doctype html><meta charset="utf-8"><style>
@font-face{{font-family:F;src:url("{pathlib.Path(font).resolve().as_uri()}");font-weight:100 900}}
@page{{size:3000px 300px;margin:0}}
body{{margin:0}}p{{margin:0;padding:50px;white-space:nowrap;font:{weight} 100px/1 F;letter-spacing:{tracking}em}}
</style><p>{html.escape(text)}</p>""")
        subprocess.run(["google-chrome", "--headless=new", "--disable-gpu", "--no-sandbox",
                        "--allow-file-access-from-files", "--virtual-time-budget=3000",
                        "--no-pdf-header-footer", f"--print-to-pdf={tmp / 'text.pdf'}", page.as_uri()],
                       check=True, capture_output=True)
        subprocess.run(["pdftocairo", "-svg", tmp / "text.pdf", tmp / "text.svg"], check=True)
        return (tmp / "text.svg").read_text()


def glyph_commands(svg):
    glyphs = {gid: (re.search(r'd="([^"]*)"', body) or [None, ""])[1]
              for gid, body in re.findall(r'<g id="(glyph-[\d-]+)">\s*(.*?)\s*</g>', svg, re.S)}
    uses = re.findall(r'<use xlink:href="#(glyph-[\d-]+)" x="([\d.-]+)" y="([\d.-]+)"', svg)
    commands = []
    for gid, x, y in uses:
        tokens = re.findall(r"[MLCZ]|-?[\d.]+", glyphs[gid])
        i = 0
        while i < len(tokens):
            letter = tokens[i]; i += 1
            count = {"M": 2, "L": 2, "C": 6, "Z": 0}[letter]
            values = [float(v) + (float(x) if k % 2 == 0 else float(y))
                      for k, v in enumerate(tokens[i:i + count])]
            i += count
            commands.append((letter, values))
    return commands


def compact_path(commands, scale):
    xs = [v for _, vs in commands for v in vs[0::2]]
    ys = [v for _, vs in commands for v in vs[1::2]]
    left, top = min(xs), min(ys)
    out, last = [], None
    cx = cy = sx = sy = 0
    for letter, values in commands:
        if letter == "Z":
            out.append("z"); cx, cy = sx, sy; last = "z"; continue
        q = [round((v - (left if k % 2 == 0 else top)) * scale) for k, v in enumerate(values)]
        rel = [v - (cx if k % 2 == 0 else cy) for k, v in enumerate(q)]
        cx, cy = q[-2], q[-1]
        if letter == "M":
            sx, sy = cx, cy
        nums = ""
        for v in rel:
            nums += str(v) if (nums == "" or v < 0) else f" {v}"
        lower = letter.lower()
        if lower != last or lower == "m":
            out.append(lower + nums)
        else:
            out.append(nums if nums.startswith("-") else f" {nums}")
        last = lower
    width = round((max(xs) - left) * scale)
    height = round((max(ys) - top) * scale)
    return "".join(out), width, height


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("font")
    p.add_argument("text")
    p.add_argument("--weight", default="500")
    p.add_argument("--scale", type=float, default=3)
    p.add_argument("--tracking", default="0", help="letter-spacing in em")
    a = p.parse_args()
    d, w, h = compact_path(glyph_commands(render_svg(a.font, a.text, a.weight, a.tracking)), a.scale)
    print(f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="{html.escape(a.text)}">'
          f'<path fill="currentColor" d="{d}"/></svg>')


if __name__ == "__main__":
    main()
