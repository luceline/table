// Nouveautés montrées aux joueurs à leur prochaine connexion après une mise à jour.
// À chaque mise à jour, ajouter une entrée EN TÊTE de liste avec le numéro suivant (id) : la fenêtre s'affiche une fois
// par joueur (mémorisé sur son compte), avec les entrées qu'il n'a pas encore vues (3 au plus).
// tcg : "safir" ou "fab" pour une nouveauté propre à un jeu (montrée seulement à ce jeu), absent = pour tous.
export const NEWS = [
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
