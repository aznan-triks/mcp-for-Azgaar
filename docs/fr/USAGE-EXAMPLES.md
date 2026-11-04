# Exemples commentés

Chaque exemple reprend une forme d'appel réelle de la référence générée ([TOOLS.md](../TOOLS.md), [COMMANDS.md](../COMMANDS.md)). Lisez `map_commands` une fois avant de modifier : il renvoie la même information en direct, et le serveur refuse tout paramètre qui n'y figure pas.

## Regarder avant de toucher

```bash
map_summary {}                       # graine, taille, unités, chaque État avec son identifiant
map_view {"grid": true, "whole_map": true}
map_list {"kind": "burgs", "name": "Nordhaven"}
map_locate {"px": 640, "py": 380}    # pixel d'écran -> unités carte et cellule
```

## Déplacer une frontière, bande par bande

```bash
map_select {"shape": "ring", "args": {"state": 4, "depth": 4}}
map_select {"shape": "rect", "args": {"x0": 900, "y0": 0, "x1": 1600, "y1": 900},
            "combine_op": "intersect", "combine_with": "1"}
map_apply {"command": "assignState", "params": {"selection": "2", "state": 4}}
map_view {"state_ids": true}
map_undo {}                          # si le résultat n'est pas celui voulu
```

Le `ring` sélectionne les cellules juste à l'extérieur de l'État 4, quel qu'en soit le propriétaire ; l'intersection avec un `rect` ne garde que le côté est. Les capitales ne sont jamais prises.

## Fonder un royaume autour d'une ville

```bash
map_list {"kind": "burgs", "name": "Nordhaven"}     # donne la cellule où centrer
map_apply {"command": "createState", "params": {"x": 1180, "y": 640, "name": "Nordmark", "color": "#7fb069"}}
map_apply {"command": "setCapital", "params": {"state": 12, "burg": 772}}
```

## Du relief, sans rien casser autour

```bash
map_apply {"command": "shapeCone", "params": {"x": 700, "y": 500, "radius": 90, "peak": 95}}
map_layers {"show": ["heightmap"]}
map_apply {"command": "setTopography", "params": {"scheme": "natural", "contours": true, "contourInterval": 8, "hachures": true}}
```

Le `scope: land` par défaut gèle côtes et lacs : seules les altitudes bougent. Relever un plateau maritime demande `scope: "all"`, qui reconstruit la carte et renumérote les cellules — la réponse le dit. `setTopography` dessine ensuite le relief de ce terrain (annulable, styles uniquement, jamais les données).

## Une région agrandie sur la même feuille

```bash
map_view {"inset": {"x0": 400, "y0": 180, "x1": 720, "y1": 420,
                    "title": "Le Golfe", "corner": "bottom-right", "cover": 0.4}}
map_export {"format": "png", "name": "planche-atlas", "inset": {"x0": 400, "y0": 180, "x1": 720, "y1": 420}}
```

La loupe est rendue en vecteur à son propre zoom, donc elle reste nette ; la caméra et les calques ne bougent pas, et la planche conserve le ratio de la région.

## Une carte enfant dédiée (destructif, assumé)

```bash
map_apply {"command": "createSubmap", "params": {"x0": 320, "y0": 180, "x1": 960, "y1": 540,
                                                 "confirmDestructiveResample": true}}
```

`maps/pre-submap.map` est écrit d'abord, la réponse donne les bornes réellement utilisées (élargies au ratio du canevas, jamais étirées), et `map_undo` rend la carte parente. Préférez un encart si vous vouliez seulement regarder de plus près.

## Raconter : zones, notes, univers

```bash
map_select {"shape": "circle", "args": {"x": 900, "y": 600, "radius": 120}}
map_apply {"command": "addZone", "params": {"name": "Quarantaine", "type": "danger", "selection": "3", "color": "url(#hatch4)"}}
map_apply {"command": "setNote", "params": {"id": "state:12", "html": "<b>Nordmark</b> a fermé ses frontières en 842."}}
map_summary {}                                   # lore : nom, année, ère, description
```

Une zone couvre des `cells` **ou** une `selection`, jamais les deux. Le texte des notes est nettoyé avant stockage.

## Repeindre toute la carte

```bash
map_list {"kind": "styles"}
map_apply {"command": "applyStylePreset", "params": {"preset": "ink"}}
map_apply {"command": "setStyle", "params": {"path": "ocean.attrs.fill", "value": "#0b2d4a"}}
```

Un nom de préréglage inconnu échoue et liste ceux qui existent ; `value: null` désactive un attribut.

## Images

```bash
map_export {"format": "png", "width": 3840, "height": 2160, "supersample": 2, "filter": "lanczos3", "clean": true}
map_3d {"mode": "globe", "preset": "satellite", "erosion": true, "clouds": true, "diptych": true}
map_export {"format": "csv-burgs", "name": "recensement"}
```

`map_export` répond avec le chemin du fichier et son poids ; les 24 formats sont listés dans [TOOLS.md](../TOOLS.md#map_export).

## Quand l'appel est refusé

Le message nomme les valeurs autorisées, et rien n'a changé : `map_apply` valide avant de muter. Une édition composée qui casse en route est annulée et la réponse dit `the map was restored`. Une entrée d'historique n'est créée que si quelque chose a réellement changé.
