# Référence de configuration

Version anglaise : [CONFIGURATION.md](../CONFIGURATION.md).

> **Testé sur :** Windows 10 avec Google Chrome et un client MCP stdio. macOS, Linux, Microsoft Edge seul et les autres programmes d'IA cités ici suivent les mêmes standards et l'installateur est écrit pour eux, mais ils n'ont pas encore été testés.

Ce document est la référence complète pour tous les paramètres, variables d'environnement, options de passerelle, options de script et recettes de configuration pour mcp-for-Azgaar.

## Comment modifier un réglage

Vous pouvez personnaliser le serveur de deux manières :

1. **Modifier `config/fmg-mcp.json`** :
   - Ouvrez `config/fmg-mcp.json` dans n'importe quel éditeur de texte brut (Bloc-notes, VS Code, Zed, etc.).
   - Modifiez les valeurs que vous souhaitez changer.
   - Enregistrez le fichier et redémarrez votre programme d'IA (par exemple Claude Desktop, Cline ou Cursor). Le serveur lit le fichier lors de son démarrage.
   - Conservez une copie de sauvegarde de `config/fmg-mcp.json` avant d'effectuer des modifications afin de pouvoir le restaurer si nécessaire.

2. **Définir une variable d'environnement** :
   - Vous pouvez transmettre des variables d'environnement dans le fichier de configuration de votre client d'IA (par exemple dans la section `env`).
   - Les variables d'environnement ont la priorité sur les valeurs contenues dans `config/fmg-mcp.json`.

### Ce qui se passe en cas de faute de frappe

Le serveur vérifie la configuration au démarrage à l'aide d'un validateur de schéma strict (Zod). Si vous faites une faute de frappe (comme mal orthographier une clé, définir un port en dehors de 0-65535, ou fournir du texte au lieu d'un nombre), le serveur refuse de démarrer et affiche un message d'erreur sur stderr décrivant précisément le champ invalide. Si cela se produit, corrigez la faute de frappe ou restaurez votre fichier de sauvegarde.

## Clés de configuration (`config/fmg-mcp.json`)

Le tableau ci-dessous répertorie chaque paramètre de configuration disponible dans `config/fmg-mcp.json`. Les chemins avec des points indiquent des paramètres imbriqués au sein de groupes de configuration.

| Setting | Type | Default | What it does | When to change it |
|---|---|---|---|---|
| `azgaarDist` | string | `"upstream/azgaar/dist-electron/renderer"` | Chemin vers le dossier des ressources web statiques compilées d'Azgaar contenant `index.html`. | À modifier si vous installez ou compilez Azgaar dans un dossier personnalisé. |
| `azgaarPackage` | string | `"upstream/azgaar/package.json"` | Chemin vers le fichier `package.json` d'Azgaar utilisé pour détecter la version installée. | À modifier si l'arborescence des sources d'Azgaar se trouve dans un dossier différent. |
| `mapsDir` | string | `"maps"` | Dossier où sont stockés les fichiers de carte utilisateur, les sauvegardes automatiques et les instantanés de l'historique d'annulation. | À modifier pour stocker vos cartes dans un autre répertoire ou dans un dossier cloud synchronisé. |
| `presetsFile` | string | `"layer-presets.json"` | Chemin vers le fichier où sont enregistrés les préréglages de calques personnalisés. | À modifier pour utiliser un autre fichier de préréglages de calques. |
| `layerPresets` | object | `{ ... }` | Préréglages de calques fournis associant chaque nom à une liste de calques. | Permet de personnaliser les préréglages de calques par défaut. |
| `layerPresets.topography` | array of strings | `["lakes", ...]` | Préréglage affichant les calques de relief topographique. | Jeu de calques pour la topographie. |
| `layerPresets.biomes` | array of strings | `["lakes", ...]` | Préréglage affichant les biomes écologiques. | Jeu de calques pour les biomes. |
| `layerPresets.political` | array of strings | `["lakes", ...]` | Préréglage affichant les frontières politiques, États et provinces. | Jeu de calques pour la politique. |
| `layerPresets.lore-clean` | array of strings | `["lakes", ...]` | Préréglage affichant les terres, biomes et étiquettes épurés sans marqueurs de jeu. | Jeu de calques pour la cartographie propre. |
| `exportsDir` | string | `"exports"` | Dossier où sont écrites les images, les fichiers de données et les fichiers `.map` exportés. | À modifier pour diriger les fichiers exportés vers un autre dossier. |
| `profileDir` | string | `".browser-profile"` | Dossier contenant les données utilisateur du navigateur et le stockage local entre les lancements. | À modifier si vous souhaitez un profil de navigateur distinct ou s'il doit être stocké sur un disque spécifique. |
| `startup` | string (`"autosave"` ou `"new"`) | `"autosave"` | Action effectuée à l'ouverture du navigateur : `"autosave"` restaure la carte de la dernière session ; `"new"` crée une nouvelle carte aléatoire. | Réglez sur `"new"` si vous préférez commencer avec un nouveau monde procédural à chaque lancement. |
| `allowEval` | boolean | `false` | Active l'outil `map_eval`, qui permet à l'IA d'exécuter du JavaScript arbitraire dans la page de la carte. | Réglez sur `true` uniquement pour le débogage avancé ou des automatisations personnalisées nécessitant d'interagir directement avec le script de la page. |
| `server` | object | `{ host: "127.0.0.1", port: 8765 }` | Paramètres groupés pour le serveur web HTTP statique local. | À modifier lorsque vous devez configurer la liaison réseau locale ou l'attribution des ports. |
| `server.host` | string | `"127.0.0.1"` | Adresse IP sur laquelle le serveur statique local écoute (boucle locale uniquement). | Conservez `"127.0.0.1"` pour des raisons de sécurité ; ne changez que si votre environnement exige une adresse de boucle locale spécifique. |
| `server.port` | integer (0 à 65535) | `8765` | Port TCP utilisé par le serveur web statique local. | À modifier si le port 8765 est déjà utilisé par une autre application sur votre système. |
| `browser` | object | `{ ... }` | Paramètres groupés pour le lancement du navigateur et la gestion de la fenêtre. | À modifier pour personnaliser les exécutables du navigateur, les options de la fenêtre ou les canaux du navigateur. |
| `browser.channel` | string ou null | `"chrome"` | Canal principal de distribution du navigateur utilisé par Playwright (`"chrome"` ou `"msedge"`). Définissez sur `null` si vous spécifiez `browser.executablePath`. | Passez à `"msedge"` si Google Chrome n'est pas installé sur votre ordinateur, ou `null` si vous utilisez un binaire personnalisé. |
| `browser.executablePath` | string ou null | `null` | Chemin absolu vers l'exécutable d'un navigateur spécifique. | Renseignez ce champ si votre navigateur est installé dans un emplacement non standard ou si vous utilisez Chromium. |
| `browser.headless` | boolean | `false` | Exécute le navigateur sans fenêtre visible lorsque défini sur `true`. | Passez à `true` pour l'exécuter discrètement en arrière-plan sur un serveur ou lorsque le retour visuel n'est pas nécessaire. |
| `browser.viewport` | object | `{ width: 1920, height: 1080 }` | Dimensions de la zone d'affichage (viewport) en pixels d'écran pour la fenêtre du navigateur. | À modifier pour personnaliser la taille de la zone d'affichage du navigateur. |
| `browser.viewport.width` | integer (min 320) | `1920` | Largeur de la zone d'affichage du navigateur en pixels. | À modifier si vous souhaitez un affichage de carte plus large ou des captures d'écran de plus haute résolution. |
| `browser.viewport.height` | integer (min 240) | `1080` | Hauteur de la zone d'affichage du navigateur en pixels. | À modifier si vous souhaitez un affichage de carte plus haut ou des captures d'écran de plus haute résolution. |
| `browser.readyTimeoutMs` | integer (min 1000) | `120000` | Délai maximal en millisecondes d'attente pour qu'Azgaar et la passerelle finissent de charger. | Augmentez cette valeur sur les ordinateurs plus lents si le démarrage expire pendant la génération initiale de la carte. |
| `browser.args` | array of strings | `[]` | Arguments de ligne de commande supplémentaires transmis directement au processus du navigateur. | Ajoutez des drapeaux si votre environnement nécessite des arguments Chromium spécifiques (par exemple `--no-sandbox` dans les conteneurs). |
| `browser.fallbackChannels` | array of strings | `["msedge"]` | Canaux de secours pour le navigateur à tenter si le `browser.channel` principal n'est pas installé. | À modifier pour ajouter ou réordonner les navigateurs de secours. |
| `browser.seedStorage` | object (chaînes clé-valeur) | `{"fmg-disable-click-arrow-tooltip": "true"}` | Paires clé-valeur insérées dans le `localStorage` du navigateur avant le chargement de la page. | Utilisez ce réglage pour masquer les fenêtres modales de bienvenue, les popups de mise à jour ou préconfigurer les réglages d'Azgaar dans le stockage. |
| `browser.openOnStart` | boolean | `false` | Lorsque défini sur `false`, la fenêtre du navigateur ne s'ouvre qu'au premier appel d'un outil de carte plutôt qu'au démarrage du serveur. | Passez à `true` pour ouvrir la fenêtre dès le lancement du serveur. |
| `map` | object | `{ seed: null, width: 1920, height: 1080 }` | Dimensions et graine par défaut pour les nouvelles cartes procédurales. | À modifier pour définir des dimensions standard ou une graine fixe pour les cartes fraîchement générées. |
| `map.seed` | string ou null | `null` | Chaîne de graine utilisée lors de la génération d'une nouvelle carte. Si `null`, une graine aléatoire est sélectionnée. | Définissez un texte fixe (par exemple `"abc"` ; un simple nombre est refusé) pour générer des mondes reproductibles. |
| `map.width` | integer (min 100) | `1920` | Largeur de carte par défaut dans les unités de coordonnées internes de la carte. | À modifier si vous souhaitez que les nouvelles cartes générées aient une largeur par défaut différente. |
| `map.height` | integer (min 100) | `1080` | Hauteur de carte par défaut dans les unités de coordonnées internes de la carte. | À modifier si vous souhaitez que les nouvelles cartes générées aient une hauteur par défaut différente. |
| `history` | object | `{ maxEntries: 30 }` | Paramètres groupés pour l'historique d'annulation et de rétablissement. | À modifier pour ajuster le nombre d'états d'annulation conservés. |
| `history.maxEntries` | integer (min 1) | `30` | Nombre maximal d'états d'annulation conservés sur le disque dans `maps/history`. | Augmentez pour un historique d'annulation plus profond, ou diminuez pour économiser de l'espace disque. |
| `autosave` | object | `{ intervalSec: 60 }` | Paramètres groupés pour les sauvegardes périodiques de la carte. | À modifier pour ajuster la fréquence des sauvegardes en arrière-plan. |
| `autosave.intervalSec` | number (min 0) | `60` | Intervalle en secondes entre les sauvegardes automatiques périodiques de `autosave.map`. Définissez à `0` pour désactiver les sauvegardes périodiques. | Augmentez pour réduire les écritures sur disque, ou réglez sur `0` pour désactiver les sauvegardes périodiques en arrière-plan (les modifications restent enregistrées). |
| `view` | object | `{ ... }` | Paramètres groupés pour la capture d'écran et la visualisation de la carte. | À modifier pour ajuster le format visuel, la qualité ou le rendu en mode texte. |
| `view.format` | string (`"png"` ou `"jpeg"`) | `"png"` | Format d'image utilisé lors de la prise de captures d'écran pour l'IA. | Passez à `"jpeg"` si les captures d'écran PNG consomment trop de bande passante ou de contexte de jetons. |
| `view.jpegQuality` | integer (1 à 100) | `85` | Qualité de compression utilisée lors de la génération de captures d'écran JPEG. | Diminuez pour réduire la taille de l'image, ou augmentez pour obtenir des détails plus nets. |
| `view.settleMs` | integer (min 0) | `200` | Délai d'attente en millisecondes pour laisser le DOM du navigateur se stabiliser après des modifications avant de prendre une capture d'écran. | Augmentez si les captures d'écran se produisent avant la fin des animations de la carte ou du réaffichage. |
| `view.maxImageBytes` | integer (min 10000) | `900000` | Taille maximale de capture d'écran en octets avant que le format PNG ne bascule automatiquement en compression JPEG. | À ajuster si votre client d'IA rejette les images dépassant une taille de données spécifique. |
| `view.textOnly` | boolean | `false` | Lorsque défini sur `true`, renvoie les cartes sous forme de grilles de caractères (art ASCII) au lieu d'images. | À activer lors de l'utilisation de modèles d'IA qui n'acceptent pas les images en entrée. |
| `export` | object | `{ ... }` | Configuration par défaut pour les exports d'images de cartes (`map_export`). | Définissez le format d'image, la qualité et le mode épuré pour les exports. |
| `export.format` | string (`"png"` ou `"jpeg"`) | `"png"` | Format d'image par défaut pour `map_export`. | Réglez sur `"jpeg"` pour des fichiers exportés plus légers. |
| `export.jpegQuality` | integer (1 à 100) | `92` | Qualité de compression par défaut utilisée pour les exports JPEG. | Ajustez l'équilibre entre poids du fichier et netteté de l'image. |
| `export.maxPixels` | integer (min 100) | `10000` | Dimension maximale en pixels (largeur ou hauteur) autorisée lors de l'export d'images haute résolution. | Augmentez si votre machine supporte de plus grandes dimensions de rendu. |
| `export.clean` | boolean | `false` | Lorsque défini sur `true`, masque automatiquement les pictogrammes de jeu (ancres de port, routes, marqueurs, glace) lors des exports. | Activez par défaut pour toujours exporter des cartes géographiques épurées. |
| `export.cleanHide` | array of strings | `["#anchors", ...]` | Sélecteurs CSS masqués lorsque le mode épuré est actif. | Ajoutez des sélecteurs pour masquer des éléments visuels supplémentaires. |
| `view3d` | object | `{ ... }` | Configuration et préréglages par défaut pour les rendus 3D (`map_3d`). | Ajustez la qualité 3D, les formats, les décalages de caméra et les préréglages. |
| `view3d.format` | string (`"png"`, `"jpeg"`, ou `"webp"`) | `"png"` | Format d'image par défaut pour les captures 3D. | Choisissez `"jpeg"` ou `"webp"` pour des fichiers plus légers. |
| `view3d.quality` | integer (1 à 100) | `92` | Qualité de compression pour les captures 3D en JPEG ou WebP. | Ajustez la netteté versus la taille du fichier. |
| `view3d.hemisphereOffset` | number | `0.25` | Décalage en longitude appliqué lors du rendu des deux hémisphères sur un globe. | Ajuste la séparation visuelle pour les scènes de globe en deux hémisphères. |
| `view3d.presets` | object | `{ ... }` | Préréglages intégrés pour les vues 3D. | Personnalisez les configurations utilisées par `map_3d`. |
| `view3d.presets.satellite` | object | `{ ... }` | Préréglage de scène de relief satellite procédurale. | Scène de relief avec texture satellite procédurale. |
| `view3d.presets.satellite.satellite` | boolean | `true` | Active les textures satellites procédurales sur le relief. | Active la coloration de surface satellite. |
| `view3d.presets.satellite.erosion` | boolean | `false` | Active l'érosion hydraulique du relief sur le maillage 3D. | Active les détails de terrain érodé. |
| `view3d.presets.heightmap` | object | `{ ... }` | Préréglage de scène de relief avec texture de carte des hauteurs. | Scène de relief texturée avec le préréglage topographique. |
| `view3d.presets.heightmap.layerPreset` | string | `"topography"` | Préréglage de calques utilisé comme texture de terrain. | Modifie la combinaison de calques servant de texture. |
| `view3d.presets.biomes` | object | `{ ... }` | Préréglage de scène de relief avec texture des biomes. | Scène de relief texturée avec le préréglage des biomes. |
| `view3d.presets.biomes.layerPreset` | string | `"biomes"` | Préréglage de calques utilisé comme texture de terrain. | Modifie la combinaison de calques servant de texture. |
| `bridge` | object | `{}` | Remplacements clé-valeur appliqués à la passerelle intégrée à la page (`AgentConfig`). | Permet de personnaliser les styles visuels, les délais et les limites de la passerelle sans modifier les fichiers sources. |
| `limits` | object | `{ ... }` | Limites de fonctionnement et seuils de sécurité pour les outils. | À modifier pour ajuster la pagination des outils, les plages de zoom ou les plafonds de délai d'attente. |
| `limits.listMax` | integer | `1000` | Plafond strict sur le nombre d'éléments renvoyés par les outils de liste d'entités (`map_list`). | À modifier si vous devez récupérer de plus grands lots d'entités en un seul appel d'outil. |
| `limits.zoomMin` | number | `0.5` | Facteur d'échelle de zoom minimal autorisé dans `map_camera`. | Diminuez si vous avez besoin de dézoomer davantage que le minimum par défaut. |
| `limits.zoomMax` | number | `80` | Facteur d'échelle de zoom maximal autorisé dans `map_camera`. | Augmentez si vous avez besoin d'un zoom plus rapproché pour des micro-régions. |
| `limits.cameraMsMax` | integer | `5000` | Temps d'animation de transition de caméra maximal en millisecondes dans `map_camera`. | À ajuster si vous souhaitez autoriser des déplacements panoramiques animés plus longs sur la carte. |
| `limits.scaleTolerance` | nombre | `0.01` | Écart toléré entre le zoom demandé dans `map_camera` et le zoom réellement appliqué par la carte avant qu'un avertissement soit renvoyé. | À augmenter si vous recevez des avertissements pour de simples écarts d'arrondi. |
| `limits.mapSizeMin` | integer | `100` | Largeur ou hauteur minimale autorisée en unités de carte lors de la création d'une nouvelle carte avec `map_file`. | À ajuster pour appliquer des limites inférieures personnalisées sur la taille des nouvelles cartes. |
| `limits.mapSizeMax` | integer | `8000` | Largeur ou hauteur maximale autorisée en unités de carte lors de la création d'une nouvelle carte avec `map_file`. | À ajuster pour appliquer des limites supérieures personnalisées sur la taille des nouvelles cartes. |
| `limits.exportTimeoutMs` | integer (min 1000) | `120000` | Délai maximal en millisecondes à attendre pour une opération d'exportation de fichier ou de sélecteur de fichier. | Augmentez si l'exportation de fichiers SVG vectoriels volumineux ou de tuiles zip prend plus de deux minutes. |

## Variables d'environnement

Les variables d'environnement permettent de surcharger les paramètres sans modifier `config/fmg-mcp.json`. Elles sont particulièrement utiles dans les configurations multi-clients ou les environnements conteneurisés.

| Variable | Surcharge / Affecte | Description |
|---|---|---|
| `FMG_CONFIG` | Chemin du fichier de configuration | Spécifie un chemin alternatif vers le fichier de configuration (par défaut `config/fmg-mcp.json`). |
| `FMG_HEADLESS` | `browser.headless` | Surcharge le mode sans tête (headless) du navigateur. Accepte `1`, `true` ou `yes` pour masquer la fenêtre ; `0`, `false` ou `no` pour l'afficher. |
| `FMG_EXECUTABLE_PATH` | `browser.executablePath` | Surcharge le chemin vers l'exécutable binaire du navigateur. |
| `FMG_PORT` | `server.port` | Surcharge le port sur lequel le serveur web statique local écoute. |
| `FMG_MAPS_DIR` | `mapsDir` | Surcharge le chemin du dossier où les fichiers de carte et sauvegardes automatiques sont stockés. |
| `FMG_PROFILE_DIR` | `profileDir` | Surcharge le chemin du dossier où le profil utilisateur du navigateur est stocké. |
| `FMG_TEXT_ONLY` | `view.textOnly` | Lorsque défini sur `1`, `true` ou `yes`, force le serveur à renvoyer des cartes basées sur des caractères au lieu de captures d'écran. |
| `FMG_ALLOW_EVAL` | `allowEval` | Lorsque défini sur `1`, `true` ou `yes`, enregistre l'outil `map_eval`. |
| `FMG_TEST_CHROMIUM` | Binaire du navigateur de test | Utilisé par les scripts de test et diagnostics pour forcer un chemin d'exécutable Chromium spécifique. |
| `FMG_TEST_ARGS` | Arguments du navigateur de test | Arguments de ligne de commande séparés par des virgules passés au navigateur pendant les tests. |
| `FMG_TEST_CHANNEL` | Canal du navigateur de test | Spécifie le canal du navigateur (`chrome`, `msedge`) utilisé pendant les tests (par défaut `chrome`). |
| `FMG_TEST_HEADED` | Visibilité du navigateur de test | Lorsque défini sur `1`, exécute les tests de navigateur avec une fenêtre visible au lieu du mode sans tête. |
| `npm_execpath` | Chemin de l'exécutable npm | Variable d'environnement fournie par Node.js identifiant le chemin actif de `npm-cli.js` utilisé lors des scripts d'installation et de mise à jour. |
| `SystemRoot` | Dossier système Windows | Dossier système Windows (par exemple `C:\Windows`), utilisé pour localiser l'utilitaire d'archive natif `System32\tar.exe`. |
| `APPDATA` | Dossier de données d'application | Dossier Roaming Application Data de Windows, utilisé par `scripts/register.mjs` pour localiser les fichiers de configuration des clients. |
| `XDG_CONFIG_HOME` | Dossier de configuration Linux | Dossier de base de configuration utilisateur sous Linux (par défaut `~/.config`), utilisé par `scripts/register.mjs` pour trouver les réglages des clients. |
| `HOME` | Répertoire personnel de l'utilisateur | Chemin du répertoire personnel de l'utilisateur (également résolu via `os.homedir()` de Node), utilisé par `scripts/register.mjs` pour localiser les dossiers de configuration sous macOS et Linux. |

## Paramètres de la passerelle (`overlay/agent/config.ts`)

La passerelle s'exécute à l'intérieur de la page web et gère les requêtes sur la carte, les sélections et les commandes de modification. Vous pouvez surcharger n'importe quel paramètre de la passerelle en ajoutant son nom et la valeur souhaitée dans l'objet `"bridge"` de `config/fmg-mcp.json`.

| Setting | Type | Default | Meaning |
|---|---|---|---|
| `gridDivisions` | number | `8` | Nombre de lignes du quadrillage de coordonnées tracées sur le côté le plus long de la zone visible. |
| `maxCellLabels` | number | `500` | Nombre maximal de cellules visibles au-delà duquel les identifiants individuels des cellules sont omis des annotations de vue. |
| `maxSelectionCells` | number | `40000` | Limite de sécurité sur le nombre de cellules pouvant être sélectionnées en une seule opération. |
| `maxSelections` | number | `20` | Nombre maximal de sélections actives mémorisées avant que les plus anciennes ne soient supprimées. |
| `selectionFill` | string | `"rgba(255, 40, 40, 0.38)"` | Couleur CSS utilisée pour remplir les cellules sélectionnées dans le calque de prévisualisation visuelle. |
| `selectionStroke` | string | `"rgba(200, 0, 0, 0.9)"` | Couleur CSS utilisée pour le contour de délimitation des cellules sélectionnées. |
| `gridStroke` | string | `"rgba(0, 0, 0, 0.45)"` | Couleur CSS utilisée pour les lignes de coordonnées dans les vues annotées. |
| `labelColor` | string | `"#111111"` | Couleur de texte CSS utilisée pour les étiquettes de coordonnées et d'entités. |
| `labelHalo` | string | `"#ffffff"` | Couleur de halo CSS autour des étiquettes pour garantir la lisibilité sur différents arrière-plans. |
| `labelFont` | string | `"monospace"` | Famille de polices CSS utilisée pour les étiquettes du quadrillage de coordonnées. |
| `badgeFill` | string | `"#ffffffcc"` | Couleur de fond CSS pour les badges d'identifiants d'États. |
| `badgeStroke` | string | `"#000000"` | Couleur de bordure CSS pour les badges d'identifiants d'États. |
| `overlayZIndex` | number | `50` | z-index CSS appliqué au calque d'annotations SVG et de sélection de la passerelle. |
| `labelPx` | number | `12` | Taille de police en pixels d'écran pour les étiquettes d'annotation, quel que soit le niveau de zoom actuel. |
| `settleMs` | number | `600` | Délai d'attente en millisecondes après l'importation d'un fichier de carte avant d'interroger l'état du monde. |
| `importTimeoutMs` | number | `60000` | Temps maximal en millisecondes alloué pour qu'un fichier de carte importé soit chargé en mémoire. |
| `listLimit` | number | `50` | Nombre d'éléments renvoyés par défaut par les méthodes de liste d'entités de la passerelle. |
| `regionMargin` | number | `0.08` | Marge de sécurité conservée autour d'une région ciblée dans `showRegion`, exprimée en fraction de la taille de la région. |
| `defaultRiverFlux` | number | `30` | Débit d'eau par défaut attribué aux cellules de fleuve dessinées à la main dépourvues de drainage naturel suffisant (contrôle la largeur du fleuve). |
| `textMapCols` | number | `100` | Largeur par défaut (colonnes) pour les cartes en mode texte de caractères générées pour les modèles d'IA non visuels. |
| `textMapRows` | number | `40` | Hauteur par défaut (lignes) pour les cartes en mode texte de caractères générées pour les modèles d'IA non visuels. |
| `textMapMax` | number | `200` | Dimension maximale autorisée (colonnes ou lignes) pour les cartes en mode texte de caractères. |
| `uiOptionsMax` | number | `40` | Nombre maximal d'options sélectionnables renvoyées par champ de saisie lors de l'inspection des contrôles de boîte de dialogue. |
| `uiTextMax` | number | `1500` | Nombre maximal de caractères de texte renvoyés lors de l'inspection de fenêtres de dialogue ouvertes. |
| `menuListMax` | number | `200` | Nombre maximal d'actions renvoyées par défaut lors de l'interrogation du menu d'actions d'Azgaar avec `map_menu list`. |
| `legendMarginPct` | number | `0.02` | Marge extérieure autour des boîtes de légende en pourcentage de la dimension de la carte. |
| `legendHeightSteps` | number | `10` | Nombre de bandes de courbes de niveau affichées dans la légende de relief. |
| `legendLongItems` | number | `60` | Seuil d'éléments de légende au-delà duquel un avertissement conseille de filtrer par État ou d'ajouter des colonnes. |
| `legendSeaSteps` | number | `3` | Nombre de paliers de profondeur océanique affichés dans la légende d'altitude. |
| `legendRainSamples` | number | `64` | Nombre d'échantillons utilisés pour calculer les paliers de couleur de la légende des précipitations. |
| `legendPopulationBarPx` | number | `140` | Largeur en pixels de la barre visuelle de répartition dans les légendes de population. |
| `legendMarketColor` | string | `"#664422"` | Nuance de couleur principale utilisée pour les éléments de la légende des marchés. |
| `legendTradeLandColor` | string | `"#aa6622"` | Nuance de couleur pour les routes commerciales terrestres dans la légende du commerce. |
| `legendTradeWaterColor` | string | `"#2266aa"` | Nuance de couleur pour les routes commerciales maritimes dans la légende du commerce. |
| `annotationHaloColor` | string | `"#ffffff"` | Couleur du contour de halo protecteur dessiné autour du texte d'annotation. |
| `annotationColor` | string | `"#cc3333"` | Couleur de tracé par défaut pour les flèches, lignes, marqueurs et zones d'annotations. |
| `annotationMarkerRadius` | number | `4` | Rayon en pixels d'écran des marqueurs d'annotation. |
| `annotationFontSize` | number | `13` | Taille de police par défaut en pixels pour les textes d'annotation. |
| `annotationStrokeWidth` | number | `2` | Épaisseur de trait en pixels pour les lignes, flèches et contours d'annotations. |
| `annotationAreaOpacity` | number | `0.25` | Opacité du fond pour les polygones de zones annotées. |
| `annotationTextMax` | number | `80` | Longueur maximale de caractères acceptée pour une étiquette de texte d'annotation. |
| `temperatureMin` | number | `-30` | Température minimale de référence en degrés Celsius pour la légende de température. |
| `temperatureMax` | number | `40` | Température maximale de référence en degrés Celsius pour la légende de température. |
| `view3dPollMs` | number | `80` | Intervalle de scrutation en millisecondes lors de l'attente de stabilisation de la scène 3D. |
| `view3dStableReads` | number | `3` | Nombre de lectures stables consécutives requises avant de considérer la vue 3D prête. |
| `view3dTimeoutMs` | number | `8000` | Temps maximal en millisecondes d'attente de stabilisation d'une scène 3D avant capture. |
| `view3dStableDiff` | number | `0.5` | Variance maximale de pixels autorisée entre deux trames consécutives pour juger le rendu 3D stabilisé. |
| `view3dSampleSize` | number | `64` | Dimension de la sonde d'échantillonnage en pixels pour détecter les mouvements sur le canevas 3D. |
| `view3dTextureMax` | number | `4096` | Plafond de résolution de texture pour le rendu de terrain en 3D. |
| `view3dDefaultDistance` | object | `{ relief: 1000, globe: 1800 }` | Distance de caméra par défaut en unités de scène pour les vues relief et globe. |

## Options de ligne de commande des scripts

Le projet inclut plusieurs scripts d'assistance en ligne de commande dans le dossier `scripts/`, exécutables via `npm run <name>`.

### `npm run setup` (`scripts/setup.mjs`)

Télécharge la version testée d'Azgaar, lui applique les correctifs avec la passerelle d'IA, la compile, l'enregistre auprès de Claude Desktop s'il est présent, et lance un auto-test.

| Option | Meaning |
|---|---|
| `--force` | Télécharge à nouveau, réapplique les correctifs et recompile Azgaar même si une installation est déjà détectée. |
| `--no-register` | Ignore l'enregistrement automatique auprès de Claude Desktop. |
| `--no-doctor` | Ignore l'exécution de l'auto-test de diagnostic après l'installation. |

### `npm run update` (`scripts/update.mjs`)

Met à jour la version locale d'Azgaar vers une version plus récente. Il télécharge, applique les correctifs, compile et vérifie la nouvelle version avant de remplacer la copie de travail. Si les vérifications échouent, votre installation actuelle est conservée.

| Option | Meaning |
|---|---|
| _(aucune option)_ | Met à jour vers la dernière version officielle d'Azgaar depuis GitHub. |
| `--edge` | Télécharge et compile la version de développement la plus récente (branche `master`). |
| `--ref <ref>` | Met à jour vers un commit git, une branche ou une balise (tag) spécifique (par exemple `--ref v1.99.00`). |
| `--known-good` | Rétablit Azgaar à la version de référence testée avec ce projet. |

### `npm run register` (`scripts/register.mjs`)

Génère ou écrit les blocs de configuration pour connecter le serveur MCP à vos programmes d'IA.

| Option | Meaning |
|---|---|
| _(aucune option)_ | Affiche les extraits de configuration pour tous les clients d'IA pris en charge sans modifier aucun fichier. |
| `--client <name>` | Sélectionne un client spécifique (`desktop`, `cline`, `cursor`, `gemini`, `lmstudio`, `zed`). |
| `--write` | Écrit la configuration directement dans le fichier de réglages du client sélectionné (crée d'abord une sauvegarde). |
| `--desktop` | Raccourci pratique équivalent à `--client desktop --write`. |
| `--remove` | Supprime l'entrée du serveur dans le fichier de réglages du client sélectionné. |
| `--text-only` | Configure l'entrée pour s'exécuter avec `FMG_TEXT_ONLY=1` (pour les modèles d'IA incapables de lire des images). |
| `--name <name>` | Définit un nom personnalisé pour l'entrée du serveur MCP (`azgaar` par défaut). |
| `--config <file>` | Cible un chemin de fichier de configuration personnalisé au lieu de l'emplacement par défaut du client. |
| `--list` | Liste tous les identifiants de clients acceptés par `--client`. |

### `npm run doctor` (`scripts/doctor.mjs`)

Exécute des diagnostics système : vérifie la version de Node, contrôle la validité de la configuration, vérifie les ressources compilées, teste les autorisations d'écriture dans les dossiers, vérifie la disponibilité du port, lance une session de navigateur masquée et vérifie l'enregistrement auprès de Claude Desktop.

| Option | Meaning |
|---|---|
| `--headed` | Lance le navigateur de test dans une fenêtre visible au lieu du mode sans tête par défaut. |

### `npm run compat` (`scripts/compat.mjs`)

Exécute une suite de compatibilité sur une version compilée d'Azgaar pour vérifier que les exports de la passerelle, les modifications d'état, les calques de sélection, les mécanismes d'annulation et les captures d'écran fonctionnent correctement.

| Option | Meaning |
|---|---|
| `[azgaar folder]` | Chemin positionnel facultatif vers le dossier de compilation d'Azgaar à tester (`upstream/azgaar` par défaut). |

### `npm run check` (`scripts/check.mjs`)

La commande de vérification du projet. Vérifie les types TypeScript pour le serveur et la passerelle, lance les vérifications du linter Biome, recherche d'éventuelles violations de couches d'architecture, vérifie qu'aucune valeur n'est codée en dur dans la logique, exécute toutes les suites de tests automatisés et contrôle la fraîcheur de la documentation.

| Option | Meaning |
|---|---|
| _(aucune option)_ | Exécute le processus complet de vérification et quitte avec le code 0 en cas de succès, ou 1 en cas d'échec. |

### `npm run docs` (`scripts/gen-docs.mjs`)

Génère `docs/TOOLS.md` et `docs/COMMANDS.md` directement à partir des schémas du serveur et de la passerelle en cours d'exécution.

| Option | Meaning |
|---|---|
| _(aucune option)_ | Se connecte à une instance de serveur local temporaire et écrit les pages de documentation mises à jour. |
| `--check` | Vérification sans modification (dry-run) : vérifie si les fichiers sur le disque correspondent aux schémas actuels du serveur sans écrire de modifications (utilisé par `npm run check`). |

### `npm run start` (`scripts/start.mjs`)

Démarre le serveur MCP. Peut être invoqué directement avec `node scripts/start.mjs` ou `npm run start`. Il valide la version de l'environnement d'exécution Node.js, vérifie qu'Azgaar est compilé, et lance le serveur communiquant sur stdio.

| Option | Meaning |
|---|---|
| _(aucune option)_ | Démarre le processus du serveur. |

## Recettes

Voici des exemples de configuration prêts à être copiés-collés pour les besoins courants.

> **Important :** les extraits ci-dessous montrent uniquement la partie à modifier. **Fusionnez-les dans votre fichier `config/fmg-mcp.json` existant** (conservez toutes les autres clés) ; ne remplacez pas tout le fichier par un extrait, sinon le serveur refusera de démarrer car des paramètres obligatoires manqueront.
>
> Remarque : `FMG_AGENT` que vous pouvez voir dans le code n'est pas une variable d'environnement : c'est le nom de l'objet de passerelle dans la page de la carte (`window.FMG_AGENT`).

### 1. Masquer la fenêtre du navigateur (mode sans tête / headless)

Si vous souhaitez que le serveur s'exécute en arrière-plan sans ouvrir de fenêtre de navigateur visible :

Dans `config/fmg-mcp.json` :
```json
{
  "browser": {
    "headless": true
  }
}
```

Ou définissez la variable d'environnement dans les réglages de votre client d'IA :
```json
"env": {
  "FMG_HEADLESS": "1"
}
```

### 2. Changer le port du serveur local

Si le port 8765 est déjà utilisé par une autre application :

Dans `config/fmg-mcp.json` :
```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 9000
  }
}
```

Ou définissez la variable d'environnement :
```json
"env": {
  "FMG_PORT": "9000"
}
```

### 3. Utiliser Microsoft Edge exclusivement

Si Google Chrome n'est pas installé sur votre ordinateur et que vous souhaitez utiliser exclusivement Microsoft Edge :

Dans `config/fmg-mcp.json` :
```json
{
  "browser": {
    "channel": "msedge",
    "fallbackChannels": []
  }
}
```

### 4. Agrandir la fenêtre

Pour effectuer des captures d'écran de plus haute résolution et disposer d'un espace de travail plus grand :

Dans `config/fmg-mcp.json` :
```json
{
  "browser": {
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  },
  "map": {
    "width": 1920,
    "height": 1080
  }
}
```

### 5. Désactiver la sauvegarde automatique

Pour arrêter les écritures périodiques en arrière-plan dans `maps/autosave.map` (remarque : les cartes restent enregistrées immédiatement après les commandes d'édition explicites) :

Dans `config/fmg-mcp.json` :
```json
{
  "autosave": {
    "intervalSec": 0
  }
}
```

### 6. Autoriser `map_eval` et quel est le risque

Pour activer l'outil `map_eval` afin d'exécuter des scripts arbitraires dans la page :

Dans `config/fmg-mcp.json` :
```json
{
  "allowEval": true
}
```

Ou définissez la variable d'environnement :
```json
"env": {
  "FMG_ALLOW_EVAL": "1"
}
```

**Risque de sécurité** : `map_eval` accorde à l'IA l'exécution directe de code JavaScript arbitraire à l'intérieur de la page web de la carte. L'IA peut inspecter, modifier ou supprimer des objets internes, écraser des fonctions globales, contourner les contrôles de sécurité intégrés à la passerelle ou faire planter l'onglet du navigateur. Le serveur prend un instantané d'annulation avant d'exécuter `map_eval`, mais des effets de bord complexes dans la page peuvent ne pas être totalement réversibles. Laissez cette option désactivée sauf si vous développez des fonctionnalités personnalisées pour la passerelle.
