# Configuration

Toute la configuration tient dans un seul fichier JSON. Rien n'est lu dans vos dossiers personnels et aucun réglage ne pointe vers internet : la page de carte est servie depuis votre disque.

## The config file

`config/fmg-mcp.json` is the whole configuration; another file can be pointed at with `FMG_CONFIG`. Every value is checked against the schema when the server starts (a wrong type or an out-of-range number stops it with a readable message); a key the server does not know is ignored, never merged in, so a misspelled name silently keeps the default.

| Setting | Default | Meaning |
|---|---|---|
| `azgaarDist` | `vendor/azgaar/dist-electron/renderer` | Emplacement d'Azgaar compilé (le dossier servi par le serveur local). Relatif au projet. |
| `mapsDir` | `maps` | Dossier des fichiers `.map` : sauvegarde automatique, filets de sécurité, enregistrements `map_file`. Ignoré par Git. |
| `presetsFile` | `layer-presets.json` | Fichier où `map_legend` enregistre ses préréglages de légende personnalisés. |
| `layerPresets` | `{"topography":["lakes","heightmap","rivers","ice","scaleBar"],"biomes":["lakes","biomes","rivers","ice","scaleBar"],"political":["lakes","rivers","states","provinces","borders","ice","labels","burgIcons","scaleBar"],"lore-clean":["lakes","biomes","rivers","labels","scaleBar"],"topographic":["heightmap","rivers","relief","routes","burgIcons","labels","scaleBar"]}` | Groupes de calques nommés acceptés par `map_layers {preset}` et `map_export {layer_preset}`, en plus des profils natifs d'Azgaar. |
| `layerPresets.topography` | `["lakes","heightmap","rivers","ice","scaleBar"]` | Lacs, hypsométrie, rivières, glaces, échelle : lire le relief lui-même. |
| `layerPresets.biomes` | `["lakes","biomes","rivers","ice","scaleBar"]` | Lacs, biomes, rivières, glaces, échelle. |
| `layerPresets.political` | `["lakes","rivers","states","provinces","borders","ice","labels","burgIcons","scaleBar"]` | Frontières, États, provinces, étiquettes, villes, eau, échelle. |
| `layerPresets.lore-clean` | `["lakes","biomes","rivers","labels","scaleBar"]` | Biomes, rivières, étiquettes, échelle : une carte pour un roman, sans politique. |
| `layerPresets.topographic` | `["heightmap","rivers","relief","routes","burgIcons","labels","scaleBar"]` | Profil d'atlas TASK-10 : hypsométrie, rivières, relief, routes, icônes de villes, étiquettes, échelle (sept calques réels). |
| `exportsDir` | `exports` | Dossier de sortie de `map_export` et `map_3d`. Surchargeable par `FMG_EXPORTS_DIR`. |
| `profileDir` | `.browser-profile` | Dossier de profil Chrome : la fenêtre garde son propre état et ne touche jamais votre navigateur. |
| `startup` | `autosave` | Affichage au démarrage du serveur : `autosave` recharge la dernière carte, `new` en génère une. |
| `allowEval` | `false` | Interrupteur maître de `map_eval`, l'outil qui exécute du JavaScript dans la page. Désactivé par défaut ; voir docs/SECURITY.md. |
| `server` | `{"host":"127.0.0.1","port":8765}` | Le serveur HTTP local qui sert Azgaar au navigateur. |
| `server.host` | `127.0.0.1` | Adresse d'écoute. Garder 127.0.0.1 : la carte et les outils ne sont pas authentifiés, c'est assumé. Toute autre valeur affiche un avertissement au démarrage. |
| `server.port` | `8765` | Port préféré ; `npm run doctor` se rabat sur un port éphémère s'il est occupé. |
| `browser` | `{"channel":"chrome","executablePath":null,"headless":true,"viewport":{"width":1920,"height":1080},"readyTimeoutMs":120000,"args":[],"fallbackChannels":["msedge"],"seedStorage":{"fmg-disable-click-arrow-tooltip":"true"},"openOnStart":false}` | Lancement de la fenêtre de navigateur visible. |
| `browser.channel` | `chrome` | Canal Playwright du navigateur (`chrome`, `msedge`, …). |
| `browser.executablePath` | `null` | Binaire de navigateur explicite, quand aucun canal n'est installé (CI, sandbox, Chromium portable). |
| `browser.headless` | `true` | false affiche la carte pendant l'édition ; true pour les tests et les serveurs sans écran. |
| `browser.viewport` | `{"width":1920,"height":1080}` | Taille de fenêtre, donc la taille en pixels des images de `map_view` et `map_3d`. |
| `browser.viewport.width` | `1920` | Largeur en pixels (1920 par défaut). |
| `browser.viewport.height` | `1080` | Hauteur en pixels (1080 par défaut). |
| `browser.readyTimeoutMs` | `120000` | Délai maximal de démarrage d'Azgaar avant un échec explicite. |
| `browser.args` | `[]` | Arguments Chromium supplémentaires (par ex. `--no-sandbox` en conteneur). |
| `browser.fallbackChannels` | `["msedge"]` | Canaux essayés dans l'ordre si le premier est absent. |
| `browser.seedStorage` | `{"fmg-disable-click-arrow-tooltip":"true"}` | Valeurs de stockage local écrites avant le chargement, pour éviter les fenêtres de première visite. |
| `browser.openOnStart` | `false` | false (défaut) : le navigateur s'ouvre au premier outil qui a besoin de la carte, pas au démarrage. |
| `map` | `{"seed":null,"width":1920,"height":1080}` | Carte générée par le serveur quand rien n'est à recharger. |
| `map.seed` | `null` | Graine de génération. Une graine fixe rend les tests reproductibles ; vos cartes viennent de `mapsDir`. |
| `map.width` | `1920` | Largeur en unités carte pour une nouvelle carte. |
| `map.height` | `1080` | Hauteur en unités carte pour une nouvelle carte. |
| `history` | `{"maxEntries":30}` | Système d'annulation. |
| `history.maxEntries` | `30` | Nombre d'étapes conservées pour `map_undo` / `map_redo`. |
| `view` | `{"format":"png","jpegQuality":85,"settleMs":200,"maxImageBytes":900000,"textOnly":false}` | Valeurs par défaut de `map_view`. |
| `view.format` | `png` | png ou jpeg pour une capture. |
| `view.jpegQuality` | `85` | Qualité du repli jpeg quand le PNG dépasse le plafond du client. |
| `view.settleMs` | `200` | Pause entre le cadrage et la capture, le temps que les calques finissent de se dessiner. |
| `view.maxImageBytes` | `900000` | Au-delà, le PNG est remplacé par un aperçu JPEG plus léger ; le fichier sur disque reste intact. |
| `view.textOnly` | `false` | true : répondre par la carte en caractères au lieu d'une image (`map_view {text_map:true}`). |
| `export` | `{"format":"png","jpegQuality":92,"maxPixels":10000,"maxSourcePixels":8192,"clean":false,"cleanHide":["#burgIcons [data-group=\"anchors\"]","#routes","#markers","#ice"]}` | Valeurs par défaut de `map_export`. |
| `export.format` | `png` | Format utilisé quand l'appel n'en nomme aucun. |
| `export.jpegQuality` | `92` | Qualité JPEG de l'image après filtrage éventuel (92). |
| `export.maxPixels` | `10000` | Largeur demandée maximale acceptée (10000). |
| `export.maxSourcePixels` | `8192` | Plafond de la capture haute résolution temporaire utilisée par `supersample` (8192). |
| `export.clean` | `false` | Défaut de l'option `clean` (masquer ancres de ports, routes, marqueurs, glaces). |
| `export.cleanHide` | `["#burgIcons [data-group=\"anchors\"]","#routes","#markers","#ice"]` | Sélecteurs CSS masqués par `clean`. |
| `bridge` | `{}` | Valeurs passées à `FMG_AGENT.configure()` au démarrage (couleurs, limites du pont). Voir le tableau des réglages du pont plus bas. |
| `limits` | `{"listMax":1000,"zoomMin":0.5,"zoomMax":80,"cameraMsMax":5000,"scaleTolerance":0.01,"imageBytesMin":10000,"imageBytesMax":5000000,"mapSizeMin":100,"mapSizeMax":8000,"exportTimeoutMs":60000,"mapFileBytesMax":200000000}` | Limites que les outils valident avant d'agir. |
| `limits.listMax` | `1000` | `limit` maximum accepté par `map_list` (la réponse par défaut est coupée à 50 lignes). |
| `limits.zoomMin` | `0.5` | Échelle de caméra minimale. |
| `limits.zoomMax` | `80` | Échelle de caméra maximale. |
| `limits.cameraMsMax` | `5000` | Durée maximale d'un mouvement de caméra animé. |
| `limits.scaleTolerance` | `0.01` | Écart toléré entre l'échelle de caméra demandée et appliquée avant avertissement. |
| `limits.imageBytesMin` | `10000` | Plafond d'image minimal qu'un appel peut demander. |
| `limits.imageBytesMax` | `5000000` | Plafond d'image maximal qu'un appel peut demander. |
| `limits.mapSizeMin` | `100` | Plus petite valeur `mapSize` épinglable. |
| `limits.mapSizeMax` | `8000` | Plus grande valeur `mapSize` épinglable. |
| `limits.exportTimeoutMs` | `60000` | Délai d'attente d'un téléchargement du navigateur (export natif). |
| `limits.mapFileBytesMax` | `200000000` | Taille maximale (en octets) d'un fichier `.map` que `map_file load` accepte de lire. Un fichier plus gros est refusé avec un message, au lieu de saturer la mémoire. |
| `azgaarPackage` | `vendor/azgaar/package.json` | Où lire la version d'Azgaar épinglée (sert à masquer ses notes de version au premier lancement). |
| `autosave` | `{"intervalSec":60}` | Sauvegarde en arrière-plan de la carte en cours. |
| `autosave.intervalSec` | `60` | Secondes entre deux sauvegardes automatiques (0 désactive). Vos retouches manuelles sont capturées aussi. |
| `view3d` | `{"format":"png","quality":92,"hemisphereOffset":0.25,"presets":{"satellite":{"satellite":true,"erosion":false},"heightmap":{"layerPreset":"topography"},"biomes":{"layerPreset":"biomes"}}}` | Valeurs par défaut de `map_3d`. |
| `view3d.format` | `png` | png, jpeg ou webp. |
| `view3d.quality` | `92` | Qualité pour les formats avec perte. |
| `view3d.hemisphereOffset` | `0.25` | Fraction de l'étendue en longitude de la carte (0–0,5) entre les centres des vues ouest et est d'un diptyque. |
| `view3d.presets` | `{"satellite":{"satellite":true,"erosion":false},"heightmap":{"layerPreset":"topography"},"biomes":{"layerPreset":"biomes"}}` | Ambiances 3D nommées acceptées par `map_3d {preset}`. |
| `view3d.presets.satellite` | `{"satellite":true,"erosion":false}` | Texture satellite procédurale avec détail de relief cuit. |
| `view3d.presets.satellite.satellite` | `true` | Utiliser le matériau satellite au lieu d'une couleur plate. |
| `view3d.presets.satellite.erosion` | `false` | Cuiter le détail d'érosion dans les cartes de relief et de brillance. |
| `view3d.presets.heightmap` | `{"layerPreset":"topography"}` | Enrouler le calque hypsométrique de la carte plate sur la sphère. |
| `view3d.presets.heightmap.layerPreset` | `topography` | Quel groupe de calques est rendu dans cette texture. |
| `view3d.presets.biomes` | `{"layerPreset":"biomes"}` | Idem, avec les couleurs de biomes. |
| `view3d.presets.biomes.layerPreset` | `biomes` | Groupe de calques rendu dans cette texture (`biomes`). |

## Environment variables

Every variable is an override of the same settings, for the cases where editing the file is not wanted (a second client, a container, CI).

| Variable | Meaning |
|---|---|
| `FMG_AGENT` | Ce n'est pas une variable : c'est l'objet du pont, `window.FMG_AGENT`, que les outils appellent dans la page (cité ici pour documenter le nom). |
| `FMG_ALLOW_EVAL` | Surcharge `allowEval` (`1` active `map_eval`). |
| `FMG_CONFIG` | Chemin d'une configuration JSON alternative à `config/fmg-mcp.json`. |
| `FMG_EXECUTABLE_PATH` | Binaire de navigateur à lancer (ce que `npm run doctor` reprend de `FMG_TEST_CHROMIUM`). |
| `FMG_EXPORTS_DIR` | Dossier absolu d'exports, sur votre machine. |
| `FMG_HEADLESS` | `1` ou `0` pour forcer sans fenêtre ou avec fenêtre. |
| `FMG_MAPS_DIR` | Dossier absolu des fichiers `.map`. |
| `FMG_PORT` | Port local de la page de carte : un entier de 0 à 65535, toute autre valeur arrête le démarrage avec un message clair. |
| `FMG_PROFILE_DIR` | Dossier de profil Chrome absolu pour ce projet. |
| `FMG_TEST_ARGS` | Tests uniquement : arguments navigateur séparés par virgules (par ex. `--no-sandbox`). |
| `FMG_TEST_CHANNEL` | Tests uniquement : canal de navigateur à utiliser. |
| `FMG_TEST_CHROMIUM` | Tests et CI uniquement : chemin d'un Chromium quand Chrome n'est pas installé. |
| `FMG_TEST_HEADED` | Tests uniquement : lancer avec fenêtre visible (écran requis, par ex. `xvfb-run -a`). |
| `FMG_TEXT_ONLY` | `1` : toute vue répond avec la carte en caractères. |

## Bridge defaults (`bridge`)

Le pont (le code compilé dans Azgaar, `vendor/azgaar/src/agent/config.ts`) a ses propres valeurs par défaut. Chacune se surcharge sans toucher le source, via l'objet `bridge` du fichier de configuration. Ce sont des réglages internes (limites, couleurs, délais) : le tableau donne la valeur courante.

| Setting | Value |
|---|---|
| `gridDivisions` | 8 |
| `maxCellLabels` | 500 |
| `maxSelectionCells` | 40000 |
| `maxSelections` | 20 |
| `selectionFill` | "rgba(255, 40, 40, 0.38)" |
| `selectionStroke` | "rgba(200, 0, 0, 0.9)" |
| `gridStroke` | "rgba(0, 0, 0, 0.45)" |
| `labelColor` | "#111111" |
| `labelHalo` | "#ffffff" |
| `labelFont` | "monospace" |
| `badgeFill` | "#ffffffcc" |
| `badgeStroke` | "#000000" |
| `overlayZIndex` | 50 |
| `labelPx` | 12 |
| `settleMs` | 600 |
| `importTimeoutMs` | 60000 |
| `listLimit` | 50 |
| `regionMargin` | 0.08 |
| `defaultRiverFlux` | 30 |
| `textMapCols` | 100 |
| `textMapRows` | 40 |
| `textMapMax` | 200 |
| `uiOptionsMax` | 40 |
| `uiTextMax` | 1500 |
| `menuListMax` | 200 |
| `legendMarginPct` | 1 |
| `legendHeightSteps` | [20, 30, 40, 50, 60, 70, 80, 90, 100] |
| `legendLongItems` | 40 |
| `legendSeaSteps` | [0, 10] |
| `legendRainSamples` | [0.25, 0.5, 1] |
| `legendPopulationBarPx` | 10 |
| `legendMarketColor` | "#dababf" |
| `legendTradeLandColor` | "#8c6a3b" |
| `legendTradeWaterColor` | "#3b6a8c" |
| `annotationHaloColor` | "#ffffff" |
| `annotationColor` | "#c0392b" |
| `annotationMarkerRadius` | 3 |
| `annotationFontSize` | 6 |
| `annotationStrokeWidth` | 1 |
| `annotationAreaOpacity` | 0.35 |
| `annotationTextMax` | 120 |
| `temperatureMin` | -50 |
| `temperatureMax` | 50 |
| `view3dPollMs` | 400 |
| `view3dStableReads` | 2 |
| `view3dTimeoutMs` | 30000 |
| `view3dStableDiff` | 2 |
| `view3dSampleSize` | 32 |
| `view3dTextureMax` | 8192 |
| `view3dDefaultDistance` | { relief: 640, globe: 3 } |
| `view3dSunVectorLength` | 1000 |
| `downsampleMaxDimension` | 8192 |
| `downsampleMaxSupersample` | 4 |
| `downsampleJpegQuality` | 0.92 |
| `downsampleBlobLifetimeMs` | 5000 |
| `minContourInterval` | 2 |
| `insetBackground` | "#fff9ed" |
| `insetInk` | "#342b22" |
| `insetCover` | 0.4 |
| `insetMargin` | 0.02 |
| `insetTitleMax` | 120 |
| `diptychBgColor` | "#01040a" |
| `diptychTextColor` | "#ffffff" |
| `diptychSubtextColor` | "#94a3b8" |
| `diptychAtmosphereColor` | "rgba(80, 160, 255, 0.45)" |
| `diptychAtmosphereMidColor` | "rgba(60, 130, 240, 0.15)" |
| `diptychAtmosphereEndColor` | ? |

## Two clients at once?

One server owns one browser profile and one port. Running a second AI client at the same time collides on both (`8765` and the profile lock): give the second one its own `FMG_PORT` and `FMG_PROFILE_DIR`, or close the first client.
