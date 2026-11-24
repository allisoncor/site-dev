# Projects

Every folder in here is one project. It becomes a card on the homepage and its own page
(`work/<folder>.html`). Add a folder, and the site updates itself.

```
projects/
  herb-stamps/
    project.txt     the words (see below)
    hero.jpg        main picture: the homepage card, and the first picture on the project page
    1.jpg           more pictures for the project page, shown in number order
    2.jpg
    3.png
    anything-else   ignored, so working files and an originals/ folder are fine here
```

## Adding a project

1. Make a folder with a short lowercase name using dashes, for example `herb-stamps`.
2. Put in `hero.jpg` and the numbered pictures `1.jpg`, `2.jpg`, … (jpg, png, webp or gif).
3. Add `project.txt`:

```
title: Herb Stamps
order: 9
layout: tile
card: One or two sentences for the homepage card.
button: View Project

The longer description for the project page.

A blank line starts a new paragraph.
```

4. Upload the folder (GitHub website: Add file → Upload files, or GitHub Desktop). The site
   rebuilds itself in about a minute.

To change words, edit `project.txt`. To change pictures, replace or renumber the files.
To take a project down, delete its folder (or set `layout: hidden` to keep its page but drop the card).

## project.txt settings

| Setting | What it does |
|---|---|
| `title:` | Project name (card and page heading). Required. |
| `order:` | Position on the homepage: 1 is first. Decimals work (`3.5`) to slot one in between. |
| `layout:` | `hero` = big full-width card, `tile` = half-width card in the two-column grid, `wide` = full-width card inside the grid, `hidden` = page only, no homepage card. |
| `card:` | Short text on the homepage card. If missing, the first paragraph of the description is used. |
| `button:` | Button text on the card, e.g. `View Magazine`. Default `View Project`. |
| `alt:` | Description of the hero picture for screen readers. Default: the title. |
| `behance:` | Link to the project on Behance (shows "View on Behance"). |
| `pdf:` | A PDF in the folder to link from the page, e.g. `pdf: magazine.pdf`. |
| `pdf-label:` | Button text for the PDF. Default `View PDF`. |
| `meta:` | A short line under the page title, e.g. `meta: 2024 · Glass, lamp hardware`. |
| `section:` | `physical` = shown on the Physical Designs page instead of the homepage (`order:` then sets its place there). Default: homepage. |

### Project page gallery ("My process")

The hero picture sits at the top of the page next to the title; the numbered pictures make a
brick wall of rounded tiles under "My process". Each tile zooms to the artwork in its picture;
clicking any picture opens it full size.

| Setting | What it does |
|---|---|
| `big:` | The picture shown as one big tile (two tiles wide, two rows tall), e.g. `big: 4.jpg`. With 4 or fewer pictures the gallery becomes a compact group around it. |
| `big-row:` / `big-col:` | Where the big tile goes: its row (1 = first) and which tile of that row it starts at. Default row 1, tile 2. |
| `big-fill:` | `yes` = zoom the big picture in to fill its tile (else it is shown whole). |
| `rows:` | Fixed tiles per row instead of the edge-to-edge wall, e.g. `rows: 4, 4` (no big tile). |
| `whole-rows:` | Rows that show only whole tiles, nothing cut off at the window edges, e.g. `whole-rows: 1`. |
| `zoom:` | Extra zoom for single pictures, `file factor`, comma-separated, e.g. `zoom: 2.png 1.3`. |
| `whole:` | Pictures never cropped in their tile, comma-separated. |
| `gallery:` | Exact pictures and order, comma-separated, e.g. to leave one out. Default: all numbered pictures in number order. |

## Picture sizes

Tile cards are cropped to a near-square shape, so a square-ish `hero.jpg` works best for `tile`.
Until automatic resizing is added, keep pictures under about 3000 px wide and 2 MB.

## Building locally

`node scripts/build.js` writes the finished site to `_site/` (not committed).
