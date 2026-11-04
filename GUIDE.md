# Guide de l'utilisateur — map-of-trois

Bienvenue dans le guide complet de **map-of-trois**. Ce projet transforme votre assistant IA (Claude, Cline, Cursor, ou tout client compatible MCP) en un cartographe et bâtisseur de mondes fantastiques en direct.

Pendant que vous discutez avec l'IA, celle-ci manipule sous vos yeux une véritable fenêtre de navigateur affichant votre carte dans [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator). Vous observez les frontières bouger, les montagnes s'élever et les routes se dessiner en temps réel, tout en pouvant continuer à retoucher la carte à la souris quand bon vous semble.

Tout s'exécute à 100 % sur votre machine, en local et hors-ligne : aucun abonnement tiers, aucune clé d'API requise, et aucune donnée de votre univers n'est transmise sur Internet.

---

## 1. Prise en main en 3 minutes

### Ce qu'il vous faut
- **Système** : Windows 10/11, macOS ou Linux.
- **Navigateur** : Google Chrome (recommandé) ou Microsoft Edge.
- **Node.js** : Version 22.18 ou plus récente (Node 24 ou 25 idéalement). Si vous ne l'avez pas, téléchargez-le sur [nodejs.org](https://nodejs.org).
- **Votre assistant IA** : Claude Desktop, Claude Code, Cline, Cursor, Hermes Agent, LM Studio, etc.

### Installation
1. Ouvrez un terminal dans le dossier du projet :
   ```bash
   npm install
   npm run build:azgaar
   ```
2. Vérifiez que tout est en ordre grâce au médecin de bord :
   ```bash
   npm run doctor
   ```
   *Astuce* : Ajoutez `-- --headed` pour voir la fenêtre de test s'ouvrir et générer une carte en direct sous vos yeux.

3. Branchez votre assistant IA :
   - **Pour Claude Desktop** :
     ```bash
     npm run register -- --desktop
     ```
     Le script configure automatiquement Claude Desktop en prenant soin de sauvegarder votre configuration précédente. Redémarrez ensuite complètement Claude Desktop.
   - **Pour Claude Code** :
     Tapez simplement `npm run register` pour afficher la commande exacte prête à copier-coller (avec les chemins absolus de votre machine).
   - **Pour les autres outils (Cline, Cursor, LM Studio)** :
     `npm run register` vous donne le bloc de configuration exact adapté à votre logiciel.

---

## 2. Dialoguer avec votre cartographe IA

Vous n'avez pas besoin d'apprendre des commandes informatiques : parlez simplement en français avec votre assistant. L'IA sélectionne automatiquement les bons outils.

### Exemples de demandes concrètes

#### Explorer et comprendre le monde
- « *Montre-moi la carte générale.* »
- « *Quels sont les royaumes présents sur ce continent et quelle est leur capitale ?* »
- « *Trouve la ville de Karas et montre-moi la région autour.* »
- « *Qu'y a-t-il au nord du grand fleuve ? Donne-moi la liste des bourgs dans un rayon de 100 kilomètres.* »

#### Façonner royaumes et frontières
- « *Agrandis le royaume de Gazd de 3 cases vers le nord.* »
- « *Repousse la frontière ouest jusqu'au fleuve.* »
- « *Fonde un nouveau duché appelé Val-Fleur autour de la ville côtière.* »
- « *L'empire voisin a annexé son vassal : fusionne ces deux nations.* »
- « *Change la couleur du royaume d'Uzdri en pourpre impérial.* »

#### Relief, montagnes et océans
- « *Élève une haute chaîne de montagnes entre ces deux villes pour former une frontière naturelle.* »
- « *Crée un volcan isolé dans cette plaine.* »
- « *Fais émerger une île dans la baie au sud-est.* »
- « *Adoucis le relief sur ce plateau.* »

#### Villes, cours d'eau et voies marchandes
- « *Fonde un port de pêche fortifié dans cette baie.* »
- « *Donne des remparts, une citadelle et un grand temple à la capitale.* »
- « *Fais naître un fleuve dans les montagnes qui rejoint la mer près du grand port.* »
- « *Trace une route reliant la capitale au comptoir commercial de l'est.* »

#### Cultures, religions et blasons
- « *Fonde une nouvelle culture nomade dans les steppes du sud.* »
- « *Régénère le blason de cette principauté pour lui donner un nouveau style héraldique.* »
- « *Donne à ce royaume un blason en forme de bouclier rond.* »

#### Légendes et ambiance visuelle
- « *Bascule sur la vue du relief et de la topographie.* »
- « *Affiche la légende des climats et des biomes en bas à droite.* »
- « *Ajoute une note manuscrite 'Terres interdites' sur cette forêt.* »

#### Studio 3D et exports haute définition
- « *Fais-moi une capture 3D en perspective du relief de cette péninsule.* »
- « *Crée un diptyque planétaire montrant les deux hémisphères du monde sur un fond d'étoiles avec le halo atmosphérique.* »
- « *Exporte une image très nette en haute résolution (4x) sans les pictogrammes de jeu pour illustrer mon livre.* »

#### Annuler et corriger
- « *Annule ça, le résultat ne me convient pas.* »
- « *Reviens à la version d'avant.* »

---

## 3. Les outils disponibles en un coup d'œil

Le serveur met à la disposition de votre IA **18 outils par défaut** (19 si vous activez l'option avancée `map_eval`) :

| Outil | Ce qu'il fait pour vous |
|---|---|
| `map_view` | Prend une photo de la carte ou la décrit en caractères (`text_map: true` ; mode texte par défaut avec `FMG_TEXT_ONLY=1`). Permet le zoom `region`, le carroyage et les numéros de territoires. Vous avertit si votre zoom manuel ne montre pas la carte entière. |
| `map_summary` | Donne à l'IA une vision d'ensemble chiffrée : nombre d'États, population globale, capitales et métadonnées du monde. |
| `map_locate` | Convertit un point de l'écran en position géographique précise et identifie la cellule correspondante. |
| `map_list` | Retrouve instantanément n'importe quel élément (ville, province, culture, fleuve, route, marqueur) par son nom ou par sa position (dans un rectangle, près d'un point, au nord d'un repère). |
| `map_select` | Dessine une sélection de cellules avec **un contour rouge visible en direct** dans votre navigateur avant d'appliquer un changement. |
| `map_commands` | Présente à l'IA le catalogue exhaustif de toutes les modifications possibles. |
| `map_apply` | Applique la modification demandée (territoire, relief, villes, routes, blasons, textes), ferme préventivement les fenêtres susceptibles de gêner et recalcule les équilibres démographiques. |
| `map_undo` | Annule ou rétablit les dernières actions. Sauvegarde automatiquement vos retouches manuelles dans un fichier de secours avant de revenir en arrière. |
| `map_camera` | Déplace la caméra ou zoome sur un royaume particulier. |
| `map_layers` | Allume ou éteint les 33 calques d'Azgaar (relief, frontières, biomes, routes, vents, température, population, etc.) ou applique des profils complets en un clic. |
| `map_legend` | Ajoute de jolies boîtes de légendes colorées (États, provinces, biomes, altitudes, routes marchandes) qui s'enregistrent avec votre carte. |
| `map_export` | Exporte dans 24 formats : images PNG/JPEG/SVG (jusqu'à 9600 pixels de large en haute résolution, mode `clean`), tuiles, `.map`, JSON, GeoJSON et CSV. |
| `map_3d` | Fait pivoter la planète en 3D : vue en relief sous éclairage rasant, globe orbital ou planche d'atlas complète à deux hémisphères (*diptyque*). |
| `map_file` | Enregistre et recharge vos cartes au format `.map` dans votre dossier local ou directement depuis vos dossiers de notes ; génère une nouvelle carte avec des réglages facultatifs. |
| `map_menu` | Liste et lance les commandes du menu d'Azgaar (éditeurs, régénération) avec annulation automatique des échecs ; une nouvelle carte se crée avec `map_file`. |
| `map_ui` | Retrouve et actionne les commandes de l'interface, lit et modifie des champs, ferme les fenêtres et choisit un fichier à téléverser. |
| `map_options` | Consulte et règle les paramètres de génération, en refusant les valeurs invalides. |
| `map_status` | Indique l'état du moteur et de la connexion locale au navigateur. |

---

## 4. Astuces pour créateurs d'univers, romanciers et rôlistes

### Ne perdez jamais vos retouches manuelles (*Rescue Checkpoint*)
Si vous peaufinez des frontières à la main dans le navigateur et que vous demandez ensuite à l'IA d'annuler une action précédente, **vos retouches ne sont jamais écrasées**. 
Le serveur crée automatiquement une copie de sauvegarde d'urgence dans `maps/rescue-before-undo.map` (les deux précédentes restent dans `rescue-before-undo-1.map` et `-2.map`). Vous pouvez la recharger à tout moment en demandant à l'IA de « charger la carte rescue-before-undo ».

### Des images nettes, même à petite taille
Si les écritures fines ou les contours semblent dentelés sur une image réduite, demandez : « *Exporte la carte en PNG à sa taille habituelle, mais dessine-la d'abord en double résolution puis réduis-la avec le filtre Lanczos.* » L'option `supersample: 2` améliore aussi les aperçus `map_view` ; le filtrage reste facultatif et votre carte originale n'est pas modifiée. Une limite de taille protège la mémoire du navigateur.

### Des cartes d'atlas épurées pour vos livres et campagnes
Les cartes interactives d'Azgaar comportent des pictogrammes pratiques pour le jeu (ancres de ports maritimes, symboles de routes, bornes). Pour exporter une carte digne d'un roman de fantasy :
- Demandez un export avec le mode épuré : l'IA active l'option `clean: true`.
- Les pictogrammes sont temporairement masqués, la capture haute fidélité est générée, puis vos réglages habituels sont restaurés automatiquement sans aucune altération de votre monde.

### Le diptyque planétaire double hémisphère
Pour admirer la planète entière sans aucune déformation de projection :
- Demandez à l'IA : « *Fais-moi un diptyque planétaire de ce monde.* »
- L'outil `map_3d` assemble automatiquement l'hémisphère oriental et l'hémisphère occidental côte à côte sur une même planche, avec un éclairage soigné, un dégradé atmosphérique de Rayleigh et un ciel étoilé cosmique 100 % local. Le résultat est enregistré dans le dossier `exports/`.
- Pour un rendu de planète plus détaillé, demandez « *Fais un globe satellite avec relief érodé, des nuages et une lumière rasante, en diptyque* ». Le relief du globe est une texture de lumière et de bosses **visuelles** : la géographie de votre carte n'est pas modifiée. L'atmosphère est activée par défaut pour les captures de globe ; les nuages sont facultatifs.

### Relief : modification locale ou modification globale ?
- **Par défaut (mode local)** : Vos modifications de relief (montagnes, vallées, cratères) préservent scrupuleusement la ligne de côte et les lacs. Rien ne bouge autour, c'est instantané et sans danger pour vos frontières.
- **Mode global (`scope: "all"`)** : Si vous demandez explicitement de faire surgir une nouvelle île de l'océan ou d'engloutir une presqu'île, la côte est redessinée et la géographie environnante s'adapte automatiquement.

---

## 5. Guide de dépannage

### 1. La fenêtre du navigateur ne s'ouvre pas immédiatement au démarrage
**C'est tout à fait normal.** Par souci d'élégance, le navigateur ne s'ouvre que lorsque l'assistant fait sa toute première demande liée à la carte (pour éviter d'ouvrir une fenêtre inutilement si vous posez une question hors sujet). Une fois ouverte, laissez la fenêtre visible sur votre écran ou en arrière-plan.

### 2. Le médecin de bord signale un conflit de port
Si vous avez lancé deux sessions d'IA ou si une ancienne session n'a pas libéré le port 8765, `npm run doctor` bascule automatiquement sur un port libre pour continuer ses tests. Pour libérer le port standard, fermez simplement la session d'IA précédente ou changez le port dans `config/fmg-mcp.json`.

### 3. La carte apparaît blanche ou affiche des notes de version
Au tout premier lancement avec un profil vierge, le serveur injecte automatiquement vos préférences pour masquer les fenêtres parasites. Si une boîte de dialogue reste visible, demandez simplement à l'IA une action ou fermez-la à la souris : le système ferme automatiquement les éditeurs ouverts avant chaque mutation.

### 4. Où sont enregistrées mes créations ?
- Vos mondes sont automatiquement sauvés chaque minute dans `maps/autosave.map`.
- Vous pouvez donner un nom précis à un monde : « *Sauvegarde cette carte sous le nom Terres-du-Milieu* » (enregistré dans `maps/Terres-du-Milieu.map`).
- Les rendus d'images haute résolution et diptyques 3D se trouvent dans le dossier `exports/`.

### 5. Lancer un diagnostic complet
En cas de doute, une seule commande vérifie tout votre système :
```bash
npm run doctor
```
Elle vérifie la présence de Chrome/Edge, la version de Node, l'intégrité de la construction locale et l'étanchéité hors-ligne.

---

## 6. Pour aller plus loin

Pour les personnes souhaitant explorer la conception technique, les règles de couches logicielles ou les tests automatisés :
- Architecture détaillée : [docs/DESIGN.md](docs/DESIGN.md)
- Journal des versions : [CHANGELOG.md](CHANGELOG.md)

## Diplomacy and military commands (TASK-06)

Use `map_commands` for the complete, typed parameter catalog. All eleven commands below
are undoable through `map_undo({action:"undo"})` and redoable with `action:"redo"`.

- `setDiplomacy({stateId,targetStateId,status})` sets the reciprocal relation and
  records the change. `Vassal` is inverted to `Suzerain` and vice versa.
- `resetDiplomacy({})` regenerates all relations **and replaces the chronicle**.
- `addChronicleEvent({title,text})` appends an escaped event; newlines separate paragraphs.
  `clearChronicle({})` clears history without changing relations.
- `addRegiment({stateId,x,y,name?,units?,naval?,icon?})` creates a regiment and returns
  `details: {id,stateId,regimentId}`. Water creates a fleet by default. Explicit naval
  units on inland land are allowed but return a warning, not a silent relocation.
- `updateRegiment({id,name?,units?,naval?,icon?})` changes properties; `units` is an
  object of native unit names to non-negative integer troop counts. It replaces the
  entire composition; use `{}` to empty it.
- `moveRegiment({id,x,y})` changes position but preserves the base coordinates.
- `splitRegiment({id})` halves troops and returns the new regiment's identifiers.
- `attachRegiment({id,targetId})` transfers all troops to the target, even across states,
  and removes the source. The target may instead use `targetStateId,targetRegimentId`.
- `removeRegiment({id})` disbands a regiment; `regenerateMilitary({})` replaces all forces.

For existing regiments, use **either** the composite `id` **or** the explicit
`stateId,regimentId` pair, never both. `regimentId:0` is valid. Creation uses only the
owner `stateId` since the regiment does not exist yet. Global regeneration takes no id.
The composite wire format is unchanged: `stateId * 10000 + regimentId`.
`map_list({kind:"military",state?})` exposes both forms, coordinates, base coordinates,
naval flag, composition and total troops. `map_list({kind:"diplomacy",state?})` returns
one row per state (`id,name,relations`, indexed by target state id) plus a separate
`chronicle` array of `[title,...paragraphs]`. Spatial filters are supported for military positions; diplomacy has no spatial position. A failed compound edit is restored by the MCP server's existing
snapshot rollback and does not add an undo entry.

## Zones, rich notes and world calendar (TASK-07)

All commands below use `map_apply({command,params})` and are undoable with `map_undo`.
Use `map_commands` for exact parameter schemas.

- `addZone({name,type,cells?,selection?,color?,hidden?})`: cover an explicit cell list
  **or** a selection from `map_select`, never both. Fills accept CSS colours or the
  native hatch range `url(#hatch0)` to `url(#hatch41)`.
- `updateZone({zone,name?,type?,color?,hidden?})`, `setZoneCells({zone,cells?,selection?})`,
  `removeZone({zone})`, `regenerateZones({})`: edit, reshape, delete or replace all zones.
- `setNote({id,html})`, `appendNote({id,html})`, `removeNote({id})`: use entity keys such
  as `state:3` or `regiment:3-0`, or `entity_type,entity_id,entity_sub?` instead of `id`.
  Unsafe elements, event handlers and dangerous URLs are stripped and reported.
- `setMapLore({name?,year?,era?,era_short?,description?})`: update world/calendar data;
  the era short form is derived if omitted. An empty description clears it.

`map_list` gains `zones` and `notes`; `map_summary` gains `lore` and
`counts.zonesCount`, `counts.notesCount`, `counts.regimentsCount` without removing old fields.
The concurrent PR's diplomacy/military names (`state/to/relation`, `state/regiment`,
`to_id/to_state/to_regiment`) remain accepted as aliases of the published names. Supplying
both names for the same field is rejected. `moveRegiment` additionally accepts `rebase:true`.
The published state-row diplomacy format and explicit inland-fleet warning behavior are retained.

## Visual style, city architecture and route/river topology (TASK-08)

All commands below use `map_apply({command,params})` and are undoable with `map_undo`.
Use `map_commands` for exact parameter schemas.

- `applyStylePreset({preset})`: replaces the whole visual style with one of the 15
  built-in themes (`default, ink, ancient, cinderwood, clean, atlas, light, pale,
  watercolor, frostbite, gloom, darkSeas, cyberpunk, night, monochrome`) or a custom
  preset saved in the browser. An unknown preset fails with the available names — it
  never silently falls back to the default.
- `setStyle({path,value})`: one style value by its path, e.g.
  `ocean.groups.base.attrs.fill` or `relief.options.density`. `value` is text, a number
  or true/false; `null` unsets an attribute. The change is drawn immediately.
- `updateBurg({burg,population?,citadel?,walls?,plaza?,temple?,shanty?,port?})` is the
  same edit as `editBurg`; `population` is in **real inhabitants** (the unit
  `map_list({kind:"burgs"})` shows, with `populationRaw` keeping the stored value).
- `updateRoute({route,name?,group?,locked?})`, `splitRoute({route,point})` (cut at an
  inner point — points are counted from 0; the tail keeps the name), and
  `joinRoutes({route,other})` (same group and a shared endpoint only; `other` is removed).
- `updateRiver({river,name?,type?,parent?,sourceWidth?,widthFactor?})`: `parent` is the
  river this one flows into, or its **own id** to make it a mainstem. A cyclic parent is
  refused and the compound edit is rolled back by the server.

`map_list` gains `kind:"styles"` (current `preset`, `systemPresets`, `customPresets`, and
one row per style element with its whole configuration tree). `mergeStates` accepts the
plan's `asProvinces` spelling as an alias of the published `as_provinces`; supplying both
is rejected, exactly as with the legacy parameter aliases.
