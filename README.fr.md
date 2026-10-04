[Read in English](README.md)

# mcp-for-Azgaar

mcp-for-Azgaar connecte votre assistant IA (Claude Desktop ou Claude Code) au générateur de cartes [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator). C'est un serveur MCP : voyez MCP comme une prise qui permet à Claude d'utiliser d'autres logiciels. La carte s'affiche en direct dans une vraie fenêtre de navigateur (Google Chrome ou Microsoft Edge) sur votre ordinateur. Vous voyez Claude analyser la géographie, examiner les royaumes et tracer les frontières en temps réel, tout en pouvant continuer à modifier la carte à la main quand vous le souhaitez. Tout fonctionne à 100 % en local et hors ligne une fois installé : aucun compte, aucune clé d'API, et aucune donnée n'est envoyée sur Internet.

Exemples de demandes possibles à Claude :
- « Montre-moi la carte »
- « Agrandis l'empire mouan vers l'ouest »
- « Fonde un nouveau royaume autour de cette ville »
- « Élève une chaîne de montagnes ici »
- « Annule ça »

## Ce dont vous avez besoin

- Windows 10/11, macOS ou Linux.
- Google Chrome ou Microsoft Edge.
- Claude Desktop (application gratuite sur [claude.ai/download](https://claude.ai/download)) ou Claude Code.
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

## Utilisateurs de Claude Code

- Lancez `npm run register` pour afficher la commande exacte à copier-coller :
  `claude mcp add azgaar -- ...`
- Lancez `npm run register -- --desktop` pour écrire automatiquement la configuration de Claude Desktop (avec sauvegarde préalable).

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
- `map_list` : Liste des entités (états, villes, fleuves, marqueurs).
- `map_locate` : Coordonnées et détails géographiques d'un élément précis.
- `map_camera` : Déplacement et zoom de la vue du navigateur.
- `map_layers` : Activation et désactivation des calques visuels (relief, routes, frontières).
- `map_file` : Sauvegarde, chargement et export de fichiers de carte.
- `map_commands` : Découverte des actions de modification et de leurs paramètres.
- `map_status` : État du moteur et de la connexion.

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
