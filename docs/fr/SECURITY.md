# Sécurité

Ce que ce projet peut faire et ne peut pas faire, dit simplement, et ce qu'un scanner en pense.

## Ce qui s'exécute, et où

Le serveur est un processus Node local. Il ouvre une fenêtre Chromium, sert la copie épinglée d'Azgaar en HTTP sur `127.0.0.1`, et pilote cette fenêtre. La carte que vous voyez et modifiez vit dans cette fenêtre ; l'IA n'a aucun accès shell.

- **Rien ne sort de la machine.** La page devrait normalement charger ~40 polices depuis un CDN et vérifier les mises à jour : les polices sont embarquées et l'extérieur est refusé. `npm run compat` échoue dès qu'une requête externe est tentée, et `map_status` liste ce qui a été bloqué.
- **Le serveur HTTP local n'a aucune authentification**, parce qu'il est lié à l'interface de bouclage. Gardez-le ainsi : `server.host` sert au débogage, et exposer le port revient à exposer un navigateur qui peut modifier votre carte. Le serveur affiche un avertissement au démarrage si `server.host` n'est pas une adresse de bouclage.
- **`map_file load` accepte des chemins absolus** vers des fichiers `.map`, car on range souvent ses cartes hors du projet. Il suit les liens mais refuse celui qui aboutit à un fichier qui n'est pas un `.map`, refuse tout ce qui n'est pas un fichier ordinaire, et refuse un fichier plus gros que `limits.mapFileBytesMax`. Il ne peut pas lire d'autres types de fichiers.
- **Fichiers** : lecture et écriture restent dans les dossiers `maps/`, `exports/` et le profil du projet par défaut. `map_file {path}` et un `FMG_EXPORTS_DIR` personnel sont les deux sorties volontaires, chacune nommée par l'appelant. Un nom passé à `map_file {name}` est assaini (pas de séparateur de chemin, pas de `..`).

## Ce que l'IA a le droit de faire

`map_apply` n'exécute que les commandes enregistrées par le pont, chacune avec un schéma typé validé avant toute mutation. Deux interrupteurs comptent :

- `allowEval` (désactivé par défaut) active `map_eval`, qui évalue du JavaScript **dans la page de la carte**. C'est la trappe de l'outillage : elle peut faire tout ce que l'interface Azgaar peut faire, et prend d'abord un instantané d'annulation. Ne l'activez que si vous le voulez, et rappelez-vous que l'historique d'annulation et la sauvegarde automatique sont votre filet de sécurité.
- Les commandes destructrices demandent une confirmation : `createSubmap` refuse de tourner sans `confirmDestructiveResample: true`, et la carte parente est écrite dans `maps/pre-submap.map` avant le rééchantillonnage. `map_undo` la rend.

Le texte qui ressort de la carte (notes, chronique du monde, noms) est **une donnée, pas une consigne**. Les notes sont nettoyées dans la page avant stockage : tout élément hors du sous-ensemble de l'éditeur de notes, tout gestionnaire `on*` et toute URL `javascript:` sont retirés, et le résultat est une nouvelle fois filtré par `isSafeHtml` d'Azgaar. Un client qui lit `fmg://map/notes` reçoit ce texte nettoyé ; il doit quand même le traiter comme du contenu à décrire, pas comme un ordre.

Les annotations d'outil (`readOnlyHint`, `destructiveHint`, …) indiquent à un client ce qu'un outil a tendance à faire. Ce sont des indications, pas des permissions : aucune partie du serveur ne les lit.

## Constats du scanner

Le bundle clean-room est analysé par le HOL Plugin Scanner (`hol-guard` 3.0.123, profil `default`, la version que le workflow épingle). Dernière mesure sur cette branche, sur `.public-export/` : **88/100** (note Good), 0 critique, 1 élevé, 0 moyen, 1 faible, avec `policy_pass` et `verify_pass` à vrai. Le critère du catalogue est une analyse terminée avec un score normalisé >= 80 et chaque constat corrigé **ou documenté** ; `.github/workflows/scanner.yml` lance exactement cela à chaque push et pull request (vérifié vert sur un runner GitHub : la porte catalogue est passée sur le bundle de cette branche en 33 s, le job advisory plus strict a signalé son résultat sans bloquer l'exécution, et le job de compatibilité a lancé la suite complète en 12 m 40 s), et `npm run prepare-public` refuse de produire un bundle qui laisserait fuiter une identité privée, un chemin personnel ou un identifiant. Rapport complet : `audits/scanner-public-export.json` (généré, non committé).

| Constat | Où | Statut |
|---|---|---|
| `DANGEROUS_DYNAMIC_EXECUTION` (élevé) pour `map_eval` | `server/tools.ts` | Documenté, conservé : filtré par `allowEval` (faux par défaut), la page de carte est la seule cible, un instantané d'annulation est pris avant, et l'outil est nommé comme trappe dans les instructions au client. Le supprimer effacerait une capacité documentée pour satisfaire une règle statique incapable de voir la condition. |
| `DANGEROUS_DYNAMIC_EXECUTION` (élevé) dans un test navigateur | `test/bridge.smoke.mjs` | Corrigé : la source de la sonde est passée à `page.evaluate` comme expression, le bundle de tests ne contient donc plus aucun appel à `eval`. Le comportement testé reste le même. |
| `LICENSE_MISSING` (faible) à la racine du bundle | `LICENSE` | Documenté, ouvert : l'atelier ne publie volontairement pas de licence, ce choix appartient au compte qui publie. Le bundle le dit dans `PUBLISHING.md`, et le champ du manifeste reprendra la licence retenue. |
| Évaluation dynamique dans le moteur épinglé (D3, deux éditeurs, le runtime assistant) | `vendor/azgaar/**` | Pas dans le bundle : `npm run prepare-public` publie l'overlay (`overlay/agent/`), pas une copie d'Azgaar. Dans l'atelier, ces appels sont le code de l'amont lui-même, épinglé par empreinte. |
| Chaînes candidates à un secret dans une build vendored du SDK Dropbox et un test amont | `vendor/azgaar/**` | Non publié, et aucun matériau de secret de ce projet n'est recopié dans le bundle : l'analyse de l'export n'en signale aucun. |

Le manifeste `.claude-plugin/plugin.json` est ce qui satisfait les contrôles d'écosystème (nom, semver, chemins relatifs, hooks analysables : 18 points sur 18). Ce qui n'est **volontairement pas** fait, parce que ce serait tromper le scanner plutôt que sécuriser le projet : obscurcir les appels à `eval`, supprimer ou exempter des règles, modifier le moteur épinglé pour éviter un constat, ou annoncer un score qui n'a pas été mesuré.

## Signalement

Voir [SECURITY.md](../../SECURITY.md) à la racine du dépôt pour la façon de signaler une vulnérabilité et les versions suivies.
