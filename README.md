# QuestWalls

Full-size layout sketching for Meta Quest 3 passthrough, in the browser (WebXR + three.js, no install or build step).

| App | Path | What it's for |
| --- | --- | --- |
| **Wall Sketch** | [`/walls/`](walls/) | Interior: walls, doors, furniture. Same controls as Yard Sketch: ☰ menu, hold grip + trigger to select, A done / B delete, Look only |
| **Yard Sketch** | [`/landscape/`](landscape/) | Landscaping: retaining walls, patios and beds, boulders, trees, shrubs |

Host the repo on any HTTPS static host (GitHub Pages works), open the page in the Quest Browser, and press **START AR**. Both apps also run on a desktop browser for planning with mouse and keyboard.

## Yard Sketch

![Yard Sketch desktop preview](landscape/preview.png)

- **Retaining walls**: draw a run of points and it's built course by course, in running bond with interlocking corners and a cap row. There are 6 block types (standard 18×6×12", large 18×8×12", garden 12×4×7", tumbled, natural stacked stone, and a boulder wall). Closing a wall makes a raised bed.
- **Curves**: walls and area edges can be straight or smooth. Flick the right stick ↔ while drawing (or use the menu; K on desktop) to switch, and you can mix sharp corners and curves in one shape for serpentine walls, kidney patios and round raised beds. Block counts and square footage follow the curve.
- **Pools & ponds**: outline them like a patio (straight or curved). Pools get stone coping and clear water (the height control sets the coping thickness); ponds get a sloping dish, dark water, lily pads and a ring of edge boulders. A lawn or patio around them gets a hole cut automatically, and the estimate gives gallons, coping length, liner size and edge rocks.
- **Patios & beds**: outline an area and fill it with one of 13 surfaces. Pavers come in running bond, herringbone, basketweave, 12×12, 24×24 slabs and ashlar; there's also flagstone, concrete, gravel, river rock, decomposed granite, mulch and lawn. Thickness can be adjusted, so a patio can be raised.
- **Library**: 83 items in 9 categories: boulders, wall blocks (single blocks, pillar, seat wall, fire pit, step), pavers and steppers, trees (shade, flowering, Japanese maple, birch, palm, in several sizes), evergreens, shrubs (including Fine Line buckthorn), grasses and perennials, structures (cedar, white and aluminum pergolas; hip- and gable-roof pavilions), and outdoor furniture (dining table and chairs, bistro table, Adirondack chair, chaise lounge, outdoor sofa / loveseat / lounge chair, coffee and side tables, fire table, garden bench, market umbrella, grill, planters). Items land on top of raised beds and raised patios, and can be lifted or lowered by hand. Every rock and plant has its own random shape, and items can be rotated, scaled and recolored.
- **Menu tabs** (Landscape): **Walls** (draw a retaining wall, or place single blocks, caps, pillars, seat walls, steps), **Ground cover** (draw a patio, bed, lawn, gravel, pool or pond; pavers, steppers and boulders), **Furniture** (outdoor furniture, fire pit, pergolas and pavilions), **Plants** (trees, evergreens, shrubs, grasses) and **More** (select, ground slope, anchor A/B, layouts, estimate, sun and view). Picking a tab switches to what it places.
- **Ground slope** (More tab): a bold green 1 m grid over a light tint shows the measured plane. While marking spots the lasers are off; a green ring shows where the next spot lands.
- **Sun & shadows** (Landscape, More tab; off by default): shadows from the real sun for your location, date and time of day. Trees (dappled), walls, structures and furniture cast shadows onto patios and onto the real ground. Use *Set north* once (point the right controller north, pull the trigger), *Use my location* (otherwise it estimates from your time zone), ±1 hour, Now, and summer / spring-fall / winter presets. The shadow map is redrawn only when something changes, to keep the headset smooth.
- **Controls**: press **☰** on the left controller for the menu (press again to close), and point with the right laser to choose. In any mode, **hold the right grip and pull the trigger** to select something; then **A** = done, **B** = delete, hold the trigger to carry it (right stick ↕ lifts it while carrying).
- **Look only & handing the headset over**: the menu's *Look only* turns every button, stick and laser off (☰ still opens the menu). To hand the headset to someone, choose *Anchor A/B* in the menu and let them mark A and B on your landmarks; the app then switches to Look only and they can just walk around.
- **Ground slope**: mark the real ground's height at 2+ spots and the ground becomes a slope: the laser lands on it, lawns and patios tilt, walls step down it, items sit on it, pools and ponds stay level. Anything (items, walls, patios, pools) can also be raised or lowered by hand.
- **Recalibrate** (menu, both apps): if things sit too high or low (e.g. after the headset sleeps), choose *Recalibrate*, touch the controller to the ground and press A; everything shifts so the ground meets that spot. Landscape's menu also has *Reset slope (flat)* and *Put all on slope* (clears every hand raise/lower).
- **Undo popup** (both apps): after adding or deleting something, an **↶ Undo** button pops up for a few seconds; point and pull the trigger (or click it on desktop).
- **Undo / redo, every step** (both apps): left **Y** undoes (while drawing it takes back the last point first); the menu has **Undo** and **Redo**; Ctrl+Z / Ctrl+Shift+Z on desktop. A drag or a held stick counts as one step.
- **Estimate**: blocks and caps (plus a buried base course), pavers with waste, gravel base, cubic yards of loose material and concrete, sod rolls, and plant and boulder counts.
- The Wall Sketch foundation carries over: ground detection, A/B spatial anchors so the layout stays in place between sessions, named layouts with import/export, and a clean view for showing clients.

All models are generated in code ([`landscape/models.js`](landscape/models.js)), so the app loads quickly and works without any asset downloads.

**Outdoors:** the Quest usually has no room scan outside, so it can't find the ground by itself. Touch the right controller to the ground and click the right stick to set it.
