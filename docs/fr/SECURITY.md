# Référence sur la sécurité et la confidentialité

Version anglaise : [SECURITY.md](../SECURITY.md).

> **Testé sur :** Windows 10 avec Google Chrome et un client MCP stdio. macOS, Linux, Microsoft Edge seul et les autres programmes d'IA cités ici suivent les mêmes standards et l'installateur est écrit pour eux, mais ils n'ont pas encore été testés.

Ce document explique ce que mcp-for-Azgaar fait sur votre ordinateur, ce qu'il télécharge, où il écrit des fichiers, ainsi que les garde-fous qui préservent la confidentialité et la sécurité de vos données.

## Ce qui s'exécute sur votre ordinateur

Lorsque votre programme d'IA utilise mcp-for-Azgaar, trois composants s'exécutent localement sur votre machine :

1. **Le processus du serveur MCP** : un processus d'arrière-plan Node.js (`server/index.ts` via `scripts/start.mjs`). Il communique selon le protocole Model Context Protocol (MCP) sur les entrées/sorties standard (stdio) avec votre client d'IA (par exemple Claude Desktop). Il n'écoute jamais de connexions entrantes provenant d'Internet.
2. **Un serveur web local** : un serveur HTTP interne (`server/static.ts`) qui distribue les fichiers web d'Azgaar. Il se lie exclusivement à l'adresse de boucle locale (`127.0.0.1`), ce qui signifie qu'il n'est accessible que depuis votre propre ordinateur.
3. **Une instance de navigateur** : une fenêtre de navigateur locale (Google Chrome ou Microsoft Edge) contrôlée via Playwright. Le navigateur affiche la carte et exécute la passerelle d'IA (`overlay/agent/`).

## Accès réseau et garantie de fonctionnement hors ligne

Une fois installé, mcp-for-Azgaar est conçu pour fonctionner à 100 % hors ligne.

- **Les requêtes vers l'extérieur sont bloquées** : dans `server/browser.ts`, le routage réseau intercepte chaque requête HTTP et HTTPS du contexte du navigateur (`context.route("**/*")`). Seules les requêtes vers les URL `data:`, `blob:` et les hôtes de boucle locale (`127.0.0.1`, `localhost`, `[::1]`) sont autorisées à se charger.
- **Les requêtes vers l'extérieur sont enregistrées** : toute tentative par la page ou par un script intégré de contacter un serveur externe est immédiatement interrompue et ajoutée à une liste interne.
- **Auditer les requêtes bloquées** : vous ou l'IA pouvez appeler l'outil `map_status` à tout moment. Il renvoie `blockedOutsideRequests`, qui liste chaque URL externe que le navigateur a tenté de joindre et qui a été refusée.

## Ce qui est téléchargé et d'où

L'accès à Internet n'est utilisé que pendant l'installation et les mises à jour explicites.

- **Au moment de l'installation** :
  - Le script d'installation (`scripts/azgaar.mjs`) interroge l'API officielle de GitHub (`https://api.github.com/repos/Azgaar/Fantasy-Map-Generator/releases/latest`) ou télécharge une archive source spécifique depuis GitHub codeload (`https://codeload.github.com/Azgaar/Fantasy-Map-Generator/tar.gz/<ref>`).
  - Les paquets npm standards nécessaires pour compiler Azgaar et exécuter le serveur sont installés via `npm ci --ignore-scripts --no-audit --no-fund` et `npm install`.
  - Rien d'autre n'est téléchargé.
- **Aucune mise à jour en arrière-plan** : le logiciel ne vérifie jamais les mises à jour et ne télécharge aucun code en arrière-plan. Les nouvelles versions d'Azgaar sont téléchargées uniquement lorsque vous lancez manuellement `npm run update` ou double-cliquez sur `update.bat`.

## Où les fichiers sont écrits

Tous les fichiers permanents créés par mcp-for-Azgaar restent dans le dossier du projet, à l'exception des sauvegardes de configuration créées dans le dossier de réglages de votre client d'IA :

| Folder / File | Location | Content and Purpose |
|---|---|---|
| `maps/` | Racine du projet | Stocke les fichiers de carte enregistrés (`.map`) et la sauvegarde automatique en arrière-plan (`autosave.map`). |
| `maps/history/` | Racine du projet | Stocke les instantanés numérotés `.map` utilisés pour les opérations d'annulation et de rétablissement. |
| `exports/` | Racine du projet | Stocke les fichiers d'image exportés (`.png`, `.svg`, `.jpeg`), les tuiles zippées et les données exportées (`.json`, `.geojson`, `.csv`). |
| `upstream/` | Racine du projet | Stocke le code source téléchargé d'Azgaar, les ressources web compilées (`upstream/azgaar/dist-electron/renderer/`), et les métadonnées de version (`upstream/state.json`). |
| `.browser-profile/` | Racine du projet | Stocke le profil utilisateur du navigateur, le cache et le `localStorage` utilisés par l'instance de navigateur automatisée. |
| Sauvegardes de configuration du client | Dossier de réglages du client | Lorsque `scripts/register.mjs` met à jour un fichier de configuration de client (par exemple les réglages de Claude Desktop), il enregistre d'abord une copie de sauvegarde horodatée avec l'extension `.bak-<timestamp>` dans le même dossier. |
| Dossiers temporaires | Dossier temporaire de l'OS | Dossiers éphémères préfixés par `azgaar-compat-`, `azgaar-docs-` ou `azgaar-dl-`, utilisés lors de l'installation, des mises à jour et de la génération de documentation. Ils sont supprimés après utilisation. L'auto-test (`npm run doctor`) utilise un dossier `.browser-profile-doctor` à côté de `.browser-profile`, qu'il supprime lorsqu'il se termine. |

## Comptes, clés et télémétrie

- **Aucun compte ni inscription** : vous n'avez pas besoin de créer de compte ni de vous connecter à un service pour utiliser ce logiciel.
- **Aucune clé d'API ni jeton** : le serveur ne requiert aucune clé d'API, aucun identifiant ni aucun secret.
- **Aucune télémétrie ni pistage** : il n'y a aucune télémétrie, aucune analyse d'utilisation ni aucun rapport de plantage dans mcp-for-Azgaar. De plus, quand Azgaar est compilé pendant l'installation, il est compilé avec `--mode electron`, ce qui désactive les analyses web intégrées dans la version web par défaut d'Azgaar.

## Ce que l'IA peut et ne peut pas faire

L'IA interagit avec Azgaar strictement par l'intermédiaire des outils MCP enregistrés.

### Ce que l'IA peut faire
- Inspecter la géographie de la carte, les États, les villes, le relief, les biomes et les populations.
- Prendre des captures d'écran ou générer des cartes en mode texte de caractères de la zone d'affichage active.
- Sélectionner des régions, déplacer des frontières, fonder des États, élever le terrain et ajuster les étiquettes.
- Déclencher des commandes du menu d'Azgaar et cliquer sur des boutons de boîtes de dialogue via `map_menu` et `map_ui`.
- Enregistrer des cartes dans `maps/` et exporter des données visuelles ou tabulaires dans `exports/`.
- Annuler toute modification effectuée pendant la session active.

### Ce que l'IA ne peut pas faire
- **L'écriture reste confinée au projet** : les outils de carte écrivent uniquement dans `maps/` (sauvegardes, autosauvegarde, instantanés d'annulation) et `exports/` (exportations). La lecture est limitée aux cartes enregistrées dans `maps/`, avec une seule exception décrite ci-après.
- **Exportation de fichiers sécurisée** : dans `server/browser.ts` et `server/tools-extra.ts`, les noms de fichiers d'exportation sont nettoyés : les caractères de traversée de chemin (`..`) et les barres obliques de dossier sont supprimés. Tous les fichiers exportés sont écrits strictement à l'intérieur du dossier `exports/`.
- **Limite d'importation de fichiers locaux** : l'outil `map_ui` fournit une action `upload` capable de transmettre un chemin de fichier au sélecteur de fichier de la page (par exemple pour charger une image personnalisée de carte de relief ou un fichier `.map`). Il vérifie uniquement que le chemin existe sur votre ordinateur ; il ne le restreint **pas** au dossier du projet. Une IA peut donc transmettre à la page d'Azgaar tout fichier dont elle connaît le chemin (par exemple une image dans votre dossier Téléchargements). Cette page fonctionne hors ligne et ne peut envoyer le contenu nulle part, mais gardez cela à l'esprit, et refusez un `upload` inattendu.
- **L'évaluation JavaScript est désactivée par défaut** : l'outil `map_eval` est désactivé par défaut (`"allowEval": false` dans `config/fmg-mcp.json`). S'il est activé manuellement, l'IA peut exécuter du JavaScript arbitraire dans le contexte de la page du navigateur. Il est protégé par un instantané d'annulation avant l'exécution, mais peut altérer les structures de la page en mémoire.

## Collisions de ports et risques liés aux instances multiples

Par défaut, le serveur web statique interne écoute sur le port TCP `8765` sur `127.0.0.1`.

- **Erreur de port déjà utilisé** : si un autre programme (ou une deuxième instance en cours d'exécution de mcp-for-Azgaar) utilise déjà le port 8765, le serveur échoue à démarrer avec le message `Port 8765 is already in use: change server.port in config/fmg-mcp.json` (Le port 8765 est déjà utilisé : modifiez server.port dans config/fmg-mcp.json).
- **Verrouillage du profil** : exécuter plusieurs clients d'IA connectés simultanément à mcp-for-Azgaar peut faire échouer Playwright car le dossier `.browser-profile` est verrouillé par le premier processus de navigateur en cours d'exécution.
- **Recommandation** : n'exécutez qu'un seul client d'IA à la fois avec mcp-for-Azgaar, ou configurez des ports distincts (`server.port`) et des dossiers de profil distincts (`profileDir`) dans `config/fmg-mcp.json` si vous exécutez plusieurs instances.

## Limites techniques

- Le processus du serveur Node.js s'exécute avec les privilèges de l'utilisateur local qui a lancé le client d'IA. Il ne s'exécute pas dans un bac à sable (sandbox) restreint du système d'exploitation.
- L'isolation sur la boucle locale protège contre l'accès réseau externe, mais tout programme s'exécutant déjà localement sur votre ordinateur avec les autorisations de l'utilisateur peut se connecter à `http://127.0.0.1:8765` tant que le serveur est actif.

## Signaler une vulnérabilité

Si vous découvrez un problème de sécurité ou une vulnérabilité dans mcp-for-Azgaar :

- Ouvrez un ticket sur GitHub : [https://github.com/aznan-triks/mcp-for-Azgaar/issues](https://github.com/aznan-triks/mcp-for-Azgaar/issues).
- Décrivez clairement le problème et incluez les étapes pour le reproduire.
- Ne publiez pas d'identifiants personnels sensibles, de clés d'API ou de détails d'exploitation non coordonnés sur des outils de suivi de tickets publics.
