# Exemples d'utilisation

Version anglaise : [USAGE-EXAMPLES.md](../USAGE-EXAMPLES.md).

Recettes pas à pas pour utiliser mcp-for-Azgaar avec votre assistant IA. Vous vous adressez à l'IA avec des mots simples, et l'IA appelle les outils en coulisses.

## Comment parler à l'IA

- **Soyez précis** : Donnez le nom exact de la ville, de l'État ou de la direction que vous souhaitez modifier. Si vous connaissez les coordonnées, mentionnez-les.
- **Une modification à la fois** : Donnez une seule tâche à l'IA, laissez-la terminer et vérifier la modification, puis demandez la modification suivante.
- **Demandez-lui de vérifier avec une vue** : Dites « Montre-moi la carte » ou demandez une capture d'écran pour confirmer que le résultat correspond à ce que vous vouliez.
- **Demandez-lui d'annuler** : Si une modification ne vous convient pas, dites simplement « Annule ça » avant d'effectuer de nouvelles modifications.

---

## Recettes

### 1. Regarder la carte et obtenir un résumé

- **Ce que vous tapez** : « Montre-moi la carte et donne-moi un résumé du monde. »
- **Ce que fait l'IA** :
  1. Appelle `map_summary` sans paramètre pour recueillir la graine du monde, les dimensions, le nombre d'États et les données de population.
  2. Appelle `map_view` avec `{"grid": true, "state_ids": true}` pour prendre une capture d'écran avec les lignes de coordonnées et les numéros d'États.
- **Ce que vous devriez voir** : Un résumé écrit du nombre de vos royaumes et de la géographie, accompagné d'une image de la carte dans votre fenêtre de discussion.
- **Si cela ne fonctionne pas** : Si la fenêtre du navigateur ne s'ouvre pas, vérifiez que Google Chrome ou Microsoft Edge est installé, ou demandez à l'IA d'exécuter `map_status` pour inspecter l'état de la connexion.

### 2. Trouver une ville ou un État par son nom

- **Ce que vous tapez** : « Où se trouve la ville appelée Oron, et quel État la possède ? »
- **Ce que fait l'IA** :
  1. Appelle `map_list` avec `{"kind": "burgs", "name": "Oron"}` pour rechercher les coordonnées de la ville et son propriétaire.
  2. Appelle `map_camera` avec `{"x": 620, "y": 410, "scale": 3}` pour centrer et zoomer la fenêtre du navigateur sur la ville.
- **Ce que vous devriez voir** : L'IA vous indique les coordonnées de la ville, le royaume propriétaire, la culture et la population, et déplace la caméra de la carte directement au-dessus de la ville.
- **Si cela ne fonctionne pas** : Si `map_list` n'indique aucune correspondance, vérifiez l'orthographe ou demandez à l'IA de rechercher une partie du nom (la recherche n'est pas sensible à la casse).

### 3. Agrandir un État dans une direction

- **Ce que vous tapez** : « Agrandis le Royaume de Gazd vers l'est de trois couches de cellules. »
- **Ce que fait l'IA** :
  1. Appelle `map_list` avec `{"kind": "states", "name": "Gazd"}` pour trouver son identifiant d'État (par exemple, l'identifiant 1).
  2. Appelle `map_select` avec `{"shape": "ring", "args": {"state": 1, "depth": 3}}` pour sélectionner les cellules terrestres juste en dehors de la frontière.
  3. Appelle `map_select` avec `{"shape": "rect", "args": {"x0": 600, "y0": 200, "x1": 1000, "y1": 600}, "combine_op": "intersect", "combine_with": "sel-1"}` pour restreindre la sélection au côté est.
  4. Appelle `map_apply` avec `{"command": "assignState", "params": {"selection": "sel-2", "state": 1}, "view": true}`.
- **Ce que vous devriez voir** : Un calque d'aperçu rouge apparaît en direct sur les cellules frontalières orientales dans votre navigateur, puis la frontière se déplace vers l'est avec la couleur de Gazd.
- **Si cela ne fonctionne pas** : Les cellules des capitales étrangères ne peuvent jamais être capturées ; si zéro cellule a changé, assurez-vous que la cible de sélection n'est pas une capitale étrangère ou le plein océan.

### 4. Fonder un nouvel État autour d'une ville

- **Ce que vous tapez** : « Fonde un nouveau royaume appelé Eldoria avec sa capitale dans la ville d'Oron. »
- **Ce que fait l'IA** :
  1. Appelle `map_list` avec `{"kind": "burgs", "name": "Oron"}` pour trouver les coordonnées de la ville.
  2. Appelle `map_apply` avec `{"command": "createState", "params": {"x": 620, "y": 410, "name": "Eldoria"}}` pour établir la capitale de l'État.
  3. Appelle `map_select` avec `{"shape": "circle", "args": {"x": 620, "y": 410, "radius": 35}}` pour sélectionner les cellules terrestres environnantes.
  4. Appelle `map_apply` avec `{"command": "assignState", "params": {"selection": "sel-1", "state": 5}}` pour attribuer au nouveau pays son territoire initial.
- **Ce que vous devriez voir** : Une nouvelle étoile de capitale apparaît sur la ville, un nouveau nom de pays apparaît dans le résumé du monde, et son territoire coloré s'étend autour de la ville.
- **Si cela ne fonctionne pas** : Si les coordonnées pointent vers une cellule aquatique, `createState` échoue ; assurez-vous que la capitale est fondée sur de la terre ferme valide.

### 5. Fusionner deux États

- **Ce que vous tapez** : « Fusionne le Duché de Khuzd dans l'Empire de Gazd, et conserve Khuzd en tant que province. »
- **Ce que fait l'IA** :
  1. Appelle `map_list` avec `{"kind": "states", "name": "Khuzd"}` et `map_list` avec `{"kind": "states", "name": "Gazd"}` pour trouver leurs identifiants numériques (par exemple 2 et 1).
  2. Appelle `map_apply` avec `{"command": "mergeStates", "params": {"states": [2], "into": 1, "as_provinces": true}, "view": true}`.
- **Ce que vous devriez voir** : Le territoire appartenant auparavant à Khuzd prend la couleur de Gazd, Khuzd disparaît de la liste des États indépendants, et une nouvelle province de Gazd est créée à sa place.
- **Si cela ne fonctionne pas** : Si l'outil indique qu'un État n'existe pas, vérifiez que l'État n'a pas déjà été dissous ou fusionné.

### 6. Renommer un État

- **Ce que vous tapez** : « Renomme l'État 1 en Valoria avec le titre officiel complet Grand Duché de Valoria. »
- **Ce que fait l'IA** :
  1. Appelle `map_apply` avec `{"command": "rename", "params": {"kind": "state", "id": 1, "name": "Valoria", "full_name": "Grand Duchy of Valoria"}}`.
  2. Appelle `map_view` avec `{"state_ids": true}`.
- **Ce que vous devriez voir** : Le texte de la carte affiché sur toute la nation devient « Grand Duchy of Valoria », et le tableau récapitulatif liste le nouveau nom court « Valoria ».
- **Si cela ne fonctionne pas** : Si l'étiquette ne s'actualise pas à l'écran, demandez à l'IA d'appeler `map_layers` avec `{"show": ["labels"]}` pour vous assurer que le calque de texte est visible.

### 7. Élever ou abaisser le terrain et créer une chaîne de montagnes

- **Ce que vous tapez** : « Élève une chaîne de montagnes le long du tracé allant du point 400,300 à 600,350 avec une hauteur de crête de 85. »
- **Ce que fait l'IA** :
  1. Appelle `map_layers` avec `{"show": ["heightmap", "relief"]}` pour que les changements de relief soient visibles.
  2. Appelle `map_apply` avec `{"command": "shapeRidge", "params": {"path": [[400, 300], [500, 320], [600, 350]], "width": 30, "peak": 85}}`.
  3. Appelle `map_view` avec `{}` pour vérifier le nouveau tracé montagneux.
- **Ce que vous devriez voir** : Des sommets en relief ombré et des couleurs de niveau s'élèvent le long du tracé, avec des altitudes atteignant 85 sur l'échelle de 0 à 100 d'Azgaar (la terre commence à 20 ; les crêtes au-dessus de 70 sont des montagnes).
- **Si cela ne fonctionne pas** : Les modifications de relief restent masquées si les calques de relief et de relief ombré sont désactivés ; vérifiez les calques à l'aide de `map_layers`.

### 8. Ajouter une ville, un fleuve, une route et un marqueur

- **Ce que vous tapez** : « Ajoute une ville portuaire fortifiée appelée Falconport en 450,300, trace un fleuve depuis 400,200 jusqu'à elle, ajoute une route la reliant à 550,320 et place un marqueur de ruines à proximité. »
- **Ce que fait l'IA** :
  1. Appelle `map_apply` avec `{"command": "addBurg", "params": {"x": 450, "y": 300, "name": "Falconport"}}`.
  2. Appelle `map_apply` avec `{"command": "editBurg", "params": {"burg": 12, "port": true, "walls": true}}`.
  3. Appelle `map_apply` avec `{"command": "addRiver", "params": {"path": [[400, 200], [425, 250], [450, 300]], "name": "Falcon River"}}`.
  4. Appelle `map_apply` avec `{"command": "addRoute", "params": {"path": [[450, 300], [500, 310], [550, 320]], "group": "roads", "name": "Coast Road"}}`.
  5. Appelle `map_apply` avec `{"command": "addMarker", "params": {"x": 470, "y": 290, "type": "ruins", "name": "Old Watchtower", "note": "Burned sentry post"}}`.
- **Ce que vous devriez voir** : Un nouveau symbole de ville avec des remparts apparaît sur la côte, un fleuve bleu sinueux descend des collines, une route en pointillés relie l'est et une icône de ruines apparaît avec un texte au survol.
- **Si cela ne fonctionne pas** : Tous les points du tracé d'un fleuve doivent se trouver sur des cellules terrestres ; si l'outil de fleuve échoue, assurez-vous que ni la source ni les points intermédiaires ne se trouvent dans l'océan.

### 9. Modifier les éléments affichés (calques et préréglages)

- **Ce que vous tapez** : « Bascule l'affichage sur le préréglage culturel, mais active aussi les fleuves et les routes. »
- **Ce que fait l'IA** :
  1. Appelle `map_layers` avec `{"preset": "cultural", "show": ["rivers", "routes"]}`.
  2. Appelle `map_view` avec `{}`.
- **Ce que vous devriez voir** : La carte change de couleur pour afficher les territoires culturels à travers chaque région, tout en gardant les tracés des fleuves et les routes clairement dessinés sur les terres.
- **Si cela ne fonctionne pas** : Appeler `map_layers` sans argument liste tous les noms de calques actifs et disponibles pour voir quels noms peuvent être activés ou désactivés.

### 10. Exporter un PNG contenant uniquement la carte des hauteurs et les cultures

- **Ce que vous tapez** : « Exporte une image PNG en double résolution montrant uniquement les calques de la carte des hauteurs et des cultures. »
- **Ce que fait l'IA** :
  Appelle `map_export` avec `{"format": "png", "only_layers": ["heightmap", "cultures"], "resolution": 2, "name": "elevation_cultures"}`.
- **Ce que vous devriez voir** : Le serveur cadre toute la carte, masque tous les autres calques visuels, enregistre l'image dans votre dossier `exports/`, puis renvoie le chemin du fichier et sa taille.
- **Si cela ne fonctionne pas** : Si l'image est très volumineuse (plus de 900 Ko), le serveur l'enregistre sur le disque dans `exports/` sans l'intégrer dans la réponse du chat pour éviter de surcharger la connexion avec l'IA.

### 11. Exporter en GeoJSON, CSV, JSON et SVG pour d'autres logiciels

- **Ce que vous tapez** : « Exporte la carte sous forme de graphique SVG, de paquet JSON complet, de liste CSV de toutes les villes et de fichier GeoJSON de tous les cours d'eau. »
- **Ce que fait l'IA** :
  1. Appelle `map_export` avec `{"format": "svg", "name": "world-vector"}`.
  2. Appelle `map_export` avec `{"format": "json-full", "name": "world-data"}`.
  3. Appelle `map_export` avec `{"format": "csv-burgs", "name": "cities-table"}`.
  4. Appelle `map_export` avec `{"format": "geojson-rivers", "name": "rivers-gis"}`.
- **Ce que vous devriez voir** : Quatre fichiers apparaissent dans le dossier `exports/`, formatés pour les éditeurs de graphismes vectoriels comme Inkscape, les tableurs et les logiciels SIG comme QGIS.
- **Si cela ne fonctionne pas** : Si un export expire (délai dépassé), vérifiez si une boîte de dialogue modale précédente bloque la fenêtre du navigateur, ou fermez les boîtes de dialogue restantes avec `map_ui`.

### 12. Générer une nouvelle carte avec les réglages choisis et les libérer

- **Ce que vous tapez** : « Génère une carte d'archipel avec la graine 78945, une taille de 1280 par 720, exactement 8 États, puis libère les réglages pour que les futures cartes redeviennent aléatoires. »
- **Ce que fait l'IA** :
  1. Appelle `map_options` avec `{"action": "set", "section": "generation", "values": {"template": "archipelago", "states": {"limit": 8}}}`.
  2. Appelle `map_file` avec `{"action": "new", "seed": "78945", "width": 1280, "height": 720}`.
  3. Appelle `map_options` avec `{"action": "release"}`.
  4. Appelle `map_summary` avec `{}`.
- **Ce que vous devriez voir** : Le navigateur se recharge avec un archipel nouvellement généré composé de groupes d'îles divisés en 8 nations, après quoi les réglages épinglés sont libérés.
- **Si cela ne fonctionne pas** : Si `map_options` signale qu'une valeur a été refusée, vérifiez le message d'erreur ; les valeurs sont validées par rapport au schéma d'options d'Azgaar et les nombres non valides ne changent rien.

### 13. Modifier le climat, les unités, le calendrier et le nom du royaume pour la prochaine carte

- **Ce que vous tapez** : « Règle la prochaine carte pour utiliser les kilomètres pour les distances, l'année 1024 Ère Solaire pour le calendrier, nomme-la Mythoria et règle la température à l'équateur sur 30 degrés. »
- **Ce que fait l'IA** :
  1. Appelle `map_options` avec `{"action": "set", "section": "map", "values": {"units": {"distance": {"unit": "km"}}, "lore": {"name": "Mythoria", "calendar": {"year": 1024, "era": "Sun Era"}}, "climate": {"temperature": {"equator": 30}}}}`.
  2. Appelle `map_file` avec `{"action": "new"}`.
- **Ce que vous devriez voir** : Un nouveau monde se charge avec le titre « Mythoria », des mesures de distance en kilomètres, des dates de calendrier en l'an 1024 Ère Solaire et des zones climatiques globales ajustées.
- **Si cela ne fonctionne pas** : `map_options` avec `section: "map"` épingle les valeurs pour la prochaine carte générée ; pour changer les unités ou les noms sur la carte active actuelle, utilisez les boîtes de dialogue d'édition via `map_menu` et `map_ui`.

### 14. Régénérer les villes et annuler l'opération

- **Ce que vous tapez** : « Régénère toutes les villes sur la carte, montre-moi le résultat, puis annule. »
- **Ce que fait l'IA** :
  1. Appelle `map_menu` avec `{"action": "run", "id": "regenerateBurgs"}`.
  2. Appelle `map_view` avec `{}`.
  3. Appelle `map_undo` avec `{"action": "undo"}`.
- **Ce que vous devriez voir** : Les villes sur l'ensemble de la carte disparaissent et sont recalculées à de nouveaux emplacements en fonction de la géographie ; appeler l'annulation rétablit ensuite les villes, noms et populations précédents.
- **Si cela ne fonctionne pas** : Si l'annulation signale un historique vide, appelez `map_undo` avec `{"action": "list"}` pour vérifier quels instantanés historiques sont actuellement conservés en mémoire.

### 15. Ouvrir une boîte de dialogue d'édition et modifier des valeurs

- **Ce que vous tapez** : « Ouvre l'éditeur d'Unités, change l'unité de distance en milles, et ferme la boîte de dialogue. »
- **Ce que fait l'IA** :
  1. Appelle `map_menu` avec `{"action": "run", "id": "editUnitsButton"}` pour ouvrir la boîte de dialogue des Unités.
  2. Appelle `map_ui` avec `{"action": "list", "scope": "dialogs"}` pour trouver les contrôles de saisie à l'écran.
  3. Appelle `map_ui` avec `{"action": "set", "text": "Distance unit", "value": "mi"}`.
  4. Appelle `map_ui` avec `{"action": "close_dialogs"}`.
- **Ce que vous devriez voir** : La boîte de dialogue de l'éditeur d'Unités apparaît à l'écran, le menu déroulant de distance passe sur les milles, et la boîte de dialogue se ferme.
- **Si cela ne fonctionne pas** : Si l'IA ne parvient pas à localiser un champ par son libellé textuel, elle peut appeler `map_ui` avec `{"action": "find", "scope": "dialogs", "query": "unit"}` pour découvrir l'identifiant exact de l'élément.

### 16. Importer une image de carte des hauteurs avec le Convertisseur d'Image

- **Ce que vous tapez** : « Ouvre le convertisseur de carte des hauteurs et charge mon image depuis C:/maps/terrain.png. »
- **Ce que fait l'IA** :
  1. Appelle `map_menu` avec `{"action": "run", "id": "selectHeightmap"}`.
  2. Appelle `map_ui` avec `{"action": "upload", "id": "convertImageLoad", "path": "C:/maps/terrain.png"}`.
- **Ce que vous devriez voir** : L'outil Convertisseur d'Image s'ouvre dans Azgaar, reçoit le fichier image local et applique les niveaux de luminosité en niveaux de gris de l'image directement à la carte des hauteurs de la carte.
- **Si cela ne fonctionne pas** : Le chemin doit pointer vers un fichier existant sur votre ordinateur local ; si le fichier est manquant, l'outil s'arrête immédiatement et affiche un message d'erreur.

### 17. Sauvegarder, lister et charger des cartes nommées

- **Ce que vous tapez** : « Enregistre la carte actuelle sous le nom 'my-fantasy-world', liste toutes les cartes enregistrées et recharge-la. »
- **Ce que fait l'IA** :
  1. Appelle `map_file` avec `{"action": "save", "name": "my-fantasy-world"}`.
  2. Appelle `map_file` avec `{"action": "list"}`.
  3. Appelle `map_file` avec `{"action": "load", "name": "my-fantasy-world"}`.
- **Ce que vous devriez voir** : Un fichier nommé `my-fantasy-world.map` est créé dans le dossier `maps/`, listé dans les sauvegardes de cartes disponibles et rechargé dans le navigateur.
- **Si cela ne fonctionne pas** : Les noms de cartes ne doivent contenir que des lettres, des chiffres, des espaces, des points, des tirets et des traits de soulignement ; les noms contenant des séparateurs de chemin comme `/` ou `..` sont refusés.

### 18. Utiliser un modèle d'IA qui ne peut pas voir les images

- **Ce que vous tapez** : « Dessine un aperçu textuel de la carte. »
- **Ce que fait l'IA** :
  Appelle `map_view` avec `{"text_map": true, "cols": 60, "rows": 24}`.
- **Ce que vous devriez voir** : Une grille de caractères affichée en texte où `~` représente la mer, `o` un lac, `.` une terre sans État, les chiffres et les lettres représentent des États, et `*` marque les capitales, suivie d'une légende.
- **Si cela ne fonctionne pas** : Si la carte textuelle semble écrasée ou tronquée, demandez des dimensions spécifiques avec `cols: 80` et `rows: 30`.

### 19. Zoomer et déplacer la caméra

- **Ce que vous tapez** : « Zoome de près sur les coordonnées x=500, y=400 avec une animation d'une seconde. »
- **Ce que fait l'IA** :
  1. Appelle `map_camera` avec `{"x": 500, "y": 400, "scale": 4, "duration_ms": 1000}`.
  2. Appelle `map_view` avec `{"cell_ids": true}`.
- **Ce que vous devriez voir** : La fenêtre du navigateur effectue un panoramique fluide pour se centrer sur les coordonnées cartographiques (500, 400) et agrandit la vue quatre fois, révélant les numéros individuels des cellules.
- **Si cela ne fonctionne pas** : Pour revenir à la vue d'ensemble complète, demandez à l'IA d'appeler `map_camera` avec `{"scale": 1}`.

### 20. Annuler et rétablir des modifications

- **Ce que vous tapez** : « Annule la dernière modification, vérifie ce qui se trouve dans l'historique d'annulation, et rétablis-la. »
- **Ce que fait l'IA** :
  1. Appelle `map_undo` avec `{"action": "undo"}`.
  2. Appelle `map_undo` avec `{"action": "list"}`.
  3. Appelle `map_undo` avec `{"action": "redo"}`.
- **Ce que vous devriez voir** : Le navigateur recharge l'état précédent exact de la carte, liste les étapes d'annulation et de rétablissement disponibles dans la discussion, et réapplique la modification.
- **Si cela ne fonctionne pas** : Une annulation force le navigateur à recharger la carte sauvegardée, ce qui supprime les calques d'aperçu de sélection rouge temporaires ; créez une nouvelle sélection avant de modifier à nouveau.
