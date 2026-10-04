# Usage Examples

Step-by-step recipes for using mcp-for-Azgaar with your AI assistant. You speak to the AI in plain words, and the AI calls the tools behind the scenes.

## How to Talk to the AI

- **Be specific**: Name the exact city, state, or direction you want to change. If you know coordinates, mention them.
- **One change at a time**: Give the AI a single task, let it complete and verify the edit, then ask for the next change.
- **Ask it to check with a view**: Say "Show me the map" or ask for a screenshot to confirm that the result matches your intent.
- **Ask it to undo**: If an edit does not look right, simply say "Undo that" before making any new edits.

---

## Recipes

### 1. Look at the Map and Get a Summary

- **What you type**: "Show me the map and give me a summary of the world."
- **What the AI does**:
  1. Calls `map_summary` with no parameters to gather world seed, dimensions, state counts, and population data.
  2. Calls `map_view` with `{"grid": true, "state_ids": true}` to take a screenshot with coordinate lines and state numbers.
- **What you should see**: A written summary of your realm counts and geography, accompanied by a picture of the map in your chat window.
- **If it does not work**: If the browser window does not open, check that Google Chrome or Microsoft Edge is installed, or ask the AI to run `map_status` to inspect connection health.

### 2. Find a City or State by Name

- **What you type**: "Where is the city named Oron, and which state owns it?"
- **What the AI does**:
  1. Calls `map_list` with `{"kind": "burgs", "name": "Oron"}` to look up the city's coordinates and owner.
  2. Calls `map_camera` with `{"x": 620, "y": 410, "scale": 3}` to center and zoom the browser window on the city.
- **What you should see**: The AI tells you the city coordinates, owner realm, culture, and population, and moves the map camera right over the city.
- **If it does not work**: If `map_list` reports no matches, check the spelling or ask the AI to search for a partial name (the search is case-insensitive).

### 3. Make a State Bigger in One Direction

- **What you type**: "Expand the Kingdom of Gazd towards the east by three cell layers."
- **What the AI does**:
  1. Calls `map_list` with `{"kind": "states", "name": "Gazd"}` to find its state ID (for example, ID 1).
  2. Calls `map_select` with `{"shape": "ring", "args": {"state": 1, "depth": 3}}` to select land cells just outside the border.
  3. Calls `map_select` with `{"shape": "rect", "args": {"x0": 600, "y0": 200, "x1": 1000, "y1": 600}, "combine_op": "intersect", "combine_with": "sel-1"}` to restrict the selection to the eastern side.
  4. Calls `map_apply` with `{"command": "assignState", "params": {"selection": "sel-2", "state": 1}, "view": true}`.
- **What you should see**: A red preview overlay appears live on the eastern border cells in your browser, followed by the border shifting eastward in Gazd's color.
- **If it does not work**: Foreign capital cells can never be captured; if zero cells changed, make sure the selection target is not a foreign capital or open ocean.

### 4. Found a New State Around a City

- **What you type**: "Found a new realm called Eldoria with its capital at the city of Oron."
- **What the AI does**:
  1. Calls `map_list` with `{"kind": "burgs", "name": "Oron"}` to find the city coordinates.
  2. Calls `map_apply` with `{"command": "createState", "params": {"x": 620, "y": 410, "name": "Eldoria"}}` to establish the state capital.
  3. Calls `map_select` with `{"shape": "circle", "args": {"x": 620, "y": 410, "radius": 35}}` to select surrounding land cells.
  4. Calls `map_apply` with `{"command": "assignState", "params": {"selection": "sel-1", "state": 5}}` to give the new country its starting territory.
- **What you should see**: A new capital star appears on the city, a new country name appears in the world summary, and its colored territory spreads around the city.
- **If it does not work**: If the coordinates point to a water cell, `createState` fails; ensure the capital is founded on valid land.

### 5. Merge Two States

- **What you type**: "Merge the Duchy of Khuzd into the Empire of Gazd, and keep Khuzd as a province."
- **What the AI does**:
  1. Calls `map_list` with `{"kind": "states", "name": "Khuzd"}` and `map_list` with `{"kind": "states", "name": "Gazd"}` to find their numeric IDs (e.g. 2 and 1).
  2. Calls `map_apply` with `{"command": "mergeStates", "params": {"states": [2], "into": 1, "as_provinces": true}, "view": true}`.
- **What you should see**: The land previously belonging to Khuzd changes to Gazd's color, Khuzd disappears from the independent state list, and a new province of Gazd is created in its place.
- **If it does not work**: If the tool says a state does not exist, verify that the state has not already been dissolved or merged.

### 6. Rename a State

- **What you type**: "Rename state 1 to Valoria with the official long title Grand Duchy of Valoria."
- **What the AI does**:
  1. Calls `map_apply` with `{"command": "rename", "params": {"kind": "state", "id": 1, "name": "Valoria", "full_name": "Grand Duchy of Valoria"}}`.
  2. Calls `map_view` with `{"state_ids": true}`.
- **What you should see**: The map text displayed across the nation changes to "Grand Duchy of Valoria", and the summary table lists the new short name "Valoria".
- **If it does not work**: If the label does not update on screen, ask the AI to call `map_layers` with `{"show": ["labels"]}` to ensure the text layer is visible.

### 7. Raise or Lower Terrain and Create a Mountain Range

- **What you type**: "Raise a mountain range along the path from point 400,300 to 600,350 with a peak height of 85."
- **What the AI does**:
  1. Calls `map_layers` with `{"show": ["heightmap", "relief"]}` so the relief changes are visible.
  2. Calls `map_apply` with `{"command": "shapeRidge", "params": {"path": [[400, 300], [500, 320], [600, 350]], "width": 30, "peak": 85}}`.
  3. Calls `map_view` with `{}` to verify the new mountain line.
- **What you should see**: Shaded relief peaks and contour coloring rise along the path, with elevations reaching 85 on Azgaar's 0-100 scale (land begins at 20; peaks over 70 are mountains).
- **If it does not work**: Relief edits remain hidden if the relief and heightmap layers are toggled off; verify the layers using `map_layers`.

### 8. Add a City, a River, a Road, and a Marker

- **What you type**: "Add a walled port city called Falconport at 450,300, draw a river from 400,200 to it, add a road connecting to 550,320, and put a ruins marker nearby."
- **What the AI does**:
  1. Calls `map_apply` with `{"command": "addBurg", "params": {"x": 450, "y": 300, "name": "Falconport"}}`.
  2. Calls `map_apply` with `{"command": "editBurg", "params": {"burg": 12, "port": true, "walls": true}}`.
  3. Calls `map_apply` with `{"command": "addRiver", "params": {"path": [[400, 200], [425, 250], [450, 300]], "name": "Falcon River"}}`.
  4. Calls `map_apply` with `{"command": "addRoute", "params": {"path": [[450, 300], [500, 310], [550, 320]], "group": "roads", "name": "Coast Road"}}`.
  5. Calls `map_apply` with `{"command": "addMarker", "params": {"x": 470, "y": 290, "type": "ruins", "name": "Old Watchtower", "note": "Burned sentry post"}}`.
- **What you should see**: A new town symbol with defensive walls appears on the coast, a winding blue river flows down from the hills, a dashed road links east, and a ruins icon appears with hover text.
- **If it does not work**: All points of a river path must be on land cells; if the river tool fails, ensure neither the source nor the intermediate points fall in the ocean.

### 9. Change What Is Displayed (Layers and Presets)

- **What you type**: "Switch the view to the cultural preset, but also turn on rivers and routes."
- **What the AI does**:
  1. Calls `map_layers` with `{"preset": "cultural", "show": ["rivers", "routes"]}`.
  2. Calls `map_view` with `{}`.
- **What you should see**: The map recolors to show culture territories across each region, while keeping river paths and roads clearly drawn over the land.
- **If it does not work**: Calling `map_layers` without arguments lists all active and available layer names so you can see which names can be toggled.

### 10. Export a PNG of Only the Heightmap and Cultures

- **What you type**: "Export a double-resolution PNG picture showing only the heightmap and cultures layers."
- **What the AI does**:
  Calls `map_export` with `{"format": "png", "only_layers": ["heightmap", "cultures"], "resolution": 2, "name": "elevation_cultures"}`.
- **What you should see**: The server frames the whole map, hides all other visual layers, saves the image into your `exports/` folder, and returns the file path and file size.
- **If it does not work**: If the image is very large (over 900 KB), the server saves it to disk in `exports/` without embedding it in the chat response to avoid overloading the AI connection.

### 11. Export GeoJSON, CSV, JSON, and SVG for Other Software

- **What you type**: "Export the map as an SVG graphic, a full JSON package, a CSV list of all cities, and a GeoJSON file of all rivers."
- **What the AI does**:
  1. Calls `map_export` with `{"format": "svg", "name": "world-vector"}`.
  2. Calls `map_export` with `{"format": "json-full", "name": "world-data"}`.
  3. Calls `map_export` with `{"format": "csv-burgs", "name": "cities-table"}`.
  4. Calls `map_export` with `{"format": "geojson-rivers", "name": "rivers-gis"}`.
- **What you should see**: Four files appear inside the `exports/` folder, formatted for vector graphics editors like Inkscape, spreadsheets, and GIS software like QGIS.
- **If it does not work**: If an export times out, check if a previous modal dialog is blocking the browser window, or close leftover dialogs with `map_ui`.

### 12. Generate a New Map with Chosen Settings and Release Them

- **What you type**: "Generate an archipelago map with seed 78945, size 1280 by 720, exactly 8 states, and then release the settings so future maps are random again."
- **What the AI does**:
  1. Calls `map_options` with `{"action": "set", "section": "generation", "values": {"template": "archipelago", "states": {"limit": 8}}}`.
  2. Calls `map_file` with `{"action": "new", "seed": "78945", "width": 1280, "height": 720}`.
  3. Calls `map_options` with `{"action": "release"}`.
  4. Calls `map_summary` with `{}`.
- **What you should see**: The browser reloads with a newly generated archipelago composed of island clusters partitioned into 8 nations, after which setting pins are released.
- **If it does not work**: If `map_options` reports that a value was refused, check the error message; values are validated against Azgaar's options schema and invalid numbers change nothing.

### 13. Change Climate, Units, Calendar, and Realm Name for the Next Map

- **What you type**: "Set the next map to use kilometers for distance, year 1024 Sun Era for the calendar, name it Mythoria, and set equator temperature to 30 degrees."
- **What the AI does**:
  1. Calls `map_options` with `{"action": "set", "section": "map", "values": {"units": {"distance": {"unit": "km"}}, "lore": {"name": "Mythoria", "calendar": {"year": 1024, "era": "Sun Era"}}, "climate": {"temperature": {"equator": 30}}}}`.
  2. Calls `map_file` with `{"action": "new"}`.
- **What you should see**: A new world loads with the title "Mythoria", distance measurements in kilometers, calendar dates in year 1024 Sun Era, and adjusted global climate bands.
- **If it does not work**: `map_options` with `section: "map"` pins values for the next generated map; to change units or names on the current live map, use the editor dialogs via `map_menu` and `map_ui`.

### 14. Regenerate Cities and Undo It

- **What you type**: "Regenerate all cities on the map, show me the result, and then undo it."
- **What the AI does**:
  1. Calls `map_menu` with `{"action": "run", "id": "regenerateBurgs"}`.
  2. Calls `map_view` with `{}`.
  3. Calls `map_undo` with `{"action": "undo"}`.
- **What you should see**: Cities across the entire map vanish and recalculate in fresh positions based on geography; calling undo then restores the previous cities, names, and populations.
- **If it does not work**: If undo reports an empty history, call `map_undo` with `{"action": "list"}` to check what historical snapshots are currently held in memory.

### 15. Open an Editor Dialog and Change Values

- **What you type**: "Open the Units editor, change the distance unit to miles, and close the dialog."
- **What the AI does**:
  1. Calls `map_menu` with `{"action": "run", "id": "editUnitsButton"}` to open the Units dialog.
  2. Calls `map_ui` with `{"action": "list", "scope": "dialogs"}` to find the input controls on screen.
  3. Calls `map_ui` with `{"action": "set", "text": "Distance unit", "value": "mi"}`.
  4. Calls `map_ui` with `{"action": "close_dialogs"}`.
- **What you should see**: The Units editor dialog box appears on screen, the distance dropdown changes to miles, and the dialog box closes.
- **If it does not work**: If the AI cannot locate a field by text label, it can call `map_ui` with `{"action": "find", "scope": "dialogs", "query": "unit"}` to discover the exact element ID.

### 16. Import a Heightmap Picture Using the Image Converter

- **What you type**: "Open the heightmap converter and upload my picture from C:/maps/terrain.png."
- **What the AI does**:
  1. Calls `map_menu` with `{"action": "run", "id": "selectHeightmap"}`.
  2. Calls `map_ui` with `{"action": "upload", "id": "convertImageLoad", "path": "C:/maps/terrain.png"}`.
- **What you should see**: The Image Converter tool opens in Azgaar, receives the local image file, and applies the image's grayscale brightness values directly to the map heightmap.
- **If it does not work**: The path must point to an existing file on your local machine; if the file is missing, the tool stops immediately and displays an error message.

### 17. Save, List, and Load Named Maps

- **What you type**: "Save the current map as 'my-fantasy-world', list all saved maps, and reload it."
- **What the AI does**:
  1. Calls `map_file` with `{"action": "save", "name": "my-fantasy-world"}`.
  2. Calls `map_file` with `{"action": "list"}`.
  3. Calls `map_file` with `{"action": "load", "name": "my-fantasy-world"}`.
- **What you should see**: A file named `my-fantasy-world.map` is created inside the `maps/` directory, listed in the available map saves, and reloaded into the browser.
- **If it does not work**: Map names must only contain letters, digits, spaces, dots, dashes, and underscores; names containing path separators like `/` or `..` are refused.

### 18. Use an AI Model That Cannot See Images

- **What you type**: "Draw a character-based overview of the map."
- **What the AI does**:
  Calls `map_view` with `{"text_map": true, "cols": 60, "rows": 24}`.
- **What you should see**: A character grid rendered in text where `~` is sea, `o` is a lake, `.` is land without a state, digits and letters are states, and `*` marks capitals, followed by a legend key.
- **If it does not work**: If the character map looks squished or cut off, ask for specific dimensions with `cols: 80` and `rows: 30`.

### 19. Zoom and Move the Camera

- **What you type**: "Zoom in closely to coordinates x=500, y=400 with a one-second animation."
- **What the AI does**:
  1. Calls `map_camera` with `{"x": 500, "y": 400, "scale": 4, "duration_ms": 1000}`.
  2. Calls `map_view` with `{"cell_ids": true}`.
- **What you should see**: The browser window smoothly pans to center on map coordinate (500, 400) and magnifies the view four times, revealing individual cell numbers.
- **If it does not work**: To return to the full overview, ask the AI to call `map_camera` with `{"scale": 1}`.

### 20. Undo and Redo Edits

- **What you type**: "Undo the last change, check what is in the undo history, and redo it."
- **What the AI does**:
  1. Calls `map_undo` with `{"action": "undo"}`.
  2. Calls `map_undo` with `{"action": "list"}`.
  3. Calls `map_undo` with `{"action": "redo"}`.
- **What you should see**: The browser reloads the exact previous state of the map, lists the available undo and redo steps in the chat, and re-applies the edit.
- **If it does not work**: An undo causes the browser to reload the saved map, which drops temporary red selection overlays; create a fresh selection before editing again.
