# Foire Aux Questions (FAQ)

Version anglaise : [FAQ.md](../FAQ.md).

> **Testé sur :** Windows 10 avec Google Chrome et un client MCP stdio. macOS, Linux, Microsoft Edge seul et les autres programmes d'IA mentionnés ici suivent les mêmes standards et l'installateur est conçu pour eux, mais ils n'ont pas encore été testés.

Réponses courtes aux questions fréquentes sur mcp-for-Azgaar.

---

### 1. Qu'est-ce que mcp-for-Azgaar ?
C'est une passerelle qui connecte votre assistant IA (tel que Claude, Cline ou Cursor) à Azgaar's Fantasy Map Generator. Elle permet à une IA d'afficher, d'analyser et de modifier des cartes fantastiques dans un vrai navigateur web sous vos yeux pendant que vous participez.

### 2. Est-ce gratuit ?
Oui. Azgaar's Fantasy Map Generator et cette passerelle sont tous deux des logiciels libres et gratuits. Vous n'avez besoin d'aucun abonnement, compte ou clé d'API pour exécuter ce serveur.

### 3. Fonctionne-t-il entièrement hors ligne ?
Oui. Une fois installé, le générateur de cartes fonctionne entièrement sur votre machine locale grâce à un serveur web interne. Le profil du navigateur bloque toutes les requêtes réseau vers l'extérieur. Rien de votre carte n'est jamais envoyé sur Internet.

### 4. Quels programmes d'IA puis-je utiliser ?
Il fonctionne avec tout programme prenant en charge le Model Context Protocol (MCP) sur l'entrée/sortie standard (`stdio`). Des réglages prêts à l'emploi sont fournis pour Claude Desktop, Claude Code, Cline, Cursor, Gemini CLI, LM Studio, OpenAI Codex CLI, Nous Research Hermes Agent, Continue.dev et Zed ; seul un client MCP stdio sous Windows 10 a été testé jusqu'à présent, les autres suivant le même standard. Voir [README.md](../../README.fr.md) pour les détails d'installation.

### 5. Quels modèles d'IA fonctionnent avec cet outil ?
Tout modèle capable d'appeler des outils (aussi appelé appel de fonctions ou tool calling) peut utiliser ce serveur. Cela inclut les modèles Anthropic Claude, les modèles OpenAI GPT-4, Google Gemini, DeepSeek ainsi que les modèles ouverts locaux exécutés via LM Studio ou Ollama.

### 6. Quels systèmes d'exploitation sont pris en charge ?
Il est conçu pour Windows 10/11, macOS et Linux. Seul Windows 10 (avec Chrome) a été testé jusqu'à présent. Sous Windows, double-cliquez sur `install.bat` ; sous macOS et Linux, lancez `./install.sh` (pas encore testé).

### 7. En quoi est-ce différent d'utiliser directement le site d'Azgaar ?
Le site web exige de cliquer sur chaque bouton et d'ajuster chaque frontière à la main. Avec mcp-for-Azgaar, vous pouvez exprimer ce que vous souhaitez à une IA avec des mots simples (par exemple, « fusionne ces deux États » ou « crée une chaîne de montagnes »), et l'IA effectue les calculs exacts sous vos yeux. Vous gardez toujours le contrôle total pour modifier la carte à la main dans la même fenêtre de navigateur à tout moment.

### 8. Puis-je utiliser mes fichiers `.map` existants créés sur le site ?
Oui. Copiez tout fichier `.map` créé sur le site web d'Azgaar dans le dossier `maps/` de ce projet. Vous pouvez ensuite demander à votre assistant IA de le charger par son nom avec `map_file load`.

### 9. Cela modifie-t-il ou écrase-t-il le code original d'Azgaar ?
Non. Azgaar est téléchargé dans le dossier `upstream/azgaar/` lors de l'installation. La passerelle applique des correctifs à un petit ensemble de fonctions selon des motifs pour qu'elles puissent être exportées, et ajoute les fichiers de la passerelle dans un dossier distinct. Le dépôt d'origine n'est jamais modifié directement.

### 10. Comment les mises à jour sont-elles gérées et comment la compatibilité est-elle préservée ?
Vous pouvez mettre à jour Azgaar à tout moment en double-cliquant sur `update.bat` ou en exécutant `npm run update`. Le programme de mise à jour télécharge la nouvelle version, applique les correctifs et exécute un test de compatibilité (`scripts/compat.mjs`). Si un test échoue, il effectue automatiquement un retour arrière vers votre version fonctionnelle actuelle sans casser votre installation.

### 11. Qu'est-ce que la version `--known-good` ?
`known-good.json` stocke la version exacte d'Azgaar par rapport à laquelle tous les outils et tests automatisés ont été vérifiés. Si une mise à jour expérimentale cause des problèmes, exécuter `npm run update -- --known-good` vous ramène à cette base stable.

### 12. L'IA peut-elle casser ou détruire ma carte ?
Non. Chaque commande de modification crée automatiquement un instantané de sauvegarde de votre carte avant d'appliquer les changements. Si une modification échoue en cours de route, le serveur restaure automatiquement la carte. De plus, vous pouvez annuler n'importe quelle modification en disant à l'IA « Annule ça ».

### 13. Comment fonctionne l'annulation ?
Lorsque l'IA appelle `map_undo`, le serveur restaure l'état précédent de la carte et recharge la fenêtre du navigateur (ce qui prend environ deux secondes). Jusqu'à 30 étapes d'édition passées sont conservées sous forme de fichiers de carte complets sur le disque, dans `maps/history/` (ce nombre correspond à `history.maxEntries` dans la configuration).

### 14. Où sont stockés mes cartes sauvegardées et mes fichiers exportés ?
- Les cartes sauvegardées sont stockées dans le dossier `maps/` sous forme de fichiers `.map`.
- Les images exportées (PNG, JPEG, SVG) et les fichiers de données (GeoJSON, JSON, CSV) sont stockés dans le dossier `exports/`.

### 15. Comment fonctionne la sauvegarde automatique ?
La carte est automatiquement enregistrée toutes les 60 secondes et après chaque modification réussie dans `maps/autosave.map`. Lorsque vous redémarrez le serveur ou rouvrez votre assistant IA, votre dernière carte se recharge automatiquement.

### 16. Deux assistants IA peuvent-ils utiliser l'outil en même temps ?
Non. Un seul programme d'IA doit se connecter au serveur à la fois. Plusieurs programmes exécutés simultanément entreraient en conflit pour le même port local (8765) et le même profil utilisateur de navigateur.

### 17. Cela fonctionne-t-il sur smartphone ou tablette ?
Non. Le serveur nécessite Node.js, Google Chrome ou Microsoft Edge, et un système d'exploitation pour ordinateur de bureau (Windows, macOS ou Linux).

### 18. Quels sont les performances sur les grandes cartes avec beaucoup de cellules ?
Les cartes standard (environ 10 000 cellules) répondent rapidement en une à deux secondes. Les très grandes cartes (plus de 20 000 cellules) nécessitent davantage de calculs pour les polygones frontaliers et les recalculs de Voronoi, ce qui peut prendre plusieurs secondes par modification.

### 19. Que ne peut PAS faire l'IA ?
L'IA ne peut pas dessiner de coups de pinceau à main levée à la souris (elle utilise à la place des formes géométriques de précision et des algorithmes de terrain), ne peut pas exécuter de vues en globe 3D, et ne peut pas accéder aux sauvegardes dans le nuage d'Azgaar ni à sa discussion web intégrée. Pour le détail complet de tous les outils disponibles, voir [TOOLS.md](../TOOLS.md) et [COMMANDS.md](../COMMANDS.md).

### 20. Puis-je continuer à cliquer et à modifier la carte à la main tout en discutant avec l'IA ?
Oui. Vous pouvez cliquer sur la carte, ouvrir les éditeurs, modifier les paramètres des calques et déplacer les marqueurs avec votre souris. La sauvegarde automatique périodique enregistre vos modifications manuelles pour que l'IA voie toujours l'état actuel.

### 21. Puis-je utiliser un modèle d'IA qui ne peut pas voir les images ?
Oui. Si votre modèle ne peut pas traiter les captures d'écran, vous pouvez enregistrer votre client avec `npm run register -- --text-only`. Le serveur fournit alors des aperçus de la carte dessinés avec des caractères textuels au lieu de captures d'écran sous forme d'images. Des vues texte individuelles peuvent également être demandées avec `map_view` en utilisant `text_map: true`.

### 22. Puis-je faire tourner le navigateur en arrière-plan sans fenêtre visible ?
Oui. Dans `config/fmg-mcp.json`, réglez `"headless": true` sous `"browser"`, ou définissez la variable d'environnement `FMG_HEADLESS=1`. Le navigateur fonctionne de manière invisible pendant que l'IA voit toujours la carte via des captures d'écran internes.

### 23. Pourquoi l'IA met-elle parfois deux secondes à répondre après une modification ?
Lorsqu'une modification affecte le territoire, les côtes ou le relief, Azgaar recalcule les étiquettes, les statistiques des pays et les calques visuels. Le serveur attend un court délai de stabilisation (200 millisecondes par défaut) pour s'assurer que le rendu graphique est terminé avant de prendre une capture d'écran.

### 24. Sous quelle licence open source ce projet est-il publié ?
mcp-for-Azgaar est distribué sous licence MIT. Azgaar's Fantasy Map Generator est également sous licence MIT.

### 25. Comment contribuer ou signaler un bug ?
Vous pouvez signaler des bugs ou proposer des améliorations sur GitHub à l'adresse [https://github.com/aznan-triks/mcp-for-Azgaar/issues](https://github.com/aznan-triks/mcp-for-Azgaar/issues). Pour les étapes de dépannage avant d'ouvrir un ticket, consultez [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

### 26. Comment désinstaller mcp-for-Azgaar ?
1. Supprimez l'enregistrement du serveur dans votre programme d'IA en exécutant :
   ```bash
   npm run register -- --client desktop --remove
   ```
   (Remplacez `desktop` par le nom de votre client, comme `cline` ou `cursor`).
2. Supprimez le dossier `mcp-for-Azgaar` de votre ordinateur. Aucun service d'arrière-plan ni fichier système ne subsiste. Pour des instructions étape par étape, voir [UNINSTALL.md](UNINSTALL.md).

### 27. Où puis-je trouver plus d'exemples et de détails sur les commandes ?
- Pour des recettes d'invites pratiques, voir [USAGE-EXAMPLES.md](USAGE-EXAMPLES.md).
- Pour la liste complète des paramètres de chaque outil, voir [TOOLS.md](../TOOLS.md).
- Pour toutes les commandes de modification et formes de sélection, voir [COMMANDS.md](../COMMANDS.md).
- Pour les réglages du serveur et du navigateur, voir [CONFIGURATION.md](CONFIGURATION.md).
- Pour les garanties hors ligne et les règles de sécurité, voir [SECURITY.md](SECURITY.md).
- Pour les détails de l'architecture interne, voir [ARCHITECTURE.md](../ARCHITECTURE.md).
- Pour le dépannage et les diagnostics, voir [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
- Pour les instructions de désinstallation, voir [UNINSTALL.md](UNINSTALL.md).
