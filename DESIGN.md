---
name: App Anatomy
description: An app drawn as a chip package on a dark circuit board, opened layer by layer.
colors:
  runtime: "#22D3EE"
  library: "#FFDD33"
  app: "#C83CFF"
  asset: "#F04A1F"
  unid: "#5F6970"
  overhead: "#2B333A"
  substrate: "#161C22"
  ice: "#D5F3F6"
  board: "#0A0D10"
  board-2: "#10151A"
  rule: "#212A32"
  grid: "#1B242B"
  text: "#E7EEF0"
  soft: "#93A3AB"
typography:
  display:
    fontFamily: "Archivo, Pretendard Variable, sans-serif"
    fontSize: "clamp(2.1rem, 3.5vw, 3.4rem)"
    fontWeight: 800
    lineHeight: 1.14
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 118"
  headline:
    fontFamily: "Archivo, Pretendard Variable, sans-serif"
    fontSize: "clamp(1.6rem, 2.6vw, 2.4rem)"
    fontWeight: 800
    lineHeight: 1.14
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 118"
  title:
    fontFamily: "Archivo, Pretendard Variable, sans-serif"
    fontSize: "clamp(1.15rem, 1.7vw, 1.5rem)"
    fontWeight: 800
    lineHeight: 1.14
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 118"
  body:
    fontFamily: "Archivo, Pretendard Variable, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Archivo, Pretendard Variable, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "'tnum'"
rounded:
  none: "0px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  gutter: "clamp(20px, 3vw, 44px)"
  band: "clamp(44px, 6vw, 88px)"
components:
  button-primary:
    backgroundColor: "{colors.ice}"
    textColor: "{colors.board}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.board}"
  button-line:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  segmented-option:
    backgroundColor: "transparent"
    textColor: "{colors.soft}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "32px"
  segmented-option-pressed:
    backgroundColor: "{colors.ice}"
    textColor: "{colors.board}"
  input-search:
    backgroundColor: "{colors.board}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "32px"
  layer-tab:
    backgroundColor: "{colors.board-2}"
    textColor: "{colors.soft}"
    rounded: "{rounded.none}"
    padding: "0 14px 0 0"
    height: "40px"
  layer-tab-pressed:
    backgroundColor: "{colors.board-2}"
    textColor: "{colors.text}"
  list-row:
    backgroundColor: "{colors.board-2}"
    textColor: "{colors.text}"
    typography: "{typography.mono}"
    padding: "0 16px"
    height: "36px"
  list-row-hover:
    backgroundColor: "{colors.rule}"
  tooltip:
    backgroundColor: "{colors.board-2}"
    textColor: "{colors.text}"
    typography: "{typography.mono}"
    rounded: "{rounded.none}"
    padding: "7px 10px"
  drop-target:
    backgroundColor: "{colors.board-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "18px"
---

# Design System: App Anatomy

Recorded on 2026-11-14 from the finished design preview (`design/preview.html`). Every value below is in that file. "App Anatomy" is a working name. Items that are planned but not built are listed under Open Items at the end and are not rules.

## Overview

**Creative North Star: "Die on a Board"**

An app is a chip package sitting on a circuit board. Opening it lifts the die apart layer by layer, and traces run across the board from the largest parts to bracketed labels. The board is the page: one dark surface, a faint grid with a dot at every crossing, and one lit object on it. Text, controls and tables sit on the same board, drawn with hairlines and corner ticks like the outlines of parts on a schematic.

The system is built so that nothing decorative can be read as data. The 3D view has three encodings and no others: footprint area is bytes, stacking height is the layer (app, runtime, library, module), and color is the origin. The camera is orthographic, so equal areas look equal wherever they sit. Blocks are solid, lit and shadow-casting; none of them is see-through. Everything that is not data (traces, frames, buttons, selection, focus) uses one pale chrome color.

There is one theme, the dark board. There is no light theme. The blocks are laid out automatically from real analysis results, with small parts lumped into one "N more" block; no block is placed by hand.

**Key Characteristics:**
- One dark board fills the page; the 3D scene is the first viewport's full background.
- Four saturated origin colors, used for origin and for nothing else.
- One chrome color, ice, for every line and control.
- Square corners everywhere; frames are four corner ticks, not boxes.
- Wide heavy grotesk for headings, plain grotesk for text, tabular mono for numbers and paths.
- Light, shadow and glow exist only inside the 3D scene. The HTML around it is flat.
- Motion belongs to the chip: it opens, layers rise, traces draw. Controls change state instantly.

## Colors

A near-black blue-gray board, four saturated origin colors that appear only on data, and one pale ice for everything drawn on top.

### Primary
- **Ice** (`ice`): the single chrome color. Traces, corner-tick frames, the filled primary button, the pressed segment, selection in the list, the focus ring (2px outline, 3px offset), text selection, the tooltip border, the caret, and the edge lines of the chip package and lid.

### Secondary: origin colors
These four mean where a part came from. They appear on blocks, on the small swatch beside a part's name, and in the legend.
- **Runtime Cyan** (`runtime`): the runtime (for example Electron or React Native).
- **Library Yellow** (`library`): external libraries.
- **App Violet** (`app`): the app's own code. Bundled app code is the same violet with hatching.
- **Asset Vermilion** (`asset`): assets.

### Tertiary: data neutrals
- **Unidentified Gray** (`unid`): parts that were not identified. Always hatched.
- **Overhead Slate** (`overhead`): overhead and shared bytes. Solid, unlit, no glow.
- **Graphite Plate** (`substrate`): structural plates: the app plate and any runtime block that has children. Solid, unlit, no glow.

### Neutral
- **Board** (`board`): the page background, the 3D scene background, the text color on ice-filled controls, and the ink of every hatch.
- **Board Raised** (`board-2`): the result panel, the tooltip, and (at 82 to 86% over the scene) the drop target and layer tabs.
- **Rule** (`rule`): 1px dividers between rows and sections, the border of the search field, the row hover fill, the resting corner ticks of an unpressed layer tab.
- **Grid** (`grid`): the grid lines on the board floor.
- **Text** (`text`): primary text.
- **Soft** (`soft`): secondary text, captions, byte and percentage columns, placeholders, the border of the segmented control.

### Named Rules
**The Origin-Only Rule.** Runtime cyan, library yellow, app violet and asset vermilion mean origin and nothing else. They are never used for links, buttons, states, emphasis or decoration.

**The One Chrome Rule.** Every line and control that is not data is ice. Hover on a filled button brightens ice to white; no second accent exists.

**The Hatch Rule.** Diagonal hatching in the board color means "the inside is unknown". It marks unidentified parts (gray) and bundled app code (violet), on blocks, on swatches and on board labels alike. Hatching is never used as texture.

**The Opaque Data Rule.** Transparency is not used for data. Blocks are fully opaque. Partial opacity appears only on chrome: panel fills floating over the scene, labels fading in, a disabled button.

**How the palette was checked.** The origin colors were chosen by simulating protan, deutan and tritan vision (Machado 2009) on the raw color values. The smallest pairwise CIELAB distance in that simulation is about 33 (library against asset under deutan). This is a simulation on color values, not a test with color-blind users, and it does not account for the lighting and bloom in the 3D scene.

## Typography

**Display Font:** Archivo, variable, at width 118% and weight 800 (Korean falls back to Pretendard Variable at 800)
**Body Font:** Archivo at normal width, weights 400, 600 and 700 (Korean: Pretendard Variable)
**Label/Mono Font:** JetBrains Mono, weights 400, 500 and 700, tabular figures

**Character:** A wide, heavy grotesk states one finding per heading, like a part marking. Plain grotesk carries the sentences. Mono carries everything that was measured.

All three families are under the SIL Open Font License. The preview loads them, and three.js, from a public CDN as a preview shortcut only; the shipped site must self-host all of them.

### Hierarchy
- **Display** (800, width 118%, `clamp(2.1rem, 3.5vw, 3.4rem)`, line-height 1.14, letter-spacing -0.015em, balanced wrapping): the one headline of the first screen. It states a finding about a real app.
- **Headline** (same face, `clamp(1.6rem, 2.6vw, 2.4rem)`, max 22ch): section headings.
- **Title** (same face, `clamp(1.15rem, 1.7vw, 1.5rem)`): the finding printed over a result view.
- **Body** (400, 16px, line-height 1.55): running text. The lead sentence is held to 36ch and section intros to 62ch. Emphasis inside body is weight 600 in the text color against soft surrounding text.
- **Label** (400 or 600, 13px): captions, legend, hints, table cells, segmented options, small buttons. 14px is used for secondary lines under a status message and for the top navigation.
- **Mono** (13px in tables and lists, 12px weight 500 in the tooltip, 14px in specimens): bytes, percentages, file paths, error codes, part names in the result list, and Roman layer numerals (700, 12px) on the layer tabs.
- **Wordmark** (700, width 118%, 14px, uppercase, letter-spacing 0.04em): the product name in the top line.

### On-board labels
Labels drawn inside the 3D scene are rendered to textures and lie flat on a surface.
- **Block top**: the part name in Archivo 700, the byte and percentage line in JetBrains Mono 500. Text is board-dark on bright blocks and text-light on dark blocks, switched by the block color's luminance (threshold 0.36).
- **Traced callout**: the part name in Archivo 800, uppercase, white, inside four corner ticks; below it a swatch of the origin color (hatched when applicable) and the byte and percentage line in JetBrains Mono 500.
- Names that do not fit are reduced in size, then cut with an ellipsis. Labels appear only on blocks wide enough to hold them.

### Named Rules
**The Measured-In-Mono Rule.** Every byte count, percentage, path and error code is JetBrains Mono with tabular figures. A number never appears in the display face.

**The One Wide Voice Rule.** Width 118% at weight 800 is for headings and the wordmark only. Body text, labels and controls stay at normal width.

**The Korean Parity Rule.** Korean text breaks between words, not inside them (`word-break: keep-all`), and takes the same weights as the Latin beside it. English is the default language; Korean is supported.

## Layout

**The board is the page.** The first screen is a full-bleed 3D scene, at least one viewport tall. Text does not sit in a card over it; a left column (at most 430px or 36% of the width) floats directly on the board, with the board color fading out to the right behind it so the text stays legible. The column holds, top to bottom: wordmark and navigation, the headline, one sentence, the drop target, and a table of the largest parts pinned to the bottom. The right edge holds the open/close toggle, the layer tabs (vertically centered), a hint and the legend. The chip sits right of center so that neither column covers it.

Below the first screen, sections are full-width bands separated by a 1px rule, with `band` padding top and bottom and `gutter` padding at the sides. The result view is a two-column panel (about 1.25 to 1, at least 540px tall): the chip on the left, the list of the same parts on the right, split by a 1px rule.

**Rhythm.** Gaps are 8, 12, 16 and 20px. Controls are 40px high in the first screen and 32px high in the result toolbar; list rows are at least 36px. Dividers are always 1px in the rule color.

**Responsive.** One breakpoint at 900px. Below it the first screen becomes a single column in this order: top line, headline, sentence, the 3D scene (62% of the viewport height, at least 400px), controls and legend in a row, drop target, parts table. Layer tabs shrink to their numeral, the drag hint is hidden, traced callouts are not drawn, and two-column panels stack.

## Elevation & Depth

Depth is real only inside the 3D scene. There, a hemisphere light and one directional light from the upper left front cast soft shadows from every block onto the layers and the board below. Origin-colored blocks emit a little of their own color (emissive 0.22) and the scene passes through a bloom filter (strength 0.5, radius 0.7, threshold 0.84), so bright blocks and the lid glow softly. Structural plates and overhead blocks do not emit.

The HTML is flat. There are no drop shadows, no blurred glows and no gradients on controls. Panels are separated from the board by tone (`board-2` over `board`) and by 1px rules. The only box-shadow in the system is a 1px inset ice line on the selected list row.

### Named Rules
**The Light-Stays-On-The-Board Rule.** Shadow, glow and bloom belong to the 3D scene. HTML surfaces never get a drop shadow or a glow.

**The Orthographic Rule.** The 3D camera is orthographic. It can be rotated (drag, or arrow keys when focused) and its elevation is limited so the footprint stays readable; it never switches to perspective.

## Shapes

Every corner is square (radius 0): buttons, fields, panels, swatches, tooltips, blocks.

The signature frame is four corner ticks: at each corner, a 10px horizontal and a 10px vertical stroke, 1px thick, with the sides left open. It marks the drop target, the result panel, the layer tabs and the open/close toggle, and the same device is drawn around each callout name on the board. The tick color carries state: rule-colored at rest on a layer tab, ice when pressed or hovered.

Swatches are 16 by 10px rectangles. Hatching is 45 degree stripes in the board color (1.5px stripe, 3px gap on swatches). Borders are 1px; full borders appear only on filled or outlined buttons, the segmented control, the search field and the tooltip.

**The Four Ticks Rule.** A framed region is marked at its corners only. A full 1px box is reserved for controls that are pressed or typed into.

## Components

### Buttons
- **Shape:** square, 40px high, 16px side padding, weight 700. In the result toolbar: 32px high, 12px padding, 13px text.
- **Primary:** ice fill, board-colored text, 1px ice border.
- **Line:** transparent fill, text-colored label, 1px ice border.
- **Hover:** primary brightens to white; line gains a 14% ice wash.
- **Focus:** 2px ice outline offset 3px (shared by every focusable element).
- **Disabled:** 45% opacity, default cursor.

### Segmented control
- **Style:** options joined in one 1px soft-colored border, 32px high, 13px weight 600 soft text on a transparent fill.
- **Pressed:** ice fill with board-colored text.

### Layer tabs and toggle
- **Style:** a column of 40px tabs in corner ticks, each a mono Roman numeral (I to IV) and the layer name, on a board-raised fill at 86% opacity so the scene shows through faintly.
- **State:** soft text with rule-colored ticks at rest; text-colored with ice ticks when the layer is shown; white text with ice ticks on hover. Pressing a tab shows the chip up to that layer; pressing the top shown layer again removes it.
- **Toggle:** a 34px corner-tick button that opens and closes the chip; its label names the action it will perform.

### Drop target
- **Style:** corner ticks in ice around 18px padding, board-raised fill at 82% opacity. One line of weight 600 text, the primary button, and a 13px soft line listing accepted file types and stating that the file does not leave the device.

### Inputs / Fields
- **Style:** 32px high, board fill, 1px rule-colored border, 13px text, soft placeholder at full opacity, ice caret.
- **Focus:** the shared ice outline.

### Parts table and list
- **Parts table (first screen):** rows divided by 1px rules: swatch, name, bytes and percentage in soft mono, right-aligned. A caption above names the app, version, platform and what was measured. Hovering a row lifts and outlines the matching block; hovering a block lights the matching row (rule-colored fill, white text).
- **List row (result view):** swatch, name in mono (ellipsis when long), bytes, percentage; at least 36px high with a 1px rule below. Hover fills the row with the rule color. Selected rows get a 16% ice wash and a 1px inset ice line, and the matching block is outlined in the chip. Rows are focusable and select with Enter or Space.

### Legend and swatches
- **Style:** a row of swatch plus label pairs in 13px soft text. The unidentified swatch is hatched.

### Tooltip
- **Style:** board-raised fill, 1px ice border, mono 12px weight 500, 7px by 10px padding. First line is the full name or path; second line is bytes, percentage and origin in words. It follows the pointer and stays inside the scene.

### Status messages
- **Style:** one weight 600 line stating what is happening or what went wrong, then one 14px soft line with what was detected or what to do next; an error code, when present, is appended in mono. No color is used for error state.

### The chip (signature component)
- **Board:** a dark floor with grid lines every 24 units and a pale dot at each crossing.
- **Package:** a dark base plate edged in ice, with pale gray legs on all four sides.
- **Lid:** three stacked plates edged in ice; the top plate glows pale ice. Closed, the app is one chip on the board. Opening lifts the lid up and out of view.
- **Blocks:** one block per part of the analysis result. Inside each parent, children are packed by a squarified treemap so footprint area is proportional to bytes; each layer has a fixed thickness and sits one level above its parent. Every block has a thin edge line in a lighter tint of its own color. Blocks keep a small gap from their neighbors.
- **Opened state:** layers separate vertically by a fixed gap. Layer tabs remove layers from the top.
- **Callouts:** from the largest parts of the library layer (six on the first screen), a thin riser drops to the board and an ice trace runs out in straight and 45 degree segments to a pad and a bracketed label. Labels sit in front of the chip in two staggered rows.
- **Hover and selection:** the block rises slightly and gets a white outline; the tooltip names it.
- **Motion:** on opening, the lid rises first, then blocks ease up to their layer height with an exponential ease-out, staggered by layer (about 110ms per layer plus a small per-block offset). Traces draw outward after the layers settle, one after another, and each label fades in as its trace arrives. Closing reverses the order and retracts traces quickly. On the first screen the chip starts closed and opens by itself after 1.4 seconds, then sways slowly until the first touch. With reduced motion, positions are set without the rise and there is no sway.
- **Access:** the canvas is focusable, has a text description, and rotates with the arrow keys. Rendering stops when nothing is moving.

## Do's and Don'ts

### Do:
- **Do** use runtime cyan, library yellow, app violet and asset vermilion for origin only, and repeat the same swatch beside the part's name in tables, lists and legends.
- **Do** hatch unidentified parts and bundled app code wherever they appear: block, swatch and board label.
- **Do** draw every line, frame, button, selection and focus ring in ice.
- **Do** set bytes, percentages, paths and error codes in JetBrains Mono with tabular figures.
- **Do** frame regions with four corner ticks (10px strokes, 1px thick) and keep every corner square.
- **Do** build every block from analysis data, with footprint area proportional to bytes, and lump small parts into one "N more" block.
- **Do** keep the 3D camera orthographic and the blocks opaque.
- **Do** separate HTML surfaces with tone and 1px rules.
- **Do** self-host Archivo, Pretendard, JetBrains Mono and three.js in the shipped site.

### Don't:
- **Don't** use an origin color for a link, a button, a state, a heading or decoration.
- **Don't** introduce a second accent color for chrome.
- **Don't** make a data block transparent or translucent.
- **Don't** use hatching as texture or for any meaning other than "the inside is unknown".
- **Don't** add drop shadows, blurred glows or rounded corners to HTML elements.
- **Don't** place, resize or recolor a block by hand.
- **Don't** add a light theme.
- **Don't** set a number in the display face.

## Open Items

Not designed or not decided as of 2026-11-14. None of these is a rule yet.

- The site in `site/` follows this system as of 2026-11-15 (first screen, analyzing, error, result, parts list), with three.js and the three typefaces served from the repository. Not seen yet: Safari and Firefox, touch devices, a real drag and drop.
- The 1200x630 share card exists in the site since 2026-11-15 (`site/card.js`) and was built without a design pass of its own: the board fills the card, text sits in a left column (wordmark, app name in the wide display face, runtime and version, size in mono, five largest parts with swatch, name, origin word and percent, a legend), the 3D chip as currently rotated sits on the right without traces or labels, and four ice corner ticks frame the card. On narrow screens the picture is the 2D treemap. The display face is drawn at the canvas keyword width `semi-expanded` (112.5%), not 118%.
- The gallery exists in the site since 2026-11-15 as a hairline-ruled list at the foot of the page, built without a design pass of its own: one row per app (name in 600 weight with the version in mono, platform, runtime, size in mono, and a 12px stacked bar of bytes by origin using the origin colors and hatching). The open row takes the selection treatment (ice tint and 1px ice inset). The bar is a new data mark that DESIGN.md did not have before.
- Narrow screens (900px and below) show a view-only 2D treemap in the site since 2026-11-15 (`site/flat.js`): area is bytes, color is origin, hatching as in 3D, blocks split by 1px board-colored lines, names on library-level blocks, an ice outline and a one-line caption for the tapped block. It was built without a design pass of its own; the preview still shows the 3D chip at every width.
- The product name is a working name; there is no logo.
- Dependents (added 2026-11-16, no design pass of its own): when a block is taken out, blocks that declare they need it lose their origin color (a dark graphite, darker edges, label at 28% opacity), tilt by a few degrees and sag below their layer. This is the first state in which a data block is drawn without its origin color; the color returns when the block is put back. The panel adds a line naming what goes down and a second mono line with what is still usable.
- "Take it out" (added 2026-11-15, no design pass of its own): dragging a block off the chip and dropping it lifts it away (a click alone does nothing; dragging the empty board rotates), and a corner-tick panel in the left column shows the recounted size in mono (before, arrow, after in bold, percent), the names taken out, two text buttons to put things back, and one line saying this recounts size only. Rows of the parts table strike through when taken out. It is the first interaction that changes what the chip shows as data; the motion reuses the layer-removal lift.
- English is the default language. The English first screen and error screen of the site were seen once at 1440px; the result screen and narrow widths were seen in Korean only.
- The site has a working search field above the parts list since 2026-11-15 (square, hairline border, `board-2` fill, ice caret; results are a flat list with each part's parent path in soft text). The export button and the "flat" option exist only in the preview. Blocks in the chip cannot be selected from the keyboard; list rows can.
- In the site, "N more" labels are worded per language by the page when it reduces a result for drawing (`site/viewer.js`, `reduce`). The preview data still carries Korean wording.
- On the site's analyzing and error screens the previous chip stays on the board with its lid closed. This was chosen during the build, not designed.
- The right-most traced label can still touch the layer buttons or the right edge between about 1100px and 1440px. The site now draws six, five or four traced labels depending on window width and packs them leftward (2026-11-15).
- Several colors inside the 3D scene are literal values, not tokens: the floor, grid dots, package plate, legs, lid plates and lid glow, block edge tints, risers, callout text, and the white hover outline.
- If WebGL is unavailable the 3D view is replaced by one line of text and the tables and lists still work; that fallback message is not designed beyond plain text.
- Resolved after this record was first written (2026-11-14): part names on the board are Archivo by decision and only bytes, paths and codes are mono; the legend has entries for hatched bundled code and for overhead; with reduced motion the chip shows opened at once with traces drawn; every list row carries the origin word beside the swatch; the lid glow uses ice.
