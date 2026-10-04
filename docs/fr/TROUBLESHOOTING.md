# Dépannage

Version anglaise : [TROUBLESHOOTING.md](../TROUBLESHOOTING.md).

> **Testé sur :** Windows 10 avec Google Chrome et un client MCP stdio. macOS, Linux, Microsoft Edge seul et les autres programmes d'IA mentionnés ici suivent les mêmes standards et l'installateur est conçu pour eux, mais ils n'ont pas encore été testés.

Solutions aux problèmes fréquents lors de l'installation, de la connexion ou de l'utilisation de mcp-for-Azgaar.

---

## Installation et configuration

### 1. « Node ... is too old: this server needs Node 22.18 or newer »
- **Symptôme** : Pendant l'installation, ou dans le journal de votre programme d'IA, vous voyez :
  `Node 20.11.0 is too old: this server needs Node 22.18 or newer (24 recommended). Install it from https://nodejs.org, then restart your AI client.`
- **Cause** : Votre ordinateur dispose d'une version obsolète de Node.js, ou Node.js n'est pas installé du tout.
- **Solution** : Installez la version LTS (Long Term Support) actuelle de Node.js. Sous Windows, exécutez dans PowerShell ou dans l'Invite de commandes :
  ```powershell
  winget install OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  ```
  Ou téléchargez et lancez directement l'installateur depuis [nodejs.org](https://nodejs.org). Ensuite, fermez votre terminal, ouvrez-en un nouveau, puis relancez `install.bat` ou `npm run setup`.

### 2. winget est manquant ou non reconnu
- **Symptôme** : L'exécution de `install.bat` échoue avec un message indiquant que `winget` n'est pas reconnu en tant que commande interne ou externe.
- **Cause** : Les installations plus anciennes de Windows 10 ne disposent pas du Gestionnaire de package Windows (`winget`).
- **Solution** : Téléchargez et lancez manuellement l'installateur de Node.js depuis [nodejs.org](https://nodejs.org). Une fois installé, double-cliquez à nouveau sur `install.bat`.

### 3. La fenêtre d'`install.bat` se ferme instantanément
- **Symptôme** : Vous double-cliquez sur `install.bat` et la fenêtre s'ouvre une fraction de seconde puis disparaît immédiatement.
- **Cause** : L'option « Exécuter en tant qu'administrateur » a été choisie (ce qui modifie le dossier de travail vers System32), ou une commande initiale a échoué avant que la sortie ne puisse être lue.
- **Solution** : Ne faites pas de clic droit pour choisir « Exécuter en tant qu'administrateur ». À la place, ouvrez une Invite de commandes dans le dossier du projet (tapez `cmd` dans la barre d'adresse de l'Explorateur de fichiers et appuyez sur Entrée), puis exécutez :
  ```cmd
  npm run setup
  ```
  Tout message d'erreur restera visible dans la fenêtre du terminal.

### 4. Windows SmartScreen bloque `install.bat`
- **Symptôme** : Windows affiche une fenêtre bleue indiquant « Windows a protégé votre ordinateur - Microsoft Defender SmartScreen a empêché le démarrage d'une application non reconnue ».
- **Cause** : `install.bat` a été téléchargé depuis Internet et ne dispose pas d'une signature numérique commerciale payante.
- **Solution** : Cliquez sur le petit lien **Informations complémentaires** sous le texte d'avertissement, puis cliquez sur le bouton **Exécuter quand même**.

### 5. Téléchargement bloqué par un pare-feu ou un proxy
- **Symptôme** : L'installateur échoue lors de la récupération d'Azgaar avec :
  `GitHub answered 403 when asking for the latest Azgaar release. Check your internet connection and try again.`
  ou :
  `Could not download https://codeload.github.com/Azgaar/Fantasy-Map-Generator/tar.gz/... (HTTP 403). Check your internet connection.`
- **Cause** : Votre connexion Internet, votre pare-feu d'entreprise ou votre VPN bloque l'accès à l'API GitHub ou aux archives codeload.
- **Solution** : Assurez-vous que votre ordinateur peut joindre `api.github.com` et `codeload.github.com`. Si vous utilisez un proxy HTTP d'entreprise, configurez-le dans votre terminal avec :
  ```bash
  npm config set proxy http://proxy.company.com:8080
  npm config set https-proxy http://proxy.company.com:8080
  ```
  Relancez ensuite `npm run setup`.

### 6. npm install échoue avec des erreurs de dépendances
- **Symptôme** : L'installation s'interrompt avec :
  `npm could not install Azgaar's dependencies (see the messages above).`
- **Cause** : Un téléchargement interrompu, un dossier `node_modules` incomplet ou un cache npm obsolète.
- **Solution** : Nettoyez votre cache npm et relancez l'installation avec l'option force :
  ```bash
  npm cache clean --force
  npm run setup -- --force
  ```

### 7. Erreurs d'espace disque pendant l'installation
- **Symptôme** : L'installation échoue avec `ENOSPC: no space left on device` pendant le téléchargement ou la compilation d'Azgaar.
- **Cause** : La compilation d'Azgaar et l'installation des paquets npm nécessitent environ 500 Mo d'espace disque temporaire.
- **Solution** : Libérez de l'espace sur le disque principal de votre système d'exploitation (en particulier le dossier `%TEMP%` sous Windows) et exécutez :
  ```bash
  npm run setup -- --force
  ```

### 8. L'antivirus verrouille ou supprime des fichiers de compilation
- **Symptôme** : L'installation échoue avec `EPERM` ou `EACCES` lors de l'écriture dans `upstream/azgaar` ou `.browser-profile`.
- **Cause** : Les scanners antivirus en temps réel peuvent verrouiller temporairement les nouveaux fichiers JavaScript ou binaires pendant leur décompression et leur compilation.
- **Solution** : Ajoutez le dossier du projet `mcp-for-Azgaar` à la liste d'exclusions de votre logiciel antivirus, puis exécutez `npm run setup -- --force`.

### 9. Le chemin de fichier contient des espaces ou des caractères non-ASCII
- **Symptôme** : Les outils signalent des erreurs de fichier ou l'installation échoue lors de la décompression des archives si le chemin du dossier contient des accents ou des symboles spéciaux.
- **Cause** : Certains utilitaires en ligne de commande tiers peuvent mal interpréter les chemins contenant des caractères spéciaux.
- **Solution** : Déplacez le dossier `mcp-for-Azgaar` vers un chemin plus simple sans espaces ni accents (par exemple `C:\projets\mcp-for-Azgaar` ou `D:\mcp-for-Azgaar`), puis relancez l'installation.

### 10. L'extraction de l'archive échoue avec des erreurs tar
- **Symptôme** : L'installation s'interrompt avec :
  `Could not unpack the download (tar): ...`
- **Cause** : Une version non standard de `tar` (telle qu'un vieux GNU tar provenant d'un chemin Git Bash personnalisé) a été trouvée avant le `tar.exe` natif de Windows System32.
- **Solution** : Sous Windows, l'installateur utilise par défaut `C:\Windows\System32\tar.exe`. Si un PATH personnalisé le remplace, assurez-vous que System32 figure en premier dans votre PATH ou exécutez la commande directement depuis Windows PowerShell standard.

---

## Connexion de votre programme d'IA

### 11. Claude Desktop ne liste pas les outils de carte
- **Symptôme** : Dans Claude Desktop, cliquer sur le bouton de pièces jointes ou d'outils n'affiche ni `map_view` ni les autres outils de carte.
- **Cause** : Claude Desktop n'a pas été redémarré, ou le fichier de configuration n'a pas été mis à jour.
- **Solution** : Quittez complètement Claude Desktop (faites un clic droit sur l'icône de Claude dans la zone de notification de Windows près de l'horloge et cliquez sur **Exit**). Exécutez ensuite :
  ```bash
  npm run register -- --client desktop --write
  ```
  Redémarrez Claude Desktop et vérifiez à nouveau.

### 12. « Server disconnected » dans le client IA
- **Symptôme** : Votre programme d'IA signale que le serveur MCP s'est déconnecté ou s'est arrêté de manière inattendue.
- **Cause** : Le processus Node a planté au démarrage, le plus souvent parce que Node est manquant ou que le chemin du projet a changé.
- **Solution** : Lancez le diagnostic doctor pour trouver la raison exacte :
  ```bash
  npm run doctor
  ```

### 13. Vous avez déplacé le dossier du projet vers un nouvel emplacement
- **Symptôme** : L'assistant IA indique qu'il ne peut pas démarrer le serveur après avoir déplacé le dossier.
- **Cause** : Les fichiers de configuration de l'IA enregistrent le chemin absolu vers `scripts/start.mjs`. Déplacer le dossier rend ce chemin invalide.
- **Solution** : Ouvrez un terminal dans le nouvel emplacement du dossier et exécutez :
  ```bash
  npm run register -- --client desktop --write
  ```
  Remplacez `desktop` par `cline`, `cursor` ou le nom de votre client si vous utilisez une autre application.

### 14. Deux programmes d'IA tentent d'utiliser le serveur en même temps
- **Symptôme** : Le deuxième programme ne parvient pas à démarrer ou son journal indique :
  `Port 8765 is already in use: change server.port in config/fmg-mcp.json` (l'autotest `npm run doctor` ajoute : `close the other copy of the server (another AI client may be using it) or change server.port`).
- **Cause** : Un seul programme d'IA peut exécuter le serveur à la fois, car ils partagent la fenêtre du navigateur et le port 8765.
- **Solution** : Fermez le premier programme d'IA ou déconnectez sa session avant de démarrer l'autre.

### 15. Une modification des paramètres nécessite un redémarrage complet
- **Symptôme** : Vous avez modifié `config/fmg-mcp.json` ou exécuté `npm run register`, mais l'assistant IA se comporte toujours comme avant.
- **Cause** : Les programmes d'IA ne lisent leurs configurations de serveur MCP qu'une seule fois au lancement.
- **Solution** : Quittez complètement et rouvrez votre client d'IA (fermez également les processus dans la zone de notification).

### 16. Configuration de Claude Code
- **Symptôme** : Vous souhaitez utiliser Claude Code dans le terminal au lieu de Claude Desktop.
- **Cause** : Claude Code utilise son propre enregistrement en ligne de commande plutôt que `claude_desktop_config.json`.
- **Solution** : Dans votre terminal à l'intérieur du dossier du projet, exécutez :
  ```bash
  npm run register
  ```
  Copiez la commande exacte affichée sous `Claude Code (run once):`, qui ressemble à :
  ```bash
  claude mcp add azgaar -- node "D:/path/to/mcp-for-Azgaar/scripts/start.mjs"
  ```
  Exécutez cette commande dans votre terminal.

### 17. Configuration de Cline dans VS Code
- **Symptôme** : Vous souhaitez enregistrer le serveur dans l'extension Cline pour Visual Studio Code.
- **Cause** : Cline enregistre sa configuration dans `cline_mcp_settings.json`.
- **Solution** : Exécutez :
  ```bash
  npm run register -- --client cline --write
  ```
  Rechargez ensuite votre fenêtre VS Code.

### 18. Configuration de Cursor
- **Symptôme** : Vous souhaitez utiliser le serveur avec l'éditeur Cursor AI.
- **Cause** : Cursor utilise `.cursor/mcp.json`.
- **Solution** : Exécutez :
  ```bash
  npm run register -- --client cursor --write
  ```
  Redémarrez Cursor ensuite.

### 19. Configuration de LM Studio
- **Symptôme** : Vous souhaitez connecter un modèle de langage local dans LM Studio.
- **Cause** : LM Studio enregistre les configurations MCP dans `.lmstudio/mcp.json` et nécessite des modèles prenant en charge l'appel d'outils.
- **Solution** : Exécutez :
  ```bash
  npm run register -- --client lmstudio --write
  ```
  Assurez-vous que le modèle chargé dans LM Studio prend en charge l'appel de fonctions/outils. Si le modèle ne peut pas traiter les images, ajoutez `--text-only` :
  ```bash
  npm run register -- --client lmstudio --write --text-only
  ```

### 20. Configuration de Codex CLI ou Hermes Agent
- **Symptôme** : Vous souhaitez configurer OpenAI Codex CLI ou Nous Research Hermes Agent.
- **Cause** : Ces outils utilisent des fichiers de configuration TOML ou YAML au lieu de JSON.
- **Solution** : Exécutez `npm run register` sans argument. Il affiche des blocs prêts à coller :
  - Pour Codex : copiez le bloc TOML dans `~/.codex/config.toml`.
  - Pour Hermes : copiez le bloc YAML dans `~/.hermes/config.yaml`.

---

## Navigateur et fenêtre

### 21. « No browser found »
- **Symptôme** : L'outil échoue avec :
  `No browser found (tried: chrome, msedge). Install Google Chrome or Microsoft Edge, or set browser.executablePath (or browser.channel) in config/fmg-mcp.json.`
- **Cause** : Ni Google Chrome ni Microsoft Edge n'est installé dans son emplacement standard sur le système d'exploitation.
- **Solution** : Installez Google Chrome ou Microsoft Edge. Si votre navigateur se trouve dans un emplacement personnalisé, ouvrez `config/fmg-mcp.json` et définissez `browser.executablePath` avec le chemin absolu de l'exécutable de votre navigateur.

### 22. La fenêtre du navigateur se ferme immédiatement
- **Symptôme** : Le navigateur s'ouvre et se referme aussitôt.
- **Cause** : Un autre processus détient peut-être le verrou sur le profil utilisateur, ou la session a été interrompue.
- **Solution** : Fermez tous les processus Chrome ou Edge en arrière-plan dans le Gestionnaire des tâches de Windows, ou supprimez le dossier `.browser-profile` à la racine du projet.

### 23. Vous avez fermé accidentellement la fenêtre de carte du navigateur
- **Symptôme** : Vous avez fermé la fenêtre du navigateur avec le bouton 'X' pendant la discussion.
- **Cause** : Le navigateur a été fermé manuellement.
- **Solution** : Vous n'avez rien à faire. La prochaine fois que l'IA exécutera un outil de carte, elle appellera `session.ensure()`, ce qui relance automatiquement une nouvelle fenêtre de navigateur et restaure votre carte.

### 24. Un processus Chrome restant retient le profil
- **Symptôme** : L'outil échoue avec une erreur indiquant que le dossier de données utilisateur est utilisé par une autre instance du navigateur.
- **Cause** : Un processus de navigateur précédent ne s'est pas arrêté proprement.
- **Solution** : Ouvrez le Gestionnaire des tâches (Ctrl+Maj+Échap), arrêtez tous les processus `Google Chrome` ou `Microsoft Edge` lancés par l'outil, ou supprimez le dossier `.browser-profile` dans le dossier du projet.

### 25. Le navigateur ouvre une page blanche vide
- **Symptôme** : Une fenêtre de navigateur s'ouvre, mais l'écran reste entièrement blanc et aucune carte n'apparaît.
- **Cause** : L'interface d'Azgaar n'a pas été compilée, ou `dist-electron/renderer/index.html` est manquant.
- **Solution** : Recompilez l'application avec :
  ```bash
  npm run setup -- --force
  ```

### 26. La fenêtre popup des notes de version recouvre la carte
- **Symptôme** : Une fenêtre modale avec « Changelog » ou des notes de version apparaît au centre de la carte au lancement.
- **Cause** : Le stockage local du navigateur a été effacé ou n'a pas reçu la graine de version.
- **Solution** : Le serveur injecte automatiquement `seedStorage` au démarrage. Si la boîte de dialogue apparaît, demandez simplement à l'IA : « Ferme toutes les fenêtres ouvertes », ce qui appelle `map_ui` avec `{"action": "close_dialogs"}`.

### 27. La fenêtre de la carte est trop petite ou trop grande
- **Symptôme** : La taille de la fenêtre du navigateur ne convient pas à votre écran.
- **Cause** : Les dimensions par défaut sont réglées sur 1280x720 dans `config/fmg-mcp.json`.
- **Solution** : Ouvrez `config/fmg-mcp.json` dans un éditeur de texte et ajustez `browser.viewport.width` et `browser.viewport.height`.

---

## Carte et modifications

### 28. Les modifications ont été appliquées mais rien n'a changé à l'écran
- **Symptôme** : L'IA dit avoir ajusté le relief, les cultures ou les religions, mais la carte semble identique.
- **Cause** : Le calque visuel correspondant à cette fonctionnalité est actuellement désactivé.
- **Solution** : Demandez à l'IA : « Active le calque de la carte des hauteurs » ou « Bascule sur le préréglage culturel ». L'IA appelle `map_layers` pour activer le calque.

### 29. Les identifiants d'États ou les numéros de cellules ont changé après une annulation ou un chargement
- **Symptôme** : Après avoir annulé un changement de terrain, les numéros de cellules ou les index d'États se sont décalés.
- **Cause** : Lorsque le terrain est modifié avec `scope: "all"`, les côtes bougent, ce qui reconstruit la grille de la carte et renumérote les cellules.
- **Solution** : Si vous souhaitez élever ou abaisser les terres sans changer les numéros de cellules ni les côtes, demandez à l'IA de modifier le terrain avec `scope: "land"`, ce qui modifie les altitudes sur place.

### 30. Le surlignage rouge de la sélection disparaît après une annulation
- **Symptôme** : Vous aviez une sélection rouge à l'écran, vous avez demandé à l'IA d'annuler une modification, et le surlignage rouge a disparu.
- **Cause** : `map_undo` recharge l'intégralité du fichier `.map` enregistré dans le navigateur (ce qui prend environ 2 secondes), ce qui réinitialise les calques de sélection temporaires.
- **Solution** : Les sélections ne survivent pas aux rechargements. Demandez à l'IA de resélectionner la zone avant d'appliquer la modification suivante.

### 31. L'édition est lente sur les très grandes cartes
- **Symptôme** : Les modifications mettent 5 à 10 secondes à répondre.
- **Cause** : Les cartes générées avec une densité de points élevée (par exemple plus de 20 000 cellules) ou de grandes dimensions de canevas nécessitent de lourds recalculs des polygones de Voronoi et des frontières.
- **Solution** : Pour un prototypage rapide, générez des cartes avec des tailles standard (1280x720) et la densité par défaut.

### 32. Le fichier de sauvegarde automatique ne peut pas être restauré
- **Symptôme** : Au démarrage, `map_status` affiche un avertissement :
  `could not restore the previous map, a new one was generated: ...`
- **Cause** : `maps/autosave.map` a été corrompu ou interrompu lors d'un plantage système antérieur.
- **Solution** : Le serveur génère une carte propre en toute sécurité. Si vous avez une sauvegarde nommée plus ancienne, demandez à l'IA de la charger avec `map_file load`.

### 33. La carte se réinitialise sur un monde aléatoire au démarrage
- **Symptôme** : À chaque démarrage d'une nouvelle discussion, votre monde précédent est remplacé par un nouveau monde aléatoire.
- **Cause** : `startup` dans `config/fmg-mcp.json` a été changé de `"autosave"` à `"new"`.
- **Solution** : Ouvrez `config/fmg-mcp.json` et assurez-vous d'avoir `"startup": "autosave"`.

---

## Exports

### 34. L'exportation échoue avec « nothing was downloaded »
- **Symptôme** : L'IA appelle `map_export` et signale :
  `Azgaar did not produce a file (nothing was downloaded). If the browser window was closed or crashed, ask again (it reopens); if it keeps failing, close any leftover Chrome window from a previous run, or delete the .browser-profile folder.`
- **Cause** : La fenêtre du navigateur a planté pendant le rendu, ou une boîte de dialogue modale ouverte a bloqué l'exportation.
- **Solution** : Fermez toutes les boîtes de dialogue ouvertes avec `map_ui close_dialogs`, ou fermez la fenêtre du navigateur pour que le serveur rouvre une instance propre lors de votre prochaine requête.

### 35. L'image n'est pas jointe dans la fenêtre de discussion
- **Symptôme** : L'IA indique que l'exportation a réussi, mais aucune image n'apparaît dans le message du chat.
- **Cause** : L'image exportée dépasse `maxImageBytes` (900 Ko par défaut) dans `config/fmg-mcp.json`. Le serveur renvoie :
  `The picture is too large to attach here; it is saved at the path above.`
- **Solution** : Vous trouverez le fichier exporté directement dans le dossier `exports/` du répertoire de votre projet.

### 36. L'exportation PNG affiche les mauvais calques
- **Symptôme** : Vous avez demandé une carte politique, mais l'image exportée montre les biomes ou le relief.
- **Cause** : `map_export` accepte les paramètres `only_layers` et `layer_preset` qui prévalent sur les calques actuels de l'écran pendant l'exportation.
- **Solution** : Demandez à l'IA de spécifier les calques exacts ou le préréglage souhaité dans l'export, par exemple : « Exporte un PNG avec le préréglage de calques political ».

---

## Génération et réglages

### 37. La définition via `map_options` est refusée
- **Symptôme** : L'IA tente de définir des options et reçoit :
  `settings: refused, nothing changed. ... Current values and choices: map_options get`
- **Cause** : La valeur de réglage fournie ne respecte pas le schéma d'options d'Azgaar (par exemple un nombre d'États négatif ou un nom de modèle inconnu).
- **Solution** : Demandez à l'IA d'appeler `map_options` avec `action: "get"` pour inspecter les choix autorisés et les plages de paramètres.

### 38. Les réglages préréglés sont ignorés sur la prochaine carte générée
- **Symptôme** : Vous avez réglé le modèle sur archipel, mais une nouvelle carte se génère sous forme de continent.
- **Cause** : Les épingles ont été libérées ou `map_file new` a été appelé sans enregistrer au préalable les valeurs épinglées.
- **Solution** : Utilisez `map_options` avec `action: "set"` juste avant d'appeler `map_file` avec `action: "new"`. N'appelez pas `release` avant que la nouvelle carte n'ait été générée.

---

## Mises à jour et compatibilité

### 39. `npm run update` signale que la version n'est pas compatible
- **Symptôme** : L'exécution de `npm run update` affiche :
  `This Azgaar version is not compatible yet (could not apply: ...).`
  ou :
  `The new Azgaar did not pass the compatibility check.`
- **Cause** : La version amont d'Azgaar a introduit des changements de code structurels qui ne correspondent pas aux motifs de modification de la passerelle.
- **Solution** : Le programme de mise à jour effectue un retour arrière automatique :
  `Your current Azgaar was kept and keeps working. If you think this is a bug in the bridge, open an issue on GitHub and mention the line above.`
  Votre générateur de cartes actuel reste fonctionnel.

### 40. Revenir à la version de référence testée
- **Symptôme** : Vous avez effectué une mise à jour vers une version expérimentale et vous souhaitez revenir à la version stable testée.
- **Cause** : Une mise à jour a provoqué un comportement indésirable.
- **Solution** : Exécutez :
  ```bash
  npm run update -- --known-good
  ```
  Cela restaure la version exacte stockée dans `known-good.json`.

---

## Modèles textuels et ports

### 41. Le modèle ne peut pas voir les captures d'écran
- **Symptôme** : Un modèle d'IA local ou un client en terminal se plaint de ne pas pouvoir traiter les pièces jointes sous forme d'images.
- **Cause** : De nombreux modèles locaux plus petits (et certains outils en ligne de commande) ne prennent en charge que le texte.
- **Solution** : Enregistrez à nouveau votre client avec l'option `--text-only` :
  ```bash
  npm run register -- --client desktop --write --text-only
  ```
  Ou demandez à l'IA d'appeler `map_view` avec `{"text_map": true}`.

### 42. Le port local 8765 est déjà utilisé
- **Symptôme** : Le diagnostic doctor ou le journal du serveur signale :
  `Port 8765 is already in use: change server.port in config/fmg-mcp.json` (affiché par `npm run doctor` sur une ligne commençant par `FAIL`)
- **Cause** : Un autre exemplaire du serveur est en cours d'exécution, ou une autre application a réservé le port 8765.
- **Solution** : Fermez tout terminal supplémentaire ou client d'IA exécutant mcp-for-Azgaar. Pour utiliser un autre port, modifiez `server.port` dans `config/fmg-mcp.json` ou définissez la variable d'environnement `FMG_PORT` :
  Windows PowerShell : `$env:FMG_PORT="8790"` ; Invite de commandes Windows : `set FMG_PORT=8790` ; terminal macOS/Linux : `export FMG_PORT=8790`. Pour un programme d'IA, définissez `FMG_PORT` dans ses propres paramètres d'environnement (voir [CONFIGURATION](CONFIGURATION.md)).

---

## Toujours bloqué ?

Si vous avez essayé les étapes ci-dessus et que le problème persiste :

1. **Lancez l'outil d'autodiagnostic** :
   Ouvrez un terminal dans le dossier du projet et exécutez :
   ```bash
   npm run doctor
   ```
   Lisez les lignes marquées `FAIL` : chaque échec comporte une flèche `->` expliquant la correction exacte.

2. **Vérifiez les journaux du serveur** :
   - Dans Claude Desktop : vérifiez le menu des journaux ou inspectez la sortie de la console stderr.
   - Au sein de toute discussion : demandez à votre IA d'appeler `map_status`. Il signale l'URL du serveur local, la version de la passerelle, les avertissements de démarrage et toutes les erreurs de page enregistrées par le navigateur.

3. **Ouvrez un ticket sur GitHub** :
   Rendez-vous sur [https://github.com/aznan-triks/mcp-for-Azgaar/issues](https://github.com/aznan-triks/mcp-for-Azgaar/issues).
   Copiez et collez :
   - La sortie de `npm run doctor`
   - Votre système d'exploitation (Windows, macOS ou Linux)
   - Le nom et la version de votre programme d'IA (par exemple Claude Desktop 0.8, Cline, Cursor)
   - Le texte d'erreur exact affiché dans votre discussion ou dans votre terminal
