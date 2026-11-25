// Aide-mémoire Sorcery: Contested Realm, rédigé avec nos mots à partir des règles officielles (sorcerytcg.com, livret de décembre 2025).
// Résumé non officiel : en cas de doute, le livret complet, le Codex et le texte des cartes font foi.
// items : { k: titre court, t: texte } ou { k, table: { head: [...], rows: [[...]] } }

export const RULES_SORCERY = [
  {
    id: "bases",
    title: "Bases",
    items: [
      { k: "But", t: "Faire tomber la vie de l'avatar adverse à 0 : il est alors aux portes de la mort. Lui infliger ensuite des dégâts (le coup fatal) gagne la partie. Un joueur qui doit piocher dans un deck vide perd aussi." },
      { k: "Avatar", t: "Chaque joueur incarne un avatar : sa vie de départ (et maximale), sa puissance et son pouvoir sont imprimés sur la carte. C'est lui qui pose les sites et, en général, lance les sorts." },
      { k: "Les quatre éléments", t: "Air, Terre, Feu et Eau. La plupart des sorts sont liés à un ou plusieurs éléments." },
      { k: "Affinité et seuil", t: "Votre affinité, ce sont les symboles d'éléments de vos sites (plus ceux donnés par certains effets). Le seuil d'un sort est l'affinité minimale qu'il demande : on ne la dépense pas, il suffit de l'avoir. Les artefacts n'ont en général pas de seuil." },
      { k: "Règle d'or", t: "Quand le texte d'une carte contredit les règles, c'est la carte qui a raison." },
      { k: "Dans l'appli", t: "Le compteur VIE part de la vie de votre avatar (saisie au scan, 20 sinon). Le compteur MANA suit votre mana du tour. Sous vos compteurs : vos sites et votre affinité, comptés d'après les sites posés dans le royaume." },
    ],
  },
  {
    id: "decks",
    title: "Construire un deck",
    items: [
      {
        k: "Format Constructed",
        table: {
          head: ["Élément", "Règle"],
          rows: [
            ["Avatar", "exactement 1 (hors decks)"],
            ["Grimoire", "au moins 60 sorts : sbires, magies, auras, artefacts"],
            ["Atlas", "au moins 30 sites"],
            ["Exemplaires", "Ordinaire 4, Exceptionnelle 3, Élite 2, Unique 1"],
          ],
        },
      },
      { k: "Collection", t: "En tournoi, chaque joueur peut avoir à côté une « collection » de 10 cartes respectant aussi la rareté, utilisée par certains effets. L'appli ne la gère pas." },
      { k: "Deck de découverte", t: "Dans l'appli, cochez « Deck de découverte » pour jouer un petit deck sans les règles de construction (seul l'avatar reste obligatoire)." },
    ],
  },
  {
    id: "royaume",
    title: "Le royaume",
    items: [
      { k: "Grille partagée", t: "Le royaume est une grille de 5 cases sur 4, commune aux deux joueurs : chacun est assis d'un côté. Au départ, toutes les cases sont du vide, que les sites viennent remplir." },
      { k: "Dans l'appli", t: "Vous voyez le royaume de votre côté, votre rangée en bas. Les cartes de l'adversaire sont posées sur les mêmes cases, vues depuis votre place. C'est pourquoi Sorcery ne se joue pas avec des cartes filmées." },
      { k: "Hors du royaume", t: "Chaque joueur a son atlas (deck de sites), son grimoire (deck de sorts) et son cimetière (public, l'ordre ne compte pas). Dans l'appli : grimoire et atlas à droite, cimetière à gauche ; ceux de l'adversaire en face." },
      { k: "Régions", t: "Surface (le dessus des sites, là où l'on joue d'habitude), sous-sol d'un site terrestre, fond d'un site aquatique, et le vide (cases sans site). Sans capacité adaptée, un sbire meurt sous terre ou sous l'eau, et est banni dans le vide. Un avatar ne quitte jamais la surface." },
      { k: "Adjacent, à proximité", t: "Adjacent : la case de la carte et les cases qui partagent un côté avec elle. À proximité : la case et les 8 qui l'entourent. Toujours dans la même région." },
    ],
  },
  {
    id: "mise",
    title: "Mise en place",
    items: [
      { k: "Avatars", t: "Chaque avatar commence sur la case du milieu de la rangée de son joueur (l'appli l'y pose d'office)." },
      { k: "Main de départ", t: "Chacun pioche 3 cartes de son atlas et 3 de son grimoire (dans l'appli : touchez votre atlas puis votre grimoire, « Piocher 3 »)." },
      { k: "Mulligan", t: "Une fois : remettez jusqu'à 3 cartes sous les decks d'où elles viennent, puis repiochez-en autant dans chacun (« Dessous de l'atlas » ou « Dessous du grimoire » sur la carte)." },
      { k: "Premier joueur", t: "Désigné d'un commun accord ou au hasard (menu ☰ › Pile ou face). Il ne pioche pas à son premier tour." },
    ],
  },
  {
    id: "tour",
    title: "Déroulement d'un tour",
    items: [
      { k: "Début", t: "Fin des effets « jusqu'à votre prochain tour », vous redressez vos cartes, chacun de vos sites donne 1 mana, puis vous piochez 1 carte, au choix dans l'atlas ou le grimoire. Dans l'appli, toucher « Début » redresse vos cartes et règle le MANA sur votre nombre de sites." },
      { k: "Principale", t: "Lancez des sorts et utilisez des capacités, autant que vos ressources le permettent, dans l'ordre que vous voulez." },
      { k: "Fin", t: "Effets de fin de tour, puis les dégâts des sbires s'effacent. Le mana non dépensé est perdu (« Tour fini » remet le MANA à 0). Un avatar ne guérit pas tout seul." },
      { k: "Premier tour", t: "Au tout premier tour, l'avatar doit utiliser sa capacité pour poser un site sur sa propre case." },
    ],
  },
  {
    id: "sites",
    title: "Sites et mana",
    items: [
      { k: "Poser un site", t: "L'avatar s'engage pour poser (ou piocher) un site. Il va sur du vide ou des décombres, à côté d'un site que vous contrôlez ; si vous n'en avez aucun, au plus près de votre avatar. Un seul site par case." },
      { k: "Mana", t: "Chaque site donne 1 mana au début de votre tour, et 1 tout de suite quand il entre dans le royaume pendant votre tour (l'appli l'ajoute d'office). Le mana ne se gagne que pendant son tour et se perd à la fin." },
      { k: "Décombres", t: "Un site détruit devient des décombres : un site terrestre neutre, sans mana ni élément. On peut poser un site dessus pour le remplacer." },
    ],
  },
  {
    id: "sorts",
    title: "Lancer des sorts",
    items: [
      { k: "Coût", t: "Payez le coût en mana (en haut à gauche) et ayez le seuil d'éléments demandé." },
      { k: "Sbires", t: "Invoqués sur n'importe quel site que vous contrôlez. Ils ne peuvent pas s'engager pour un coût avant votre prochain tour, sauf avec Charge. Ils entrent redressés et peuvent défendre pendant le tour adverse." },
      { k: "Artefacts", t: "Posés sur un site que vous contrôlez ou dans les mains d'une unité, qui peut en porter autant qu'elle veut." },
      { k: "Auras", t: "Effets durables posés à l'intersection de quatre cases (une zone de 2 x 2), parfois sur une seule case ou à la jonction de deux." },
      { k: "Magies", t: "Leur effet s'applique tout de suite, puis elles vont au cimetière." },
    ],
  },
  {
    id: "combat",
    title: "Déplacement et combat",
    items: [
      { k: "Se déplacer et attaquer", t: "Une unité s'engage pour se déplacer (1 case par défaut, plus avec Mouvement +X), puis peut attaquer à l'arrivée une unité ennemie ou la surface d'un site ennemi sur sa case. On annonce tout le trajet avant de le faire." },
      { k: "Défendre", t: "Pendant le tour adverse, quand une unité ou un site à portée de déplacement d'une de vos unités est attaqué, elle peut s'engager pour venir se battre. Autant de défenseurs que vous voulez." },
      { k: "Intercepter", t: "Quand une unité ennemie finit son déplacement sans attaquer, vos unités déjà sur cette case peuvent s'engager pour la combattre." },
      { k: "Frappes", t: "Les unités du combat frappent en même temps, chacune pour sa puissance ; chaque camp répartit ses dégâts. Avec une puissance double (épée / bouclier), on attaque avec la valeur de gauche et on défend avec celle de droite. Certaines unités frappent en premier." },
      { k: "Mort d'un sbire", t: "Les dégâts s'accumulent jusqu'à la fin du tour ; un sbire meurt dès qu'ils atteignent sa puissance (au moins 1 dégât à puissance 0) et va au cimetière." },
      { k: "Attaquer un site", t: "Un site non défendu attaqué fait perdre autant de vie à l'avatar qui le contrôle. C'est une perte de vie, pas des dégâts : elle ne peut pas donner le coup fatal." },
      { k: "Aux portes de la mort", t: "À 0 de vie, l'avatar ne peut plus en regagner et ne subit plus de dégâts jusqu'à la fin du tour. Ensuite, tout dégât qu'il reçoit est le coup fatal. L'appli vous prévient, mais c'est à vous de déclarer la fin (menu ☰ › Résultat)." },
    ],
  },
  {
    id: "appli",
    title: "Jouer dans l'appli",
    items: [
      { k: "Engager", t: "Touchez une carte puis « Engager » pour la tourner (« Dégager » pour la redresser)." },
      { k: "Piocher", t: "Touchez votre atlas ou votre grimoire, ou glissez la carte du dessus vers votre main. Glisser le dessus de l'atlas sur une case pose le site directement." },
      { k: "Sites", t: "Posés sur une case, ils se calent au centre. Les autres cartes se posent librement, par-dessus." },
      { k: "Jetons, flèches", t: "Comme dans les autres jeux : jetons de dégâts ou de compteurs à glisser sur une carte, flèches d'attaque et de ciblage depuis la carte touchée." },
      { k: "Rappel", t: "Le texte exact de la carte fait toujours foi." },
    ],
  },
];
