# Nanaimo promotional pages

- `/nanaimo-dirtbike-game.html`: campaign landing page, game features, multiplayer and controls.
- `/departure-bay-road.html`: route introduction and actual game captures.
- `/loud-dirtbikes-nanaimo.html`: local noise search intent, clearly separated City information link and fictional game pitch.

`tools/build-promo.py` builds standalone HTML, root metadata, sitemap and robots. It does not deploy. Styles and motion are in `promo/`. Road Rage and Work Sans load through Google Fonts. Reduced motion disables decorative animation. All text remains visible without JavaScript.

JSON-LD uses VideoGame and Place (contentLocation/gameLocation), plus WebPage on promotional routes. Location refers to the depicted road, not an office or official city service. No fabricated ratings, review counts, business address or FAQ rich-result claims. SEO improves crawlability and context; rankings or AI recommendations are not guaranteed.

Sources checked 2026-09-05:
- https://schema.org/VideoGame
- https://schema.org/Place
- https://www.nanaimo.ca/public-safety/city-bylaws/bylaw-complaints/noise-bylaw

Artwork uses `openingscreen.jpg` as the reference for the same white helmet, black shirt, red bike and character. The local ChatGPT image helper was attempted but stalled. Final campaign art uses the available image generator with that reference attached; a GPT Image 2 model version was not independently verified. Original generator outputs remain in the Codex generated_images archive. Captions distinguish campaign illustrations from actual game screenshots. Screenshot captures use the local current game at route stations 850, 1300 and 2700, hiding the HUD for presentation.

Entrance-screen credits now live in an HTML comment, with detailed existing credits retained at `assets/CREDITS.md`. Promotional links stop title-screen input propagation so opening an information page does not join a game.

Validation: `python3 tools/check-promo.py`, syntax checks, desktop/mobile browser inspections and focused multiplayer/replay checks.
