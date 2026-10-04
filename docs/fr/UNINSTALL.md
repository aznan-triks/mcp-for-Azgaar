# Guide de désinstallation et de nettoyage

Version anglaise : [UNINSTALL.md](../UNINSTALL.md).

> **Testé sur :** Windows 10 avec Google Chrome et un client MCP stdio. macOS, Linux, Microsoft Edge seul et les autres programmes d'IA cités ici suivent les mêmes standards et l'installateur est écrit pour eux, mais ils n'ont pas encore été testés.

Ce guide explique comment déconnecter mcp-for-Azgaar de vos clients d'IA, conserver vos cartes personnelles et supprimer complètement le projet de votre ordinateur.

## Étape 1 : Déconnecter des clients d'IA

Avant de supprimer le dossier du projet, retirez l'enregistrement du serveur de vos programmes d'IA afin qu'ils ne tentent pas de démarrer un outil manquant.

### Suppression automatique pour les clients utilisant des réglages JSON

Si vous avez utilisé `npm run register --write` lors de l'installation, vous pouvez supprimer le serveur automatiquement à l'aide de l'option `--remove` :

| AI Program | Command to Remove | Settings File Modified |
|---|---|---|
| Claude Desktop | `npm run register -- --desktop --remove` | `claude_desktop_config.json` |
| Cline (VS Code) | `npm run register -- --client cline --remove` | `cline_mcp_settings.json` |
| Cursor | `npm run register -- --client cursor --remove` | `~/.cursor/mcp.json` |
| Gemini CLI | `npm run register -- --client gemini --remove` | `~/.gemini/settings.json` |
| LM Studio | `npm run register -- --client lmstudio --remove` | `~/.lmstudio/mcp.json` |
| Zed | `npm run register -- --client zed --remove` | `settings.json` (`context_servers`) |

L'outil effectue une sauvegarde de votre fichier de configuration avant de le modifier (enregistrée avec l'extension `.bak-<timestamp>`).

### Suppression manuelle pour les autres programmes d'IA

Pour les programmes qui n'utilisent pas de fichiers de réglages JSON standards, supprimez l'entrée en exécutant une commande ou en modifiant le fichier de configuration à la main :

#### Claude Code (CLI)
Exécutez la commande suivante dans votre terminal :
```bash
claude mcp remove azgaar
```

#### OpenAI Codex CLI
Ouvrez `~/.codex/config.toml` dans un éditeur de texte et supprimez la section `[mcp_servers.azgaar]` :
```toml
# Delete these lines:
[mcp_servers.azgaar]
command = "..."
args = [...]
```

#### Hermes Agent (Nous Research)
Ouvrez `~/.hermes/config.yaml` dans un éditeur de texte et supprimez le bloc `azgaar` sous `mcp_servers` :
```yaml
# Delete these lines under mcp_servers:
  azgaar:
    command: "..."
    args:
      - "..."
```

#### Continue.dev
Ouvrez `~/.continue/config.yaml` dans un éditeur de texte et supprimez l'élément `azgaar` de `mcpServers` :
```yaml
# Delete this entry under mcpServers:
  - name: azgaar
    command: "..."
    args:
      - "..."
```

Après avoir supprimé la configuration, redémarrez votre application d'IA.

## Étape 2 : Conserver vos cartes et exportations (facultatif)

Le dossier du projet contient vos propres créations :

- `maps/` : contient vos fichiers de carte enregistrés (`.map`) et la dernière sauvegarde automatique de session (`autosave.map`).
- `exports/` : contient les images exportées (PNG, SVG, JPEG), les fichiers GeoJSON et les feuilles de calcul CSV générés par l'IA.

Si vous souhaitez conserver vos cartes et vos ressources exportées, copiez les dossiers `maps/` et `exports/` dans un emplacement sûr (comme votre dossier `Documents`) avant de continuer.

## Étape 3 : Supprimer le dossier du projet

Une fois les enregistrements supprimés et vos données sauvegardées :

1. Fermez toutes les copies en cours d'exécution de votre client d'IA et toute fenêtre de navigateur ouverte par l'outil.
2. Supprimez l'intégralité du dossier du projet `mcp-for-Azgaar` de votre disque.

Tous les profils de navigateur temporaires (`.browser-profile`), les fichiers sources amont téléchargés (`upstream/`) et les dépendances (`node_modules/`) sont contenus dans ce dossier et seront supprimés.

## Node.js et composants du navigateur

La suppression du dossier du projet ne désinstalle pas Node.js ni vos navigateurs web (Google Chrome ou Microsoft Edge).

- **Google Chrome / Microsoft Edge** : vous pouvez continuer à utiliser votre navigateur normalement.
- **Node.js** : si vous avez installé Node.js uniquement pour mcp-for-Azgaar et n'en avez plus besoin :
  - Sous Windows : ouvrez **Démarrer** > **Paramètres** > **Applications** > **Applications installées**, localisez **Node.js**, cliquez sur les trois points et sélectionnez **Désinstaller**.
  - Sous Windows via le terminal : exécutez `winget uninstall OpenJS.NodeJS.LTS`.
  - Sous macOS / Linux (non testé) : supprimez Node.js à l'aide de votre gestionnaire de paquets (par exemple `brew uninstall node` ou `sudo apt remove nodejs`).

## Comment mettre à jour ou réinstaller sans perdre vos cartes

Vous n'avez pas besoin de tout supprimer lors de la mise à jour ou de la réparation d'une installation.

### Mettre à jour Azgaar
Pour mettre à jour Azgaar vers la dernière version sans perdre vos cartes ni vos réglages :
1. Double-cliquez sur `update.bat` (ou exécutez `npm run update` dans un terminal).
2. L'outil de mise à jour télécharge la nouvelle version, la teste aux côtés de la version actuelle, et ne bascule que si tous les tests de compatibilité réussissent.
3. Vos dossiers `maps/` et `config/` ne sont jamais modifiés par les mises à jour.

### Réinstallation propre depuis zéro
Si vous souhaitez réinitialiser complètement le projet tout en conservant vos cartes :
1. Créez une copie de sauvegarde de votre dossier `maps/` et de votre fichier `config/fmg-mcp.json`.
2. Supprimez le dossier du projet ou exécutez `git clean -fdx` (si vous utilisez git).
3. Décompressez ou clonez une nouvelle copie de mcp-for-Azgaar.
4. Copiez votre dossier `maps/` sauvegardé et votre fichier `config/fmg-mcp.json` à la racine du nouveau projet.
5. Double-cliquez sur `install.bat` (ou exécutez `npm install` et `npm run setup`). Toutes vos cartes seront immédiatement disponibles.
