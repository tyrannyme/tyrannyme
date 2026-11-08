# tyranny.me

A single static page listing Tyranny's projects, served by Cloudflare Workers static assets. There is no build step, no Worker script and no JavaScript.

## Files

- `public/index.html`: the whole page. CSS, icons, the wordmark and the motto are inlined.
- `public/404.html`: self-contained not-found page, served by `not_found_handling`.
- `public/crown-<hash>.webp`: the crown at 1× (119px) and 2× (238px); the page requests one of them via `srcset`.
- `public/_headers`: CSP, caching and the crown preload.
- `public/favicon.png`, `apple-touch-icon.png`, `og.jpg`: icons and the share image. None of them block rendering.
- `wrangler.jsonc`: assets-only config, with custom domains for `tyranny.me` and `www.tyranny.me`.

## Run and deploy

```sh
wrangler dev      # http://localhost:8787
wrangler deploy
```

## Speed is the point

The page must render in one round trip: `index.html` stays under about 14 KB compressed (it is about 6 KB brotli now), and the crown is the only other request. Keep it that way:

- No JavaScript, web fonts, external requests or extra stylesheets.
- New icons go inline: an SVG, or a WebP data URI of 2 KB or less.
- Images keep `width` and `height` so nothing shifts while they load.
- Check the compressed size after edits: `gzip -9c public/index.html | wc -c`. It reads about 7.6 KB now, and Cloudflare's brotli comes out about 20% smaller.

## How the pieces are made

- **Wordmark and motto** are SVG outlines of Cormorant Garamond 500, roman for "Tyranny" and italic for "Sic semper tyrannis". The font files are in git history under `site/public/fonts/`. To change the text, run `outline.py` (usage is in its docstring). It renders the text in headless Chrome, converts it with `pdftocairo`, and flattens the glyphs into one compact path.
- **Crown** comes from `art/fragments/crown.png`. Both sizes start with `magick crown.png -channel A -level 4%,100% +channel -trim +repage`, then go through `-resize 238x -quality 45 -define webp:alpha-quality=40 -define webp:method=6` for 2× and `-resize 119x -quality 60 -define webp:alpha-quality=40 -define webp:method=6` for 1×. Name each `crown-<first 8 chars of sha256>.webp`, then update the `src` and `srcset` in `index.html` and the `Link` header in `_headers`. Crowns are cached as immutable, so a changed file always needs a new name.
- **Project icons** come from each project's own repo: Minv's and Automedia's `site/public/favicon.svg`, and Blossom's `public/icon.png`.

## Caching and security

- The HTML is cached for 5 minutes with `stale-while-revalidate`, so returning visitors may see an update one visit late.
- `style-src 'unsafe-inline'` is allowed because CSS is inlined. Scripts are fully blocked, so keep it that way.
- Early Hints is enabled on the zone, so the crown preload starts before the HTML arrives.
- `www.tyranny.me` serves the same page with a canonical link to `tyranny.me`. A real redirect needs a Cloudflare Redirect Rule.
