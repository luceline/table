# Table de jeu (v1)

Table virtuelle à 2 joueurs pour jouer avec ses propres cartes scannées. Aucune règle n'est codée : chaque joueur pioche, pose, engage, défausse et déplace ses cartes à la main, place des jetons et règle ses PI / PV.

## Contenu

```
deploy/check.sh, install.sh, update.sh      diagnostic, installation, mise à jour sur le VPS
pocketbase/
  pb_migrations/1763500000_safir_init.js   schéma (cards, decks, games, seats, marks) + règles d'accès
  pb_public/                               build prêt à servir (aucun npm nécessaire pour déployer)
web/                                       sources React/Vite
deploy/nginx-table.conf                    extrait nginx à coller dans le vhost de resgestae.fr
```

## Fonctionnement

- **Compte** : e-mail + mot de passe, pseudo affiché en partie.
- **Photos déjà détourées** (appli photo, scanner de documents) : si l'image est au format carte (63 x 88, portrait ou paysage, à 3 % près), elle est enregistrée directement, sans validation. L'import multiple traite ainsi un lot entier et ne s'arrête que sur les photos à recadrer.
- **Scan** : photo au téléphone (ou import multiple depuis la galerie), détection automatique des 4 coins, ajustement à la loupe, redressement de la perspective au format 63 x 88 mm (630 x 880 px, JPEG). Le trait bleu marque le haut de la carte. Format paysage possible.
- **Cartes jetons** : au scan, activer « Carte jeton » (le réglage reste actif pour enchaîner une série). Ces cartes ne vont pas dans le deck : elles sont rangées dans la **réserve** (onglet « Réserve » à côté de la main). Chaque glisser-déposer depuis la réserve crée une copie sur le tapis, en quantité illimitée. Une carte jeton qui quitte le tapis disparaît (retour à la réserve). Le type d'une carte déjà scannée se change dans « Mes cartes ».
- **Decks** : quantité par carte (0 à 20), plusieurs decks ; section séparée pour choisir les cartes jetons de la réserve.
- **Prêt de deck** : pour initier quelqu'un qui n'a pas de cartes, le créateur choisit « Prêter un deck à l'adversaire » avant de créer la partie. L'invité crée juste un compte, entre le code (ou ouvre le lien) et joue avec ce deck, sans rien scanner. S'il a ses propres decks, on lui demande lequel utiliser. Le prêt ne vaut que pour cette partie : rien n'est copié dans son compte.
- **Partie** : un joueur crée la partie, partage le code (ou le lien `?join=CODE`), l'autre rejoint avec son deck. Les deux deviennent visibles en temps réel.
- **Plateau** : reproduction du tapis 60 x 30 (3 territoires, Combattants, Magies, Commandant, 3 défausses, Deck, pistes PI 1-15 et PV 1-30). Le tapis adverse est affiché retourné à 180°, comme à une vraie table (son Territoire I fait face à votre Territoire III).
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
  - PI / PV : départ à PI 4 et PV 0 ; toucher une case de la piste ou utiliser les boutons − / +.
- **Mélanger** : toucher le deck, ou menu ☰ > « Mélanger mon deck ».
- **Journal** : chaque action est tracée (menu ☰), la dernière action adverse s'affiche en haut.
- Recharger la page ramène à la partie en cours.

## Architecture des données

- `games` : code, joueurs, statut ;
- `seats` : l'état de jeu de chaque joueur (un enregistrement par joueur). Chacun n'écrit que le sien : deux actions simultanées des deux joueurs ne peuvent pas s'écraser ;
- `marks` : un enregistrement par jeton, pour la même raison.

## Installation sur le VPS : https://resgestae.fr/table/

L'appli vit sous le chemin `/table/` de resgestae.fr : nginx retire ce préfixe et transmet à une instance PocketBase dédiée (port 8093 sur ce serveur), séparée de Guildes. Le reste de resgestae.fr n'est pas touché. Le build est déjà configuré pour ce chemin (`base: "/table/"` dans `vite.config.js`).

Dépôt : https://github.com/luceline/table

```bash
# 1. Vérifier le serveur (lecture seule : ports, PM2, nginx, vhost resgestae.fr, /table libre)
cd /opt && git clone https://github.com/luceline/table.git && cd table
bash deploy/check.sh

# 2. Installer (télécharge PocketBase 0.23.4, crée l'admin, lance « pb-table » dans PM2 sur 8091)
bash deploy/install.sh            # ou PORT=8092 bash deploy/install.sh si 8091 est pris
```

Pas besoin de `--origins` : appli et API sont sur la même origine (resgestae.fr), pas de CORS.

Nginx : coller le contenu de `deploy/nginx-table.conf` **dans** le bloc `server` HTTPS existant de resgestae.fr, puis `nginx -t && systemctl reload nginx`. Le certificat existant de resgestae.fr couvre déjà `/table/`, pas de certbot à relancer.

**Important pour le temps réel** : `proxy_buffering off` (déjà dans l'extrait). Sans ça, nginx retient les événements temps réel (SSE) et l'adversaire ne voit les coups qu'avec du retard.

Tableau de bord PocketBase : volontairement bloqué depuis Internet. Pour y accéder :
`ssh -L 8091:127.0.0.1:8091 root@VPS` puis ouvrir `http://localhost:8091/_/` sur ton PC.

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
VITE_PB_URL=http://127.0.0.1:8090 npm run dev   # http://localhost:5173/table/
```

## Limites de la v1 (choix assumés)

- **Confiance entre joueurs** : la main et l'ordre du deck sont masqués à l'écran, mais présents dans les données de la partie. Un joueur technique pourrait les lire via les outils du navigateur. Pour jouer entre amis, c'est suffisant ; pour du compétitif, il faudrait déplacer la pioche et le mélange côté serveur (hooks PocketBase).
- **Jetons** : si les deux joueurs modifient **le même** jeton au même instant, la dernière modification gagne (poser des jetons différents en même temps ne pose aucun problème).
- **Scans** : stockés sur ton serveur, visibles uniquement par leur propriétaire dans l'appli (et par l'invité le temps d'une partie, pour un deck prêté). Les fichiers image restent accessibles par leur URL (non devinable), nécessaire pour que l'adversaire voie les cartes posées.
- **Détection des coins** : fiable sur fond uni et contrasté. Sur nappe à motifs ou carte claire sur table claire, ajuster les coins à la main (loupe).
- Lister les parties ouvertes est possible pour tout compte connecté (nécessaire pour rejoindre par code).
