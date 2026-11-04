# Questions

**Est-ce que l'IA a un shell sur ma machine ?**
Non. Elle parle aux outils MCP ; les outils appellent un seul objet du pont dans une fenêtre Chromium (`window.FMG_AGENT`). Il n'y a aucun outil shell et aucun outil de fichier en dehors des deux nommés (`map_file` pour les fichiers `.map`, `map_export` pour le dossier d'exports). `map_eval`, qui exécute bel et bien du JavaScript dans la page, reste éteint tant que vous n'activez pas `allowEval`.

**Puis-je perdre une carte ?**
La carte en cours est sauvegardée dans `maps/autosave.map` après chaque modification, toutes les `autosave.intervalSec` et à l'arrêt, puis rechargée au démarrage. `map_undo` écrit d'abord `maps/rescue-before-undo.map`, pour que les retouches faites à la main dans la fenêtre entre deux appels de l'IA survivent à une annulation ; les deux points de sauvegarde précédents restent dans `rescue-before-undo-1.map` et `rescue-before-undo-2.map`, donc deux annulations d'affilée ne les effacent pas. `createSubmap` écrit en plus `maps/pre-submap.map` avant le rééchantillonnage. La seule chose irréparable est la suppression du dossier.

**Pourquoi la copie d'Azgaar est-elle figée ?**
Le pont appelle les internes d'Azgaar, donc tout est épinglé sur une version (v1.154.1, `known-good.json`) et les correctifs sont gardés par leurs empreintes exactes. `npm run update` teste une version plus récente de bout en bout dans un navigateur et garde la version courante si quoi que ce soit échoue — y compris un moteur qui aurait changé sous un correctif local, ce qui arrête la mise à jour au lieu d'écraser.

**Est-ce la même chose que `mcp-for-Azgaar` ?**
Le même projet, deux dépôts : celui-ci est l'atelier (historique complet, plans, notes internes, moteur embarqué), l'autre est la publication propre. `npm run prepare-public` assemble le bundle que le compte de publication pousse ; les deux historiques ne sont jamais fusionnés, et rien n'est jamais poussé vers le compte public depuis ici.

**Pourquoi la carte ne ressemble-t-elle pas à ce que j'ai demandé ?**
Le plus souvent un calque est éteint, ou la caméra était encore zoomée. Demandez `map_view {"whole_map": true, "grid": true}` : le carroyage est libellé en unités carte, donc les chiffres d'une demande et l'image correspondent.

**Puis-je l'automatiser moi-même ?**
Oui, c'est le principe : toute nouvelle action est une nouvelle entrée dans le registre de commandes du pont (schéma + fonction), et le serveur la découvre par `map_commands` sans une ligne de code de transport à écrire. Les 24 formats d'export et les profils de calques sont des tables, pas des branchements.

**Que mesure exactement « 100 % hors ligne » ?**
`npm run compat` ouvre un vrai navigateur, génère une carte et échoue dès qu'une requête tente de sortir de la machine ; `npm run check` l'exécute dans la suite. Le job de CI lance la même suite sur un moteur d'exécution sans identifiant.

**Une analyse de sécurité qui passe veut-elle dire que le projet est sûr ?**
Non. Le scan HOL est une relecture statique, à l'échelle de la communauté, d'un bundle publié : il voit les secrets codés en dur, les actions non épinglées, les fichiers de politique manquants et les motifs d'exécution dynamique. Il ne peut pas voir qu'`allowEval` vaut faux par défaut, ni qu'un moteur embarqué est épinglé. Les constats et leur statut sont dans [SECURITY.md](SECURITY.md) ; lisez-les plutôt que le badge.

**Deux personnes ou deux agents sur un seul serveur ?**
Un serveur, une fenêtre de navigateur, une file exclusive de requêtes : les appels sont sérialisés, donc deux clients sur le même serveur se relaient au lieu d'abîmer la carte l'un de l'autre. Cela reste une bataille pour une seule carte — lancez un second serveur avec son `FMG_PORT`, son `FMG_MAPS_DIR` et son `FMG_PROFILE_DIR`.

```bash
FMG_PORT=8766 FMG_MAPS_DIR=$HOME/maps-b FMG_PROFILE_DIR=$HOME/profile-b npm start
```

**Quelle version de Node ?**
22.18 ou plus récent ; 24 et 25 sont les versions avec lesquelles le projet est vérifié. Sur un Node plus ancien, le serveur refuse de démarrer avec un message clair au lieu d'échouer au milieu de TypeScript.
