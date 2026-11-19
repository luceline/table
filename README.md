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

- **Tutoriel vidéo** : sur l'écran de connexion et en haut de l'accueil (ouvert d'office pour un compte sans cartes), versions téléphone (2 min 30) et ordinateur (1 min), celle de l'écran choisie par défaut. Fichiers dans `web/public/videos/` ; scripts de tournage dans le dossier de démo (Playwright + ffmpeg).
- **Compte** : e-mail + mot de passe, pseudo affiché en partie. Sous le formulaire, rappel pour installer l'appli sur l'écran d'accueil (Android : menu ⋮ de Chrome ; iPhone : bouton Partager de Safari uniquement). Le cas de l'appareil est mis en évidence, un iPhone ouvert dans Chrome reçoit un avertissement avec un bouton pour copier le lien ; l'encadré disparaît une fois l'appli installée.
- **Scan** : uniquement à l'appareil photo, dans l'appli (pas d'import de fichiers ni de galerie). La carte, posée sur un fond uni, est détectée en direct dans le viseur (« Carte détectée ✓ ») ; la capture est refusée si rien n'a la forme et les proportions d'une carte 63 x 88. Coins ajustables à la loupe, puis redressement au format 630 x 880 (ou paysage). Nom obligatoire, et unique dans la collection (sans tenir compte des accents ni des majuscules) : une carte déjà scannée ne peut pas l'être une seconde fois. Pour deux versions d'une même carte, ajouter un repère au nom (ex. « Shaheen UR »). L'accès à l'appareil photo demande HTTPS (ou localhost).
- **Lecture automatique** (cartes portrait) : après le redressement, le nom et ATK / Valeur / DEF sont lus dans le téléphone, sans service extérieur, puis proposés dans le formulaire à valider ou corriger. Nom : modèles PaddleOCR PP-OCRv3 (détection + reconnaissance, onnxruntime-web) ; valeurs : Tesseract, chiffres seuls, une valeur incertaine reste vide. Environ 30 Mo téléchargés au premier scan puis gardés en cache par le navigateur (fichiers dans `web/public/ocr/`, copiés par `web/scripts/ocr-assets.mjs`). Mesuré sur 13 cartes photographiées : nom exact ou à 1-4 lettres près pour 10, valeurs justes à 65 % (le reste vide, 1 erreur). Cartes paysage et UR non lues. Les valeurs sont facultatives et modifiables dans « Mes cartes ».
- **Cartes jetons** : au scan, activer « Carte jeton » (le réglage reste actif pour enchaîner une série). Ces cartes ne vont pas dans le deck : elles sont rangées dans la **réserve** (onglet « Réserve » à côté de la main). Chaque glisser-déposer depuis la réserve crée une copie sur le tapis, en quantité illimitée. Une carte jeton qui quitte le tapis disparaît (retour à la réserve). Le type d'une carte déjà scannée se change dans « Mes cartes ».
- **Decks** : 30 à 40 cartes, 2 exemplaires au plus d'une même carte (deux scans du même nom comptent ensemble). L'éditeur bloque au-delà et affiche si le deck est conforme ; un deck non conforme ne peut ni lancer ni rejoindre une partie, ni être prêté. Section séparée pour choisir les cartes jetons de la réserve (hors limite).
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
- **Journal** : toutes les actions sont tracées, y compris les jetons et marqueurs (pose, valeur, déplacement, retrait). Les actions sur le deck à surveiller sont signalées ⚠ et surlignées : consulter son deck, prendre une carte choisie dans le deck (son nom est affiché), la défausser ou la poser. Piocher la carte du dessus reste une pioche normale. Ouverture : toucher le bandeau de la dernière action en haut, menu ☰, ou onglet « 📜 Journal » sur ordinateur ; filtre « Adversaire seulement ».
- **Phases et tour** : barre Lanc. / Invoc. / Combat / Calcul au-dessus de la main. Toucher une phase hors de son tour commence un nouveau tour (compteur T1, T2… : un tour va du début de son tour au début du suivant). « Fin ⏎ » passe la main : l'adversaire voit « À vous de jouer ». La phase de chacun s'affiche sous son nom, à côté des PI/PV (Combat en rouge).
- **Flèches** : toucher une de ses cartes en jeu > « ⚔ Attaquer » (rouge) ou « 🎯 Cibler » (bleu), puis toucher la cible : carte adverse ou à soi, zone d'un territoire, ou compteur PI/PV de l'adversaire. Attaque combinée : une flèche par attaquant vers la même cible, elles s'écartent automatiquement. Effacées au passage en phase Calcul, en fin de tour, avec « ✕ n » dans la barre des phases, ou carte par carte.
- **Signaler une carte** : appui long sur n'importe quelle carte en jeu (à soi ou adverse) : elle clignote en jaune chez les deux joueurs avec un message. Aussi via « 📍 Signaler » dans la fiche de la carte.
- **Unification** : badge UNIF à côté des PI/PV, chaque toucher passe au niveau suivant (– , 1, 2, 3) avec le rappel du bonus. Visible par l'adversaire dès le niveau 1.
- **Marqueurs de territoire** : « ＋ Marqueur » : Gel, Bloqué, Silence, Immunité, Bonus, Malus ou texte libre, avec une valeur (ex. tours restants) et une couleur, posé sur le territoire choisi. Toucher pour modifier la valeur ou le retirer, glisser pour déplacer, glisser hors du tapis pour retirer.
- **Tchat** : bouton 💬 (pastille rouge = messages non lus). Réponses rapides en un geste (OK, Attends, Je réagis, Riposte ?, Vol vie ?, À toi, Bien joué !) ou texte libre. Le dernier message adverse apparaît 5 s en bulle sur son tapis.
- **Jouer face cachée** : toucher une carte de la main > « Poser face cachée » : elle va dans le premier emplacement Magie libre, face cachée (l'adversaire ne voit que le dos, le journal ne donne pas son nom). La glisser ensuite où on veut ; « Révéler » dans sa fiche la retourne.
- **Mulligan** : toucher le deck > « Mulligan » (ou menu ☰) : choisir les cartes à renvoyer, le deck est mélangé et on repioche le même nombre.
- **Pile ou face** : menu ☰, résultat visible des deux côtés dans le journal.
- **Règles** : bouton 📖 en haut. Aide-mémoire rédigé à partir de « Nos Règles s3 » (bases, préparation, phases, barème PI/PV, compétences, unification, mots-clés), avec recherche sans accents ni majuscules et raccourcis par section. Sur ordinateur il s'ouvre dans un onglet de la colonne de droite, à côté de la main, pour garder le plateau visible ; sur téléphone dans un panneau. Le texte est dans `web/src/lib/rules.js` pour le corriger ou le compléter.
- **Ordinateur** : colonne de droite plus large (30 % de l'écran), main en grille de 3 grandes cartes, boutons et phases agrandis.
- **Victoire** : un écran s'affiche chez les deux joueurs dès qu'un joueur atteint 30 PV.
- Recharger la page ramène à la partie en cours.

## Architecture des données

- `games` : code, joueurs, statut ;
- `seats` : l'état de jeu de chaque joueur (un enregistrement par joueur). Chacun n'écrit que le sien : deux actions simultanées des deux joueurs ne peuvent pas s'écraser ;
- `marks` : un enregistrement par jeton ou marqueur de territoire (champ `label`), pour la même raison ;
- `messages` : le tchat de la partie (lecture par les deux joueurs, chacun n'écrit qu'en son nom).

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
