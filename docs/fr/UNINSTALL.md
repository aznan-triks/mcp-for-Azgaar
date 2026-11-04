# Retirer le projet

Rien de ce que ce projet écrit n'est nécessaire à quoi que ce soit d'autre sur la machine, et il n'écrit jamais hors de ses dossiers sauf là où vous le pointez vous-même.

## Dans le client d'IA

Retirez l'entrée du serveur : `npm run register` affiche la commande exacte pour chaque client. Pour Claude Desktop l'entrée vit dans son fichier de configuration (`claude_desktop_config.json`) ; si vous avez utilisé `npm run register -- --desktop`, une sauvegarde horodatée de ce fichier a été écrite à côté avant la modification — restaurez-la, ou supprimez seulement le bloc `mcpServers.map-of-trois`.

## Sur le disque

```bash
rm -rf <projet>            # code, serveur, pont, scripts
```

Votre travail n'est **pas** dans le projet sauf si vous l'y avez laissé :

| Quoi | Où | Survit sans le projet ? |
|---|---|---|
| Vos cartes | `maps/` dans le projet (ou `FMG_MAPS_DIR`) | oui, si vous déplacez le dossier avant |
| Sauvegarde automatique et filets de sécurité | `maps/autosave.map`, `maps/rescue-before-undo*.map`, `maps/pre-submap.map` | idem |
| Images et données exportées | `exports/` (ou `FMG_EXPORTS_DIR`) | oui |
| État de la fenêtre | `.browser-profile/` dans le projet | suppression sans risque |
| Préréglages de légende | `maps/layer-presets.json` | suppression sans risque |
| La carte elle-même, si vous avez aussi utilisé Azgaar dans un navigateur | vos fichiers `.map` | le générateur n'est pas installé par ce projet |

Le dossier de profil Chromium n'appartient qu'à ce projet : il ne touche jamais le profil, les marque-pages ni les mots de passe de votre navigateur. Supprimer le projet le supprime.

## Ce qui reste à vérifier

- Un serveur encore vivant garde une fenêtre Chrome et un port en écoute sur `127.0.0.1`. Quitter le client d'IA l'arrête ; sinon `pkill -f "scripts/start.mjs"` suffit, et la carte est sauvegardée avant l'arrêt du processus.
- Si vous avez épinglé le dossier dans un profil shell ou une tâche, retirez-le aussi. Aucun service, démon, élément de démarrage ni clé de registre n'est jamais installé.
