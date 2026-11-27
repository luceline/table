// Aide-mémoire du prototype « Héros » : résumé de la Référence v0.2 (27/11/2026) et des Decks de démo v0.1.
// C'est la Référence qui fait foi. [H] = hypothèse à valider.
// items : { k: titre court, t: texte } ou { k, table: { head: [...], rows: [[...]] } }

export const RULES_HEROS = [
  {
    id: "bases",
    title: "Bases",
    items: [
      { k: "But", t: "Faire tomber le héros adverse à 0 PV ou moins. Les deux en même temps : partie nulle. Deck vide : pas de pioche, et perte de 3 PV (l'armure ne protège pas)." },
      { k: "Départ", t: "60 PV, niveau 0, 0 armure, 0 point d'équipement. Niveau maximum : 10." },
      { k: "Mana", t: "Égal au niveau, 1 au minimum (le niveau 0 compte comme le niveau 1, pour le mana et pour l'accès aux cartes) [H]. Rempli au début de son tour ; le mana non dépensé sert aux Réactions pendant le tour adverse, puis disparaît." },
      { k: "Dans l'appli", t: "Rien n'est automatique : chacun règle sa fiche de héros en touchant un compteur (PV, mana, armure, niveau, points d'équipement, Brûlure, mana dépensé ce tour). Le journal garde la trace de chaque changement." },
    ],
  },
  {
    id: "deck",
    title: "Deck et mise en place",
    items: [
      {
        k: "Construction",
        table: {
          head: ["Élément", "Règle"],
          rows: [
            ["Cartes", "30 Action / Réaction, 3 exemplaires au plus"],
            ["Réserve de quêtes", "10 quêtes, 1 copie de chacune, au moins 2 par palier ; cachée à l'adversaire"],
            ["Équipement", "7 emplacements, une pièce par emplacement, posées inactives"],
          ],
        },
      },
      { k: "Mise en place", t: "1. Choisir sa quête de départ dans la réserve et la poser active, sans payer son coût [H]. 2. Mélanger, piocher 5 cartes ; un mulligan possible. 3. Tirage au sort : le second pioche 1 carte de plus, le premier ne pioche pas à son premier tour." },
    ],
  },
  {
    id: "tour",
    title: "Un tour",
    items: [
      { k: "Début", t: "Mana = niveau (1 au minimum). Perdre 1 PV par marqueur Brûlure (l'armure ne protège pas), puis les retirer. Effets « au début de votre tour » (Plastron runique). Piocher 1 carte. Remettre le mana dépensé ce tour à 0." },
      { k: "Phase principale", t: "Dans l'ordre voulu : jouer des cartes Action (niveau requis ≤ votre niveau) ; activer une quête (une fois par tour) ; débloquer des pièces d'équipement ; utiliser chaque pièce débloquée une fois." },
      { k: "Fin", t: "Valider la quête active si son objectif est rempli. Effets « à la fin de votre tour ». Défausser jusqu'à 7 cartes." },
    ],
  },
  {
    id: "quetes",
    title: "Quêtes",
    items: [
      { k: "Activer", t: "Payer son coût (1, 2 ou 3 mana selon le palier) et la poser sur « Quête active ». Une seule active ; en activer une autre renvoie l'ancienne dans la réserve, sa progression est perdue." },
      { k: "Progression", t: "Seules les actions faites depuis l'activation comptent, tours adverses compris sauf mention « en un tour »." },
      { k: "Valider", t: "À la fin de son tour, dans l'ordre : +1 niveau, la récompense imprimée (sans Réaction possible), +3 points d'équipement, +1 mana tout de suite pour les Réactions (sauf au passage du niveau 0 au niveau 1). La quête va dans « Quêtes validées »." },
      { k: "Récompenses", t: "5 points de puissance par mana de coût : 5 (simple), 10 (intermédiaire), 15 (complexe)." },
    ],
  },
  {
    id: "combat",
    title: "Attaques et Réactions",
    items: [
      { k: "Attaque", t: "Tout effet qui inflige des dégâts au héros adverse, carte ou équipement. Pas d'attaque de base gratuite [H]." },
      { k: "Réaction", t: "Pour chaque attaque qui le cible, le défenseur peut jouer une seule Réaction avec son mana gardé. Pas de chaîne." },
      { k: "Dégâts", t: "Dans l'ordre : réductions, puis armure point par point, puis PV. Détruire de l'armure ne touche jamais les PV. L'armure reste d'un tour à l'autre." },
      { k: "Brûlure X", t: "X marqueurs sur le héros adverse : au début de son prochain tour, il perd 1 PV par marqueur, puis les retire. Ce n'est pas une attaque (pas de Réaction). Brûlé = porte au moins un marqueur." },
    ],
  },
  {
    id: "enchainement",
    title: "Enchaînements",
    items: [
      { k: "Principe", t: "Une carte a au plus un enchaînement : si la condition est remplie quand on la joue, on ajoute le bonus. « Avant » = plus tôt dans ce tour ; le mana de la carte elle-même ne compte pas, celui d'une quête compte." },
      { k: "Mana dépensé", t: "Le compteur Σ de la fiche sert à vérifier les conditions du type « au moins X mana avant »." },
      { k: "Élan", t: "Une carte qui coûte 8 ou plus donne Élan jusqu'à la fin de votre prochain tour (condition moyenne « si vous avez Élan »). Pas utilisé dans les decks de démo." },
    ],
  },
  {
    id: "equipement",
    title: "Équipement",
    items: [
      { k: "Débloquer", t: "Avec ses points d'équipement (3 par quête validée), pendant sa phase principale. Définitif : la pièce est tournée de côté. Les points non dépensés se gardent." },
      { k: "Utiliser", t: "Effet activé : une fois par tour, pendant votre tour, sans mana. Passif : se déclenche seul. Un effet qui inflige des dégâts est une attaque." },
      {
        k: "Panoplie de départ",
        table: {
          head: ["Pièce", "Coût", "Effet"],
          rows: [
            ["Gants de duelliste", "3", "Activé : la prochaine carte qui inflige des dégâts ce tour en inflige 2 de plus"],
            ["Bottes de voyage", "5", "Passif : en validant une quête, piochez 1 carte"],
            ["Casque d'acier", "6", "Activé : gagnez 2 armures"],
            ["Jambières du pèlerin", "6", "Activé : soignez 4 PV"],
            ["Épée longue", "8", "Activé : infligez 4 dégâts"],
            ["Bouclier de chêne", "10", "Passif : la 1re attaque subie à chaque tour adverse inflige 4 dégâts de moins"],
            ["Plastron runique", "10", "Passif : au début de votre tour, gagnez 3 armures"],
          ],
        },
      },
    ],
  },
];
