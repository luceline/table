// Aide-mémoire Flesh and Blood, rédigé avec nos mots à partir des règles officielles (rules.fabtcg.com).
// Résumé non officiel : en cas de doute, les règles complètes et le texte des cartes font foi.
// items : { k: titre court, t: texte } ou { k, table: { head: [...], rows: [[...]] } }

export const RULES_FAB = [
  {
    id: "bases",
    title: "Bases",
    items: [
      { k: "But", t: "Faire tomber la vie du héros adverse à 0. Le héros qui arrive à 0 point de vie perd la partie." },
      { k: "Héros", t: "Chaque joueur joue un héros : sa vie de départ et son intellect (nombre de cartes en main en fin de tour) sont indiqués sur la carte. Il détermine aussi les classes de cartes autorisées dans le deck." },
      { k: "Vie dans l'appli", t: "Le compteur VIE part de 40 (Classic Constructed) ou 20 (Blitz). Ajustez-le avec + et − selon la vie imprimée sur votre héros." },
      { k: "Ressources", t: "Le compteur RES sert à suivre les ressources gagnées en pitchant. Il revient à 0 quand vous touchez « Tour fini »." },
    ],
  },
  {
    id: "formats",
    title: "Formats et decks",
    items: [
      {
        k: "Construction",
        table: {
          head: ["", "Classic Constructed", "Blitz"],
          rows: [
            ["Héros", "Adulte", "Jeune héros"],
            ["Deck", "60 cartes au moins", "Exactement 40 cartes"],
            ["Total avec armes et équipements", "80 au plus", "52 au plus"],
            ["Exemplaires d'une carte", "3 au plus", "1 au plus"],
          ],
        },
      },
      { k: "Carte unique", t: "Une carte est identifiée par son nom ET sa couleur de pitch : une version rouge et une version bleue du même nom sont deux cartes différentes." },
      { k: "Armes et équipements", t: "Ils ne sont pas dans le deck. Avant la partie, on choisit au plus une carte par zone (tête, torse, bras, jambes, armes). Dans l'appli, ils sont dans l'onglet « Inventaire » : faites-les glisser dans leurs zones." },
      { k: "Cartes restreintes", t: "Certaines cartes sont limitées ou interdites selon le format (liste officielle de légalité). L'appli ne le vérifie pas." },
    ],
  },
  {
    id: "debut",
    title: "Mise en place",
    items: [
      { k: "Ordre", t: "Héros posés face visible. Un joueur tiré au sort choisit qui commence. Chacun choisit ses armes et équipements, puis son deck parmi sa réserve de cartes." },
      { k: "Main de départ", t: "Chaque joueur pioche jusqu'à l'intellect de son héros (souvent 4). Bouton du deck : « Main à 4 cartes »." },
      { k: "Premier tour", t: "À la fin du tout premier tour de la partie, les deux joueurs complètent leur main jusqu'à leur intellect." },
    ],
  },
  {
    id: "tour",
    title: "Déroulement d'un tour",
    items: [
      { k: "Début", t: "Les effets « au début de votre tour » se déclenchent. Pas d'action des joueurs." },
      { k: "Action", t: "Le joueur actif reçoit 1 point d'action. Jouer une carte d'action ou attaquer coûte ce point. Les instants se jouent sans point d'action." },
      { k: "Fin de tour, dans l'ordre", t: "1. Vous pouvez poser une carte de votre main face cachée dans votre arsenal s'il est vide. 2. Les cartes de la zone de pitch vont sous le deck, dans l'ordre de votre choix (caché). 3. Vous redressez vos permanents. 4. Ressources et points d'action non utilisés sont perdus. 5. Vous piochez jusqu'à votre intellect." },
      { k: "Dans l'appli", t: "Zone Pitch : touchez-la puis « Tout remettre sous le deck ». Deck : « Main à 4 cartes ». Puis « Tour fini »." },
    ],
  },
  {
    id: "ressources",
    title: "Coût et pitch",
    items: [
      { k: "Payer", t: "Pour payer un coût, on pitche des cartes de sa main : on les place dans la zone de pitch et on gagne autant de ressources que leur valeur de pitch." },
      { k: "Couleurs", t: "En général : rouge = 1 ressource, jaune = 2, bleu = 3. Le rond en haut de la carte l'indique." },
      { k: "Reste", t: "Les ressources en trop restent disponibles pendant le tour, puis sont perdues en fin de tour." },
    ],
  },
  {
    id: "combat",
    title: "Combat",
    items: [
      { k: "Chaîne de combat", t: "Une attaque se place sur la chaîne de combat (rangée centrale du tapis dans l'appli). Chaque attaque et ses défenseurs forment un maillon." },
      { k: "Étapes", t: "Attaque, puis le défenseur peut défendre avec des cartes de sa main et ses équipements, puis réactions (attaquant d'abord), puis dégâts : puissance de l'attaque moins la défense totale." },
      { k: "Défendre", t: "Une carte qui défend ajoute sa valeur de défense. Les cartes de la main qui défendent vont au cimetière à la fermeture de la chaîne." },
      { k: "Go again", t: "Une carte avec « Go again » vous rend un point d'action quand elle se résout : vous pouvez enchaîner une autre action." },
      { k: "Fermeture", t: "Quand l'attaquant ne continue pas, la chaîne se ferme : les cartes vont au cimetière, les armes reviennent dans leur zone." },
      { k: "Arsenal", t: "Une carte de l'arsenal se joue comme depuis la main, mais ne peut pas être pitchée ni défendre." },
    ],
  },
  {
    id: "zones",
    title: "Zones du tapis",
    items: [
      { k: "Héros, armes", t: "Le héros au centre, une arme de chaque côté (une arme à deux mains occupe les deux)." },
      { k: "Équipements", t: "Tête, torse, bras, jambes : une pièce par zone." },
      { k: "Arène", t: "Les permanents en jeu : auras, objets, alliés." },
      { k: "Pitch, deck, cimetière, bannis", t: "Pitch : cartes payées ce tour. Cimetière : cartes jouées, détruites ou défaussées. Bannis : cartes retirées du jeu par un effet." },
    ],
  },
  {
    id: "mots",
    title: "Mots-clés fréquents",
    items: [
      { k: "Dominate", t: "Le héros attaqué ne peut pas défendre avec plus d'une carte de sa main contre cette attaque." },
      { k: "Intimidate", t: "Le héros adverse bannit au hasard une carte de sa main, face cachée ; elle revient en main à la fin du tour." },
      { k: "Blade Break", t: "L'équipement est détruit quand la chaîne de combat se ferme, s'il a défendu." },
      { k: "Battleworn", t: "Quand l'équipement défend, il perd 1 point de défense (marqueur) à la fermeture de la chaîne." },
      { k: "Arcane Barrier X", t: "Vous pouvez payer jusqu'à X ressources pour empêcher autant de dégâts arcaniques." },
      { k: "Spellvoid X", t: "Vous pouvez détruire cette carte pour empêcher X dégâts arcaniques." },
      { k: "Rappel", t: "Le texte exact de la carte fait toujours foi." },
    ],
  },
];
