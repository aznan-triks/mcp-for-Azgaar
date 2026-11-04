# Diagnostic

Commencez par `npm run doctor` : il vérifie Node, la compilation d'Azgaar, le navigateur (il en lance un et génère une carte), le port local et les dossiers, et dit quoi corriger. `map_status` rapporte ensuite les erreurs de page et toute requête externe bloquée.

## La fenêtre ne s'ouvre jamais, ou un outil reste accroché

```bash
npm run doctor
npm run build:azgaar      # les tests et le serveur lisent vendor/azgaar/dist-electron/renderer
```

- Le navigateur s'ouvre à la **première commande qui a besoin de la carte**, pas au démarrage du client d'IA (`browser.openOnStart`). Un `map_status` avec `browserOpen: false` avant tout appel de carte est normal.
- `Azgaar is not built: run npm run build:azgaar before the tests` veut dire exactement cela : `npm run check` refuse de tourner sur une compilation absente ou périmée. Sans reconstruction, les changements dans `vendor/azgaar/src` sont invisibles pour tous les tests.
- Deux clients d'IA configurés en même temps lancent deux serveurs : conflit sur le port `8765` et sur le profil du navigateur. Donnez au second `FMG_PORT` et `FMG_PROFILE_DIR`, ou fermez le premier.
- Une fenêtre Chrome tuée en cours d'exécution laisse un verrou de profil, `SingletonLock`. Le serveur retire un verrou dont le processus est mort et sinon dit quoi fermer.

## « Failed to launch browser » ou un Chromium qui meurt

```bash
FMG_TEST_CHROMIUM=/chemin/vers/chromium npm run check
FMG_TEST_ARGS=--no-sandbox npm run check
```

`browser.channel` vaut `chrome` par défaut, avec repli sur `msedge` ; sans l'un des deux installé, pointez `browser.executablePath` (ou `FMG_EXECUTABLE_PATH`) vers un Chromium. En conteneur ou en sandbox, `--no-sandbox` est nécessaire. La mémoire est l'autre cause classique : un globe 3D avec texture satellite, érosion et nuages tourne près de 3 Go, et un serveur tué sans message est un processus arrêté par le système — surveillez `free -m` pendant un run qui tourne mal. N'ajoutez pas d'options graphiques pour « réparer » WebGL : le rendu logiciel fonctionne déjà avec `--no-sandbox` seul, et `--use-gl=angle` fait expirer les captures.

## Modifications

- **« The map was restored » dans la réponse** — la mutation a cassé à mi-chemin (un éditeur natif l'a refusée). L'annulation est le fait du serveur ; lisez le message, corrigez les paramètres, recommencez.
- **Un changement invisible** — son calque est éteint : `map_layers {"show": ["relief"]}`. Relief, cultures, religions, provinces et rivières sont d'abord des données ; le dessin ne suit que si le calque est affiché.
- **`map_undo` n'a rien à annuler** — la modification n'a rien changé, et une édition vide ne crée volontairement aucune entrée d'historique.
- **Un identifiant de cellule semble faux après une édition de relief** — `scope: "all"` reconstruit la grille et renumérote ; vos identifiants de sélection antérieurs ne sont plus valides. Les éditions en place (`scope: "land"`, le défaut) ne renumérotent jamais.
- **Les sélections ont disparu** — charger ou générer une carte les retire, comme dans Azgaar. Recréez-les après le chargement.

## Vues et images

- La capture montre un coin du monde parce que la caméra était zoomée : la réponse porte un `coverageNote` ; demandez `whole_map: true` ou recentrez avec `map_camera {"scale": 1}`.
- L'échelle de caméra demandée n'est pas celle obtenue : la carte la borne pour que la fenêtre ne montre jamais au-delà de la carte. La réponse dit ce qui a été appliqué.
- Une image plus lourde que `view.maxImageBytes` revient en aperçu JPEG plus léger ; le fichier dans `exports/` reste la version complète. Un aperçu avec `inset` conserve son cartouche quand il est réduit.
- `map_export {"inset": ...}` refuse `supersample`/`filter` et `map_view {"inset": ...}` refuse cadrage, surcouches et texte : un encart est son propre rendu hors-écran, donc ces combinaisons ne sont pas proposées plutôt qu'à moitié appliquées.
- Une fenêtre de notes de version qui masque la carte : le serveur pré-remplit le stockage local de la page avec la version d'Azgaar épinglée et l'interrupteur de l'infobulle, donc elle reste fermée même dans un profil neuf. Si elle apparaît quand même, `browser.seedStorage` a été modifié ou le `known-good.json` épinglé ne correspond plus à `vendor/azgaar/package.json`.

## Réseaux

`map_status` doit lister **zéro** requête externe bloquée. Si en une apparaît, le bundle hors ligne est cassé (une police, un serveur de tuiles, un ciel étoilé) : c'est un défaut du projet, pas votre configuration. Les deux seules choses légitimement en ligne sont une police Google ajoutée par vous dans le style et un lien dans l'éditeur d'emblèmes.

## Erreurs de documentation dans la suite de tests

`npm run check` échoue avec `docs out of date: docs/TOOLS.md` après une modification de description d'outil ou de schéma de commande : la référence est générée depuis le serveur qui tourne, donc lancez `npm run docs` et commitez le résultat. Le même contrôle tourne en CI (`npm run docs:check`).
