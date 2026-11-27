// Nouveautés montrées aux joueurs à leur prochaine connexion après une mise à jour.
// À chaque mise à jour, ajouter une entrée EN TÊTE de liste avec le numéro suivant (id) : la fenêtre s'affiche une fois
// par joueur (mémorisé sur son compte), avec les entrées qu'il n'a pas encore vues (3 au plus).
// tcg : "safir", "fab" ou "sorcery" pour une nouveauté propre à un jeu (montrée seulement à ce jeu), absent = pour tous.
export const NEWS = [
  {
    id: 115,
    date: "28 novembre 2026",
    items: [
      { t: "🧪 Prototype Héros : plateau de test du jeu maison (réserve de quêtes, quête active, 7 emplacements d'équipement, fiche de héros), cartes et decks de démo générés depuis la Référence v0.2.", tcg: "heros" },
    ],
  },
  {
    id: 114,
    date: "27 novembre 2026",
    items: [
      { t: "💬 Salons sur grand écran : la colonne de droite fait la hauteur de l'accueil, les derniers messages s'affichent en bas et on remonte pour lire les plus anciens, comme sur Discord. Fini la discussion qui s'allonge sans fin." },
      { t: "🖥 Grand écran : l'accueil et les salons prennent toute la largeur, et l'onglet Jouer passe sur deux colonnes quand il y a la place." },
    ],
  },
  {
    id: 113,
    date: "27 novembre 2026",
    items: [
      { t: "🌐 Netrunner rejoint la liste des jeux. Il se joue sur jinteki.net (gratuit, toutes les cartes) : ici, retrouvez les joueurs francophones avec ses salons, ses salons vocaux, les disponibilités et la carte des joueurs (cochez « Netrunner » dans Personnalisation, Ma ville)." },
    ],
  },
  {
    id: 112,
    date: "26 novembre 2026",
    items: [
      { t: "↷ Fiche d'une carte posée : « Engager / Dégager » et « Face cachée / Révéler » sont maintenant tout en haut, plus besoin de faire défiler." },
      { t: "🎲 Menu ☰ : dé à 6 faces, dé à 20 faces (résultat dans le journal) et « Dégager toutes mes cartes »." },
      { t: "👁 Deck : « Révéler la carte du dessus » la montre à l'adversaire, sans la piocher." },
    ],
  },
  {
    id: 111,
    date: "26 novembre 2026",
    items: [
      { t: "🪙 Jetons : un jeton détruit va dans la défausse de son territoire (I, II ou III) et y reste, pour les cartes qui en tiennent compte. Il disparaît seulement à la fin de la partie (« Nouvelle partie »), ou s'il part en main ou dans le deck.", tcg: "safir" },
    ],
  },
  {
    id: 110,
    date: "25 novembre 2026",
    items: [
      { t: "🎯 Fiche d'une carte : choisissez « Combattant », « Magie », « Face cachée » (toujours en Magie) ou « Défausse », puis le territoire I, II ou III. La carte va sur un emplacement libre du territoire choisi.", tcg: "safir" },
    ],
  },
  {
    id: 109,
    date: "25 novembre 2026",
    items: [
      { t: "🗂️ Cartes empilées sur le plateau : elles se décalent pour laisser voir le nom de chacune, avec le nombre de cartes sur celle du dessus. Touchez la pile : la fiche montre toutes les cartes, de dessous à dessus. Touchez celle que vous voulez pour la déplacer, la retirer, ou la mettre sur le dessus / sous la pile. Sur une pile adverse, vous pouvez voir chaque carte." },
    ],
  },
  {
    id: 108,
    date: "25 novembre 2026",
    items: [
      { t: "🪙 Cartes jetons (Flesh and Blood, Sorcery) : un jeton qui quitte le plateau (renvoyé en main, sur le deck ou dans une pile) disparaît du jeu au lieu de rester mélangé à vos cartes. Les jetons égarés dans un deck ou une main lors des parties précédentes sont retirés d'office." },
    ],
  },
  {
    id: 107,
    date: "25 novembre 2026",
    items: [
      { t: "🪑 Tables ouvertes : en touchant « S'asseoir », vous choisissez maintenant votre deck (ou le deck prêté, ou vos cartes filmées) avant de rejoindre. L'appli propose d'office un deck conforme." },
    ],
  },
  {
    id: 106,
    date: "25 novembre 2026",
    items: [
      { t: "🗺️ Sorcery : le royaume a son propre fond, une carte ancienne, le même pour les deux joueurs (votre tapis personnalisé ne s'y applique pas).", tcg: "sorcery" },
      { t: "🔢 Les cases sont numérotées de 1 à 20, identiques pour les deux joueurs, et le journal les cite : « joue le site sur la case 7 ».", tcg: "sorcery" },
      { t: "❤️ La vie s'affiche en grand dans un cadre rouge, le mana en « disponible / total » (1 par site) et vos seuils dans les 4 éléments sous votre nom.", tcg: "sorcery" },
      { t: "🚫 Nouvelle pile « Bannies » à côté du cimetière (bouton « Bannir » sur une carte). Grimoire et atlas affichent leur nom et un compteur plus lisible.", tcg: "sorcery" },
    ],
  },
  {
    id: 105,
    date: "25 novembre 2026",
    items: [
      { t: "📋 Éditeur de deck (les trois jeux) : sur ordinateur, l'écran est partagé, les cartes à gauche et la liste du deck à droite (nom, ×1, ×2, − et +) pour voir d'un coup d'œil ce qu'il contient. Sur téléphone, bouton « 📋 Liste du deck » en bas." },
      { t: "🔍 Toucher une carte l'ouvre en grand pour lire son effet (et l'agrandir encore) : elle ne s'ajoute plus au deck par erreur. Seuls les boutons − et + ajoutent ou retirent." },
    ],
  },
  {
    id: 104,
    date: "25 novembre 2026",
    items: [
      { t: "🔮 Nouveau jeu : Sorcery: Contested Realm ! Choisissez « Sorcery » en haut de l'accueil. Scannez avatar, sites et sorts (type, rareté, éléments), construisez votre deck (grimoire de 60, atlas de 30, exemplaires selon la rareté) et jouez sur le royaume de 5 x 4 cases, partagé par les deux joueurs. Règles en français dans « 📖 Règles »." },
      { t: "⚙️ En partie Sorcery : un site posé pendant votre tour donne 1 mana d'office, « Début » redresse vos cartes et règle le mana sur votre nombre de sites, et vos sites et votre affinité s'affichent sous vos compteurs. Le royaume étant partagé, Sorcery se joue sans cartes filmées." },
      { t: "🗺 Carte des joueurs : un point vert signale les joueurs en ligne en ce moment, et il est précisé que la carte n'est visible que des joueurs inscrits (pas du public)." },
    ],
  },
  {
    id: 103,
    date: "24 novembre 2026",
    tcg: "fab",
    items: [
      { t: "💎 Ressources automatiques : poser une carte dans la zone de pitch ajoute d'office sa valeur au compteur RES (rouge 1, jaune 2, bleu 3, d'après la couleur renseignée au scan). Reprise en main par erreur, elle est retirée. Le journal l'indique, et − / + restent là pour corriger. Valable pour les nouvelles parties." },
    ],
  },
  {
    id: 102,
    date: "23 novembre 2026",
    items: [
      { t: "🗺 Carte des joueurs : chacun ne voit plus que les joueurs de son jeu. Dans Personnalisation › Ma ville, indiquez « Je joue à » Safir Cards, Flesh and Blood ou les deux (par défaut, d'après vos decks)." },
    ],
  },
  {
    id: 101,
    date: "23 novembre 2026",
    items: [
      { t: "⚙️ Onglet Personnalisation réorganisé : d'abord les réglages pour tous les jeux (profil, notifications, ville, thème, tapis, dos des cartes), puis ceux du jeu choisi seulement (alerte « partenaire recherché », et pour Safir les effets spéciaux)." },
    ],
  },
  {
    id: 100,
    date: "23 novembre 2026",
    tcg: "safir",
    items: [
      { t: "✨ Les effets spéciaux (arrivée des cartes, Gel) se coupent aussi en pleine partie : menu ☰ › Effets spéciaux › Coupés. En spectateur : bouton ✨ Effets en haut. Le réglage vaut pour cet appareil." },
    ],
  },
  {
    id: 99,
    date: "23 novembre 2026",
    tcg: "safir",
    items: [
      { t: "📊 Éditeur de deck : courbe de Valeur du deck (nombre de cartes par Valeur, combattants et magies, Valeur moyenne). Touchez une barre pour n'afficher que les cartes de cette Valeur." },
    ],
  },
  {
    id: 98,
    date: "23 novembre 2026",
    tcg: "safir",
    items: [
      { t: "🔎 Éditeur de deck : nouveau filtre par type, ⚔ Combattants ou ✦ Magies (une Valeur seule), à combiner avec le filtre par faction (Lin, Yan, Tian…) et la recherche par nom." },
    ],
  },
  {
    id: 97,
    date: "23 novembre 2026",
    tcg: "safir",
    items: [
      { t: "🔥 L'arrivée des cartes Yan est plus douce : un ruban de flammes glisse à hauteur de la carte, l'embrase, et des braises montent sur l'écran." },
    ],
  },
  {
    id: 96,
    date: "23 novembre 2026",
    tcg: "safir",
    items: [
      { t: "✨ Effets d'arrivée d'office : chaque carte Yan arrive avec une 🔥 vague de flammes (un ruban de feu et des braises), chaque carte Lin avec une 🍃 volée de feuilles, chaque carte Tian avec une ❄ arrivée enneigée. L'💥 aura de puissance se choisit dans l'éditeur de deck (bouton 💥, 2 cartes au plus) et remplace l'effet de faction." },
    ],
  },
  {
    id: 94,
    date: "23 novembre 2026",
    tcg: "safir",
    items: [
      { t: "✨ Effets d'arrivée sur le terrain, vus aussi par l'adversaire et les spectateurs : 🔥 vague de flammes (Yan), 🍃 volée de feuilles (Lin), ❄ arrivée enneigée (Tian), et 💥 aura de puissance (onde de choc, le terrain se fissure)." },
      { t: "🧊 Marqueur Gel : des stalactites se forment en haut de l'écran, tombent et se brisent sur le territoire gelé." },
      { t: "Personnalisation › Effets spéciaux : pour les revoir, ou les couper sur un téléphone peu puissant. Correction : un deck prêté garde maintenant l'ATK, la DEF et la faction de ses cartes." },
    ],
  },
  {
    id: 92,
    date: "23 novembre 2026",
    items: [
      { t: "🔔 Nouveau bouton « Je cherche un partenaire » (Jouer › Tables ouvertes) : il ouvre votre table et prévient tous les joueurs qui ont un deck de ce jeu et les notifications activées. Pas plus d'une alerte toutes les 30 minutes, jamais la nuit (23 h - 8 h), ni pendant une partie. Pour les couper : « Ne plus prévenir »." },
      { t: "⚙️ Nouvelle carte « Notifications » dans Personnalisation : activez-les sur chaque appareil pour être prévenu des messages privés et de groupe, d'un joueur qui rejoint votre table, des échanges et des partenaires recherchés." },
    ],
  },
  {
    id: 91,
    date: "23 novembre 2026",
    items: [
      { t: "🗺 Carte des joueurs : indiquez votre ville (facultatif, onglet Personnalisation) pour trouver des joueurs près de chez vous et organiser des parties en vrai. Carte de France, Belgique et Suisse avec les pseudos, liste des plus proches avec la distance, et un bouton ✉ pour leur écrire." },
    ],
  },
  {
    id: 90,
    date: "23 novembre 2026",
    items: [
      { t: "🤝 Échanges : indiquez le nombre d'exemplaires et la rareté de chaque carte (Safir : commune, rare, ultra rare, SP, secrète, légendaire, gold signée, promo ; Flesh and Blood : de commune à Marvel, et la finition Rainbow ou Cold Foil). Une carte ne correspond qu'à la même rareté." },
      { t: "🔁 Nouveau : « Échanges croisés possibles » quand un joueur a ce que vous cherchez ET cherche vos doubles, avec un repère « ≈ même rareté » pour un échange de valeur équivalente, et un message d'échange tout prêt." },
    ],
  },
  {
    id: 89,
    date: "23 novembre 2026",
    items: [
      { t: "🤝 Échanges (nouvel onglet de l'accueil) : notez les cartes que vous avez en double et celles que vous cherchez (saison, numéro, échange et/ou vente, prix). Quand un joueur a ce que vous cherchez, ou cherche vos doubles, il apparaît dans « Correspondances » avec un bouton ✉ pour lui écrire (message déjà préparé). Vous êtes aussi prévenu par notification." },
      { t: "🃏 Deck : pour les 15 combattants de la faction du commandant, seules les cartes mises dans le deck comptent (une carte « Les deux » placée dans le deck compte) ; les jetons de la réserve ne comptent pas.", tcg: "safir" },
      { t: "🗂 Accueil réorganisé en onglets : Jouer, Mes cartes, Échanges, Personnalisation (thème, fond du tapis, dos des cartes, profil). Sur grand écran, les salons restent affichés à droite." },
    ],
  },
  {
    id: 88,
    date: "23 novembre 2026",
    items: [
      { t: "🟣 En partie, un jeton posé depuis la réserve se repère tout de suite : bord violet en pointillés et étiquette « JETON ».", tcg: "safir" },
      { t: "💥 Un combattant de plus de 8 d'attaque (unification et bonus compris) fait trembler et se fissurer le tapis en arrivant en jeu.", tcg: "safir" },
      { t: "❄ Un marqueur Gel posé sur un territoire le couvre de givre, des deux côtés (Gel+ : aussi les territoires voisins).", tcg: "safir" },
    ],
  },
  {
    id: 87,
    date: "23 novembre 2026",
    items: [
      { t: "🔒 Salon # carte-du-jour : on n'y écrit plus librement. Seul le bouton « Partager dans le salon » de la carte du jour y publie votre résultat (sans la réponse), une fois par jour. Fini les spoilers !" },
    ],
  },
  {
    id: 86,
    date: "23 novembre 2026",
    items: [
      { t: "🃏 Carte du jour : les noms proposés sont nettoyés (sans « S1 », numéro ou parenthèses) et les cartes importées d'autres jeux sont exclues. Si la carte d'aujourd'hui était l'une d'elles, elle a été remplacée : vous pouvez rejouer." },
    ],
  },
  {
    id: 85,
    date: "23 novembre 2026",
    items: [
      { t: "🃏 Carte du jour : chaque jour, retrouvez une carte à partir d'un morceau de son illustration (5 essais, l'image se dévoile à chaque erreur). Points, classement du mois, série 🔥 de jours (un oubli par semaine pardonné), et partage de votre résultat dans le salon # carte-du-jour. Sur l'accueil." },
      { t: "🏅 Titres et badges : un titre selon vos parties des 30 derniers jours (🌱 Novice, 🎲 Habitué, ⚔️ Vétéran, 👑 Légende) s'affiche à côté de votre pseudo, et 13 badges sont à débloquer. « Mon profil et mes badges » sur l'accueil." },
      { t: "🟢 Qui est là : en haut des salons, le nombre de joueurs en ligne, de parties en cours et de joueurs au vocal ; une pastille verte à côté des joueurs connectés. Touchez un pseudo pour voir son profil. Vous pouvez apparaître hors ligne depuis votre profil." },
      { t: "🔔 Rappel du soir (Disponibilités) : vers 17 h 30, une notification si des joueurs sont disponibles en même temps que vous ce soir. À activer dans l'agenda." },
    ],
  },
  {
    id: 84,
    date: "22 novembre 2026",
    items: [
      { t: "➕ Safir : bonus d'autres cartes. Touchez un combattant posé : sous l'unification, « Bonus d'autres cartes » ajoute ou retire 1 ATK, VAL ou DEF. Les jetons affichent le total (carte + unification + bonus), et la valeur du territoire en tient compte.", tcg: "safir" },
      { t: "🔍 La loupe de votre tapis ne cache plus le combattant de droite du territoire : elle est sur le bord, entre les deux tapis." },
    ],
  },
  {
    id: 83,
    date: "22 novembre 2026",
    items: [
      { t: "🂠 Défausser la carte du dessus du deck dans la défausse de votre choix : touchez votre deck, puis « → Défausse I, II ou III » (Flesh and Blood : cimetière ou bannis). Touchez plusieurs fois pour plusieurs cartes ; le journal les indique." },
    ],
  },
  {
    id: 82,
    date: "22 novembre 2026",
    items: [
      { t: "🎧 Vocal en partie : la fenêtre 🎧 indique maintenant si la liaison avec l'adversaire est établie (directe ou par le relais), et si le son passe dans chaque sens. Pratique quand on ne s'entend pas." },
    ],
  },
  {
    id: 81,
    date: "22 novembre 2026",
    items: [
      { t: "🎨 Nouveau thème par défaut : « Arène arcane ». Si vous aviez choisi un thème vous-même, il est conservé. Pour changer : « Thème de l'appli », en bas de l'accueil." },
    ],
  },
  {
    id: 80,
    date: "22 novembre 2026",
    items: [
      { t: "📱 Salons sur téléphone, comme sur Discord : la liste complète des salons texte, vocaux et messages privés s'affiche en colonne. Touchez une ligne pour ouvrir la conversation, la flèche ← (ou le retour du téléphone) ramène à la liste." },
    ],
  },
  {
    id: 79,
    date: "22 novembre 2026",
    items: [
      { t: "👥 Groupes privés : dans une conversation privée, « ➕ Inviter » crée un groupe avec d'autres joueurs (10 au plus). Le bouton ＋ à côté de « Messages privés » en crée un aussi. Renommer, ajouter, sourdine, quitter : bouton « 👥 Membres »." },
      { t: "🔊 Salons vocaux : touchez un salon 🔊 dans la liste des salons puis « Rejoindre le vocal ». Le vocal reste ouvert quand vous changez d'écran (petite barre verte en bas), et se ferme quand vous allez à une table de jeu." },
      { t: "🖥 Partage d'écran depuis un ordinateur, ou 📷 caméra depuis un téléphone pour montrer vos cartes. Touchez une image pour l'agrandir." },
      { t: "📶 Vidéo et vocal plus fiables, en partie comme dans les salons : un relais prend le relais quand deux appareils n'arrivent pas à se joindre directement (4G, certaines box)." },
    ],
  },
  {
    id: 78,
    date: "22 novembre 2026",
    items: [
      { t: "✉ Messages privés : dans les salons, touchez le pseudo d'un joueur puis « Message privé ». Vos conversations sont à gauche, sous les salons, avec les non-lus." },
      { t: "🔔 Notification sur votre téléphone à chaque message privé (si les notifications sont activées). Vous pouvez bloquer un joueur, ou signaler une conversation à l'administrateur." },
    ],
  },
  {
    id: 77,
    date: "22 novembre 2026",
    items: [
      { t: "🎨 Votre tapis et votre dos de cartes personnalisés sont maintenant vus par vos adversaires et les spectateurs (réglages en bas de l'accueil)." },
      { t: "⚑ Une image déplacée ? Le bouton ⚑ en haut à droite du tapis adverse la signale : elle est masquée tout de suite, puis vérifiée par l'administrateur." },
    ],
  },
  {
    id: 76,
    date: "22 novembre 2026",
    items: [
      { t: "💬 Salons : joignez une image à vos messages (📎), cachez un message derrière un avertissement ⚠ Spoiler, et réagissez aux messages avec des émojis." },
      { t: "📋 Cartes limitées et bannies : l'éditeur de deck prévient (sans bloquer) si votre deck contient une carte de la liste officielle, même avec une faute de frappe dans le nom.", tcg: "safir" },
      { t: "📋 Cartes bannies par format (Classic Constructed, Silver Age, Blitz) : l'éditeur de deck prévient, sans bloquer, et la liste est dans les règles 📖.", tcg: "fab" },
      { t: "✋ Signaux rapides sur le côté du plateau : « Attendez ! », « Je lis une carte », « Je réfléchis », « C'est bon », affichés en grand chez l'adversaire (sur téléphone : bouton ✋ au bout des phases)." },
      { t: "🖱️ Raccourcis : glissez une de vos cartes en jeu sur l'adversaire pour attaquer ; à la souris, clic droit maintenu et glissé pour cibler." },
      { t: "😀 Réactions rapides en partie (bouton 😀 en haut), vues en grand par l'adversaire et les spectateurs." },
      { t: "🔗 Unification : touchez un combattant posé, « Unif 1, 2 ou 3 » pose 3 jetons aux nouvelles valeurs, à la couleur de sa sous-faction.", tcg: "safir" },
      { t: "🔍 Zoom : touchez l'aperçu d'une carte ou la vidéo d'un tapis filmé pour l'agrandir (pincer, molette, double-touche)." },
      { t: "📅 Disponibilités : indiquez vos jours et heures de jeu et vos préférences ; l'appli vous montre les joueurs libres en même temps et vous pouvez leur proposer une partie." },
      { t: "📜 Journal plus lisible : « passe ses PV de 12 à 18 », actions de l'adversaire en plus gros, phases annoncées en grand." },
      { t: "🏆 Bilan victoires / défaites par deck, visible de vous seul, et bouton « Nouvelle partie : tout remettre à zéro » dans le menu ☰." },
      { t: "🃏 Le commandant compte maintenant dans les 30 à 40 cartes du deck.", tcg: "safir" },
    ],
  },
];
export const NEWS_LATEST = NEWS[0]?.id || 0;

// Entrées à montrer à un joueur (jamais vues), filtrées pour le jeu choisi
export function newsFor(seen, tcg) {
  return NEWS.filter((n) => n.id > (seen || 0))
    .slice(0, 3)
    .map((n) => ({ ...n, items: n.items.filter((it) => !it.tcg || it.tcg === tcg) }))
    .filter((n) => n.items.length);
}
