[Read in English](README.md)

# mcp-for-Azgaar

mcp-for-Azgaar connecte votre assistant IA (Claude, Cline, Codex, Hermes, ou tout programme compatible MCP, avec tout modèle capable d'utiliser des outils) au générateur de cartes [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator). C'est un serveur MCP : voyez MCP comme une prise qui permet à Claude d'utiliser d'autres logiciels. La carte s'affiche en direct dans une vraie fenêtre de navigateur (Google Chrome ou Microsoft Edge) sur votre ordinateur. Vous voyez Claude analyser la géographie, examiner les royaumes et tracer les frontières en temps réel, tout en pouvant continuer à modifier la carte à la main quand vous le souhaitez. Tout fonctionne à 100 % en local et hors ligne une fois installé : aucun compte, aucune clé d'API, et aucune donnée n'est envoyée sur Internet.

Exemples de demandes possibles à Claude :
- « Montre-moi la carte »
- « Agrandis l'empire mouan vers l'ouest »
- « Fonde un nouveau royaume autour de cette ville »
- « Élève une chaîne de montagnes ici »
- « Annule ça »

## Ce dont vous avez besoin

- Windows 10/11, macOS ou Linux.
- Google Chrome ou Microsoft Edge.
- Un programme d'IA compatible MCP : Claude Desktop (application gratuite sur [claude.ai/download](https://claude.ai/download)) est le plus simple, mais Claude Code, Cline, Codex, Hermes Agent, Cursor, LM Studio et d'autres fonctionnent aussi (voir « Autres programmes d'IA » plus bas).
- Une connexion Internet pour l'installation uniquement.

## Installation

### Windows (en 3 étapes)

1. **Télécharger le projet** : Cliquez sur le bouton vert **Code** sur la [page GitHub](https://github.com/aznan-triks/mcp-for-Azgaar) et choisissez **Download ZIP**. Décompressez l'archive où vous voulez, par exemple dans votre dossier `Documents` (ou utilisez `git clone https://github.com/aznan-triks/mcp-for-Azgaar.git`).
   - *Ce que vous devez voir* : Un dossier `mcp-for-Azgaar` contenant des fichiers dont `install.bat`.
2. **Lancer l'installateur** : Double-cliquez sur `install.bat`. Si Node.js n'est pas présent sur votre PC, le script l'installe automatiquement avec l'outil winget de Windows et vous invite à double-cliquer de nouveau sur `install.bat`. La préparation prend quelques minutes pour télécharger Azgaar et configurer les fichiers. Si Windows affiche un écran bleu « Windows a protégé votre ordinateur », cliquez sur **Informations complémentaires** puis **Exécuter quand même** (le fichier vient simplement d'internet).
   - *Ce que vous devez voir* : Une fenêtre noire affichant les étapes, qui se termine par un auto-test indiquant « All good ».
3. **Redémarrer Claude Desktop** : Fermez complètement Claude Desktop (faites un clic droit sur l'icône de Claude dans la zone de notification de Windows près de l'horloge et choisissez Quitter), puis rouvrez Claude Desktop. Ouvrez une conversation et écrivez : `Montre-moi la carte`.
   - *Ce que vous devez voir* : Une fenêtre de navigateur s'ouvre avec votre carte, et Claude vous décrit ce qu'il voit.

### macOS et Linux

1. Ouvrez un terminal dans le dossier du projet.
2. Lancez `./install.sh`.
   - *Ce que vous devez voir* : L'installateur télécharge les éléments nécessaires et affiche « All good ».
3. Redémarrez complètement Claude Desktop (ou lancez Claude Code) et demandez : `Montre-moi la carte`.

## Utilisation

- **Fenêtre automatique** : La fenêtre du navigateur s'ouvre toute seule la première fois que Claude en a besoin. Laissez cette fenêtre ouverte pendant votre échange avec Claude.
- **Collaboration directe** : Vous pouvez regarder Claude travailler en direct et intervenir vous-même à la souris sur la carte à tout instant.
- **Sauvegarde automatique** : Les cartes sont enregistrées automatiquement chaque minute dans le dossier `maps` (`autosave.map`) et rechargées au lancement suivant.
- **Annulation** : Chaque modification effectuée par Claude peut être annulée. Si le résultat ne vous convient pas, dites simplement « Annule ça » (Claude utilise `map_undo`).

## Garder Azgaar à jour

Mettez à jour le générateur d'un simple clic :
- Double-cliquez sur `update.bat` (ou lancez `npm run update` dans un terminal). Le script télécharge la dernière version officielle d'Azgaar, la teste avec la passerelle, et ne bascule que si tous les tests réussissent. En cas d'échec, il conserve votre version fonctionnelle actuelle et en explique la raison.
- Pour essayer la version de développement la plus récente : `npm run update -- --edge`
- Pour revenir à la version testée et validée : `npm run update -- --known-good`

## Autres programmes d'IA (pas seulement Claude)

C'est un serveur MCP standard : il fonctionne avec tout programme d'IA compatible MCP (Claude Code, Cline, OpenAI Codex, Hermes Agent, Cursor, Continue, Gemini CLI, LM Studio, Zed, etc.). Le modèle d'IA derrière peut être n'importe lequel du moment qu'il sait utiliser des « outils » (DeepSeek, un modèle local, ...).

1. Ouvrez un terminal dans le dossier du projet (sous Windows : tapez `cmd` dans la barre d'adresse du dossier, puis Entrée).
2. Lancez `npm run register`. Il affiche, pour chaque programme, **le fichier de réglages et le bloc exact à coller**, avec vos vrais chemins déjà remplis.
3. Ou laissez-le écrire le fichier à votre place (avec sauvegarde) : `npm run register -- --client cline --write`. Noms possibles : `desktop`, `cline`, `cursor`, `gemini`, `lmstudio`, `zed` (voir `npm run register -- --list`). Pour Codex, Hermes, Continue et Claude Code, le bloc est affiché à copier-coller.
4. Redémarrez le programme.

### Mon modèle d'IA ne sait pas voir les images

Beaucoup de petits modèles ou de modèles locaux (et certains modèles DeepSeek) ne savent pas regarder une image. Ajoutez `--text-only` à la commande, par exemple `npm run register -- --text-only`. L'IA reçoit alors la carte **dessinée en caractères** (`~` mer, chiffres et lettres = États, `*` capitales, avec une légende) au lieu de captures d'écran, et tout le reste fonctionne pareil. Vous pouvez aussi définir la variable d'environnement `FMG_TEXT_ONLY=1` dans les réglages de votre programme, ou demander une carte en texte ponctuelle avec `map_view` et `text_map: true`.

Un seul programme d'IA à la fois doit utiliser le serveur (ils se disputeraient le même port et la même fenêtre de navigateur).

## Dépannage

**Claude n'affiche pas les outils**
Fermez complètement Claude Desktop (vérifiez la zone de notification près de l'horloge) et relancez-le. Si les outils n'apparaissent toujours pas, lancez `npm run doctor` pour analyser la situation.

**Port 8765 déjà utilisé**
Une autre copie du serveur tourne déjà, ou un autre logiciel d'IA utilise ce port. Fermez les processus en arrière-plan, ou modifiez `server.port` dans `config/fmg-mcp.json`.

**Aucun navigateur trouvé**
Installez Google Chrome ou Microsoft Edge à leur emplacement standard.

**La fenêtre install.bat se ferme instantanément**
Ne faites pas « Exécuter en tant qu'administrateur ». Ouvrez le dossier dans un terminal (PowerShell ou Invite de commandes) et lancez `npm run setup` pour lire le message d'erreur.

**winget introuvable**
Sur les versions de Windows ne disposant pas de winget, installez manuellement Node.js LTS depuis [nodejs.org](https://nodejs.org), puis relancez `install.bat`.

**La carte est blanche ou masquée par une fenêtre de notes**
Lancez `npm run doctor` dans le dossier du projet : il indique ce qui ne va pas. S'il signale qu'Azgaar n'est pas construit, lancez `npm run setup -- --force` pour le réinstaller.

**Où sont mes cartes ?**
Vos cartes se trouvent dans le dossier `maps/` (`autosave.map`). Claude peut également sauvegarder et charger des cartes avec un nom précis grâce à `map_file`.

*Conseil* : La commande `npm run doctor` teste l'ensemble de votre installation et vous explique pas à pas comment résoudre chaque problème détecté.

## Comment ça marche

Lors de l'installation, Azgaar est téléchargé et enrichi d'une passerelle légère. Le serveur MCP pilote le navigateur par commandes automatisées. Cette passerelle réutilise directement le code d'édition interne d'Azgaar, ce qui garantit la cohérence des calculs, des frontières et des compteurs.

Outils MCP disponibles :
- `map_summary` : Synthèse globale du monde (taille, états, cultures, religions, populations).
- `map_view` : Capture d'écran de la carte pour Claude (avec grille de coordonnées et numéros d'États en option).
- `map_select` : Sélection d'une zone de la carte (un État, une bande de frontière, un rectangle, autour d'une ville...), affichée en rouge avant toute modification.
- `map_apply` : Applique un changement à une sélection ou une entité : déplacer des frontières, fonder des États, provinces, cultures ou religions, monter ou baisser le relief, déplacer des étiquettes, changer des emblèmes.
- `map_undo` : Annulation de la dernière modification.
- `map_list` : Liste des entités (États, provinces, cultures, religions, villes, marqueurs, routes, étiquettes).
- `map_locate` : Coordonnées et détails géographiques d'un élément précis.
- `map_camera` : Déplacement et zoom de la vue du navigateur.
- `map_layers` : Affiche ou masque des calques, applique un préréglage de calques d'Azgaar (politique, culturelle, relief, physique...), ou affiche exactement les calques demandés.
- `map_file` : Sauvegarde, chargement, liste et génération de nouvelles cartes (avec graine, taille et réglages de génération).
- `map_commands` : Découverte des actions de modification et de leurs paramètres.
- `map_status` : État du moteur et de la connexion.
- `map_export` : Exporte vers des fichiers, exactement comme le menu Export d'Azgaar : images (SVG, PNG, JPEG, tuiles PNG), données (JSON, GeoJSON, CSV) et fichier `.map`. L'IA peut d'abord choisir ce qui est dessiné (« seulement le relief et les cultures »), puis exporter. Les fichiers arrivent dans le dossier `exports`.
- `map_options` : Lit et règle la façon dont la prochaine carte est générée (nombre d'États, cultures, religions, modèle de relief, climat, unités, calendrier, nom de la carte...), contrôlé par les règles d'Azgaar.
- `map_menu` : Lance les actions propres à Azgaar : ouvrir n'importe quel éditeur ou aperçu, régénérer fleuves, villes, cultures, religions, États, marqueurs, armées, économie..., ouvrir les graphiques.
- `map_ui` : Manipule l'écran d'Azgaar comme une personne : fenêtres, menu latéral, boutons, champs, listes, même les sélecteurs de fichier (par exemple importer une image de relief).

### L'IA peut-elle utiliser 100 % d'Azgaar ?

En pratique oui, sur trois niveaux :
1. **Commandes dédiées** (`map_apply`, `map_select`) pour les modifications précises : frontières, États, provinces, cultures, religions, villes, fleuves, routes, marqueurs, étiquettes, emblèmes, relief.
2. **Le menu d'actions et l'écran d'Azgaar** (`map_menu` + `map_ui`) pour tout le reste de l'interface : tous les éditeurs et aperçus, tous les boutons de régénération, styles, notes, unités, biomes, diplomatie, zones, armées, marchandises et marchés, convertisseur d'image...
3. **Exports et réglages** (`map_export`, `map_options`) pour sortir données et images, et générer des cartes à votre goût.

Limites honnêtes : le dessin à main levée à la souris (coups de pinceau) est remplacé par les commandes de relief et de sélection ; les vues 3D et les fonctions en ligne d'Azgaar (son assistant de discussion, les sauvegardes dans le nuage) ne sont pas prises en charge ; manipuler une fenêtre avec `map_ui` n'est aussi fiable que la fenêtre elle-même. Pour le reste, `allowEval` dans `config/fmg-mcp.json` permet à une IA d'exécuter son propre code dans la page de la carte (désactivé par défaut, avancé).

## Pour les développeurs

Exécutez la suite de tests avec :
```bash
npm run check
```

Organisation du projet :
- `install.bat`, `install.sh`, `update.bat` : l'installateur et le programme de mise à jour (double-clic).
- `scripts/` : scripts d'installation, de mise à jour, de test de compatibilité, de diagnostic (`doctor`) et d'enregistrement.
- `server/` : Implémentation du serveur MCP.
- `overlay/` : Passerelle intégrée à Azgaar (`overlay/agent/`, `overlay/fonts/`).
- `test/` : Tests automatisés et environnements simulés.
- `config/fmg-mcp.json` : Fichier de configuration du serveur.

## Crédits et licence

- Distribué sous licence [MIT](LICENSE).
- Créé par aznan-triks ([dépôt GitHub](https://github.com/aznan-triks/mcp-for-Azgaar)).
- Basé sur [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator) par Azgaar (licence MIT).
- Fonctionne avec le Model Context Protocol (MCP).
