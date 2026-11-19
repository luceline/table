# Table de jeu (v1)

Table virtuelle à 2 joueurs pour jouer avec ses propres cartes scannées. Aucune règle n'est codée : chaque joueur pioche, pose, engage, défausse et déplace ses cartes à la main, place des jetons et règle ses PI / PV.

## Contenu

```
deploy/check.sh, install.sh, update.sh      diagnostic, installation, mise à jour sur le VPS
pocketbase/
  pb_migrations/1763500000_safir_init.js   schéma (cards, decks, games, seats, marks) + règles d'accès
  pb_public/                               build prêt à servir (aucun npm nécessaire pour déployer)
web/                                       sources React/Vite
deploy/nginx-table.conf                    vhost nginx de table.resgestae.fr
deploy/nginx-resgestae.conf                vhost de resgestae.fr avec la redirection de /table
```

## Fonctionnement

- **Compte** : e-mail + mot de passe, pseudo affiché en partie.
- **Import des scans du téléphone** (« Importer des photos ») : chaque image est considérée comme déjà détourée et mise directement au format de jeu, 630 x 880 (ou 880 x 630 si elle est plus large que haute), sans validation. Réglage « Scans déjà détourés » désactivable : seules les images déjà au format carte (à 3 % près) passent alors directement, les autres vont au recadrage. « Prendre une photo » passe toujours par la détection des coins, sauf si la photo est déjà au format carte.
- **Scan** : photo au téléphone (ou import multiple depuis la galerie), détection automatique des 4 coins, ajustement à la loupe, redressement de la perspective au format 63 x 88 mm (630 x 880 px, JPEG). Le trait bleu marque le haut de la carte. Format paysage possible.
- **Cartes jetons** : au scan, activer « Carte jeton » (le réglage reste actif pour enchaîner une série). Ces cartes ne vont pas dans le deck : elles sont rangées dans la **réserve** (onglet « Réserve » à côté de la main). Chaque glisser-déposer depuis la réserve crée une copie sur le tapis, en quantité illimitée. Une carte jeton qui quitte le tapis disparaît (retour à la réserve). Le type d'une carte déjà scannée se change dans « Mes cartes ».
- **Decks** : quantité par carte (0 à 20), plusieurs decks ; section séparée pour choisir les cartes jetons de la réserve.
- **Prêt de deck** : pour initier quelqu'un qui n'a pas de cartes, le créateur choisit « Prêter un deck à l'adversaire » avant de créer la partie. L'invité crée juste un compte, entre le code (ou ouvre le lien) et joue avec ce deck, sans rien scanner. S'il a ses propres decks, on lui demande lequel utiliser. Le prêt ne vaut que pour cette partie : rien n'est copié dans son compte.
- **Partie** : un joueur crée la partie, partage le code (ou le lien `?join=CODE`), l'autre rejoint avec son deck. Les deux deviennent visibles en temps réel.
- **Plateau** : reproduction du tapis 60 x 30 (3 territoires, Combattants, Magies, Commandant, 3 défausses, Deck). Les pistes PI/PV imprimées sont remplacées par de grands compteurs à côté de chaque tapis (bandeau en portrait, colonne en paysage), avec − / + pour son propre côté.
- **Loupe** : le bouton 🔍 en coin de chaque tapis l'affiche seul en plein écran, avec − / + pour zoomer davantage ; « Les 2 tapis » (ou ⤡) revient à la vue d'ensemble. On peut continuer à jouer en mode loupe. Le tapis adverse est affiché retourné à 180°, comme à une vraie table (son Territoire I fait face à votre Territoire III).
- **Chacun son côté** : un joueur n'agit que sur son propre tapis (cartes, jetons, PI/PV, piles). Côté adversaire, il peut seulement regarder : toucher une carte visible pour l'agrandir, consulter ses défausses. Les jetons sont aussi protégés côté serveur.
- **Gestes** :
  - glisser une carte de la main vers le tapis : elle s'aimante sur l'emplacement visé (ou reste où on la lâche hors emplacement) ;
  - glisser une carte de la main ou du tapis vers une défausse pour la défausser, vers le deck pour la remettre dessus, ou du tapis vers la main ;
  - montrer une carte : toucher la carte en main, puis « Montrer à l'adversaire ». Elle s'ouvre en grand chez lui, sans quitter votre main ;
  - glisser le dessus du deck vers la main = piocher, vers le tapis = pose face cachée ;
  - toucher une carte : aperçu en grand + actions (engager, face cachée, défausses, dessus/dessous du deck…) ;
  - toucher une défausse : voir son contenu (la sienne ou celle de l'adversaire) ;
  - toucher le deck : piocher 1/3/5/7, mélanger, chercher une carte ;
  - jetons (compteurs de couleur) : glisser une couleur sur une de ses cartes. Le jeton s'accroche à la carte : plusieurs par carte, ils suivent la carte quand elle bouge ou s'engage, et disparaissent quand elle quitte le tapis. Lâché hors carte, il reste libre sur le tapis. Toucher pour +/− ou changer de couleur, glisser hors des tapis pour le retirer ;
  - PI / PV : départ à PI 4 et PV 0 ; boutons − / + du compteur à côté de son tapis.
- **Mélanger** : toucher le deck, ou menu ☰ > « Mélanger mon deck ».
- **Journal** : chaque action est tracée (menu ☰), la dernière action adverse s'affiche en haut.
- Recharger la page ramène à la partie en cours.

## Architecture des données

- `games` : code, joueurs, statut ;
- `seats` : l'état de jeu de chaque joueur (un enregistrement par joueur). Chacun n'écrit que le sien : deux actions simultanées des deux joueurs ne peuvent pas s'écraser ;
- `marks` : un enregistrement par jeton, pour la même raison.

## Installation sur le VPS : https://table.resgestae.fr

La table a son propre sous-domaine et sa propre instance PocketBase (port 8093), séparée de Res Gestae et de Guildes : pas de service worker, de connexion ni de cache partagés. Les anciens liens `resgestae.fr/table` sont redirigés.

1. DNS : enregistrement `A` `table` -> IP du serveur.
2. Dépôt : `cd /opt && git clone https://github.com/luceline/table.git && cd table`, puis `PORT=8093 bash deploy/install.sh` (déjà fait sur le serveur actuel).
3. Nginx : `cp deploy/nginx-table.conf /etc/nginx/sites-available/table`, lien dans `sites-enabled`, `nginx -t && systemctl reload nginx`, puis `certbot --nginx -d table.resgestae.fr`.
4. Redirection des anciens liens : `deploy/nginx-resgestae.conf` remplace `/etc/nginx/sites-available/resgestae`.

Tableau de bord PocketBase : volontairement bloqué depuis Internet. Pour y accéder :
`ssh -L 8093:127.0.0.1:8093 root@VPS` puis ouvrir `http://localhost:8093/_/` sur ton PC.

## Mise à jour

Sur ton PC : modifier, `cd web && npm run build`, copier `web/dist/*` dans `pocketbase/pb_public/` (après l'avoir vidé), commit, push. Puis sur le VPS :

```bash
cd /opt/table && bash deploy/update.sh
```

`git pull` remplace proprement les fichiers : pas de vieux bundles qui traînent. Pas de service worker non plus : un rechargement de page suffit.

## Développement local

```bash
cd pocketbase && ./pocketbase serve            # port 8090, migrations appliquées au démarrage
cd web && npm install
VITE_PB_URL=http://127.0.0.1:8090 npm run dev   # http://localhost:5173
```

## Limites de la v1 (choix assumés)

- **Confiance entre joueurs** : la main et l'ordre du deck sont masqués à l'écran, mais présents dans les données de la partie. Un joueur technique pourrait les lire via les outils du navigateur. Pour jouer entre amis, c'est suffisant ; pour du compétitif, il faudrait déplacer la pioche et le mélange côté serveur (hooks PocketBase).
- **Jetons** : si les deux joueurs modifient **le même** jeton au même instant, la dernière modification gagne (poser des jetons différents en même temps ne pose aucun problème).
- **Scans** : stockés sur ton serveur, visibles uniquement par leur propriétaire dans l'appli (et par l'invité le temps d'une partie, pour un deck prêté). Les fichiers image restent accessibles par leur URL (non devinable), nécessaire pour que l'adversaire voie les cartes posées.
- **Détection des coins** : fiable sur fond uni et contrasté. Sur nappe à motifs ou carte claire sur table claire, ajuster les coins à la main (loupe).
- Lister les parties ouvertes est possible pour tout compte connecté (nécessaire pour rejoindre par code).
