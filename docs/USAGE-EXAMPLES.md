# Worked examples

Each example is a real call shape taken from the generated reference ([TOOLS.md](TOOLS.md), [COMMANDS.md](COMMANDS.md)). Read `map_commands` once before editing: it returns the same information live, and the server refuses a parameter that is not in it.

## Look before you touch

```bash
map_summary {}                       # seed, size, units, every state with its id
map_view {"grid": true, "whole_map": true}
map_list {"kind": "burgs", "name": "Nordhaven"}
map_locate {"px": 640, "py": 380}    # screen pixel -> map units and cell id
```

## Move a border one strip at a time

```bash
map_select {"shape": "ring", "args": {"state": 4, "depth": 4}}
map_select {"shape": "rect", "args": {"x0": 900, "y0": 0, "x1": 1600, "y1": 900},
            "combine_op": "intersect", "combine_with": "1"}
map_apply {"command": "assignState", "params": {"selection": "2", "state": 4}}
map_view {"state_ids": true}
map_undo {}                          # if the answer is not what you meant
```

The `ring` selects the cells just outside state 4 whoever owns them; intersecting with a `rect` keeps the eastern side only. Capitals are never taken.

## Found a kingdom around a city

```bash
map_list {"kind": "burgs", "name": "Nordhaven"}     # gives the cell to centre on
map_apply {"command": "createState", "params": {"x": 1180, "y": 640, "name": "Nordmark", "color": "#7fb069"}}
map_apply {"command": "setCapital", "params": {"state": 12, "burg": 772}}
```

## Terrain, without wrecking anything else

```bash
map_apply {"command": "shapeCone", "params": {"x": 700, "y": 500, "radius": 90, "peak": 95}}
map_layers {"show": ["heightmap"]}
map_apply {"command": "setTopography", "params": {"scheme": "natural", "contours": true, "contourInterval": 8, "hachures": true}}
```

Default `scope: land` keeps coasts and lakes frozen, so only heights change. Raising the seabed needs `scope: "all"`, which rebuilds the map and renumbers cells: the answer says so. `setTopography` then draws the relief for that terrain (undoable, styles only, never terrain data).

## A zoomed region on the same sheet

```bash
map_view {"inset": {"x0": 400, "y0": 180, "x1": 720, "y1": 420,
                    "title": "The Gulf", "corner": "bottom-right", "cover": 0.4}}
map_export {"format": "png", "name": "atlas-plate", "inset": {"x0": 400, "y0": 180, "x1": 720, "y1": 420}}
```

The loupe is vector-rendered at its own zoom, so it stays sharp; the camera and the layers do not move, and the plate keeps the region's aspect ratio.

## A dedicated child map (destructive on purpose)

```bash
map_apply {"command": "createSubmap", "params": {"x0": 320, "y0": 180, "x1": 960, "y1": 540,
                                                 "confirmDestructiveResample": true}}
```

`maps/pre-submap.map` is written first, the reply gives the bounds actually used (widened to the canvas ratio, never stretched), and `map_undo` brings the parent back. Prefer an inset when you only want a closer look.

## Storytelling: zones, notes, the world

```bash
map_select {"shape": "circle", "args": {"x": 900, "y": 600, "radius": 120}}
map_apply {"command": "addZone", "params": {"name": "Quarantine", "type": "danger", "selection": "3", "color": "url(#hatch4)"}}
map_apply {"command": "setNote", "params": {"id": "state:12", "html": "<b>Nordmark</b> closed its borders in 842."}}
map_summary {}                                   # lore: name, year, era, description
```

A zone covers `cells` **or** a `selection`, never both. Note text is cleaned before it is stored.

## Repaint the whole map

```bash
map_list {"kind": "styles"}
map_apply {"command": "applyStylePreset", "params": {"preset": "ink"}}
map_apply {"command": "setStyle", "params": {"path": "ocean.attrs.fill", "value": "#0b2d4a"}}
```

An unknown preset name fails and lists the ones that exist; `value: null` turns an attribute off.

## Pictures

```bash
map_export {"format": "png", "width": 3840, "height": 2160, "supersample": 2, "filter": "lanczos3", "clean": true}
map_3d {"mode": "globe", "preset": "satellite", "erosion": true, "clouds": true, "diptych": true}
map_export {"format": "csv-burgs", "name": "census"}
```

`map_export` answers with the file path and its weight; the 24 formats are listed in [TOOLS.md](TOOLS.md#map_export).

## When the call is refused

The message names the allowed values, and nothing changed: `map_apply` validates before it mutates. A compound edit that breaks midway is rolled back and the answer says `the map was restored`. An undo entry is only created when something actually changed.
