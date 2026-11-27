# Données des cartes du prototype « TCG de Héros » (Référence v0.2 + Decks de démo v0.1, 27/11/2026).
# Source unique : génère web/public/heros/cards.json et les images des cartes (gen.py).
CARDS = [
  # --- Brasier [Feu] ---
  dict(code="A1", name="Escarbille", kind="action", lvl=1, cost=1, fam="Feu", text="Infligez 2 dégâts."),
  dict(code="A2", name="Flammèche", kind="action", lvl=1, cost=1, fam="Feu", text="Brûlure 1.", chain="Facile : si vous avez joué une carte [Feu] avant ce tour, Brûlure 1 de plus."),
  dict(code="A3", name="Tison", kind="action", lvl=2, cost=1, fam="Feu", text="Infligez 2 dégâts, Brûlure 1."),
  dict(code="A4", name="Souffle ardent", kind="action", lvl=2, cost=2, fam="Feu", text="Infligez 3 dégâts, Brûlure 2.", chain="Facile : si vous avez joué une carte [Feu] avant ce tour, 3 dégâts de plus."),
  dict(code="A5", name="Inspiration brûlante", kind="action", lvl=3, cost=1, fam="Feu", text="Piochez 1 carte, Brûlure 1."),
  dict(code="A6", name="Fonte d'armure", kind="action", lvl=3, cost=2, fam="Feu", text="Détruisez jusqu'à 4 armures adverses, puis infligez 4 dégâts.", chain="Moyenne : si l'adversaire est Brûlé, 6 dégâts de plus."),
  dict(code="A7", name="Javelot de flammes", kind="action", lvl=3, cost=3, fam="Feu", text="Infligez 9 dégâts.", chain="Facile : si vous avez joué une carte [Feu] avant ce tour, 5 dégâts de plus."),
  dict(code="A8", name="Boule de feu", kind="action", lvl=4, cost=3, fam="Feu", text="Infligez 8 dégâts.", chain="Moyenne : si l'adversaire est Brûlé, 7 dégâts de plus."),
  dict(code="A9", name="Pluie de cendres", kind="action", lvl=4, cost=2, fam="Feu", text="Brûlure 5.", chain="Facile : si vous avez joué une carte [Feu] avant ce tour, Brûlure 3 de plus."),
  dict(code="A10", name="Rempart de braises", kind="action", lvl=5, cost=3, fam="Feu", text="Gagnez 7 armures.", chain="Facile : si vous avez joué une carte [Feu] avant ce tour, Brûlure 5."),
  dict(code="A11", name="Étincelle ardente", kind="action", lvl=6, cost=2, fam="Feu", text="Infligez 5 dégâts, Brûlure 3."),
  dict(code="A12", name="Colonne de feu", kind="action", lvl=7, cost=5, fam="Feu", text="Infligez 10 dégâts, Brûlure 5.", chain="Difficile : si vous avez joué deux cartes [Feu] avant ce tour, 15 dégâts de plus."),
  # --- Bastion [Garde] ---
  dict(code="B1", name="Parade", kind="reaction", lvl=1, cost=1, fam="Garde", text="Réduisez de 2 les dégâts de l'attaque."),
  dict(code="B2", name="Posture", kind="action", lvl=1, cost=1, fam="Garde", text="Gagnez 1 armure, soignez 1 PV."),
  dict(code="B3", name="Peau de fer", kind="action", lvl=2, cost=2, fam="Garde", text="Gagnez 4 armures, soignez 1 PV."),
  dict(code="B4", name="Garde vigilante", kind="action", lvl=2, cost=2, fam="Garde", text="Piochez 1 carte, gagnez 2 armures."),
  dict(code="B5", name="Mur de boucliers", kind="reaction", lvl=3, cost=1, fam="Garde", text="Réduisez de 4 les dégâts de l'attaque."),
  dict(code="B6", name="Coup de bouclier", kind="action", lvl=3, cost=2, fam="Garde", text="Infligez 4 dégâts, gagnez 1 armure.", chain="Facile : si vous avez joué une carte [Garde] avant ce tour, 4 dégâts de plus."),
  dict(code="B7", name="Second souffle", kind="action", lvl=3, cost=3, fam="", text="Soignez 13 PV."),
  dict(code="B8", name="Riposte", kind="reaction", lvl=4, cost=2, fam="Garde", text="Réduisez de 3 les dégâts de l'attaque, infligez 2 dégâts à l'attaquant."),
  dict(code="B9", name="Charge du bastion", kind="action", lvl=5, cost=3, fam="Garde", text="Infligez 9 dégâts.", chain="Moyenne : si vous avez au moins 10 armures, 8 dégâts de plus."),
  dict(code="B10", name="Contre-attaque", kind="reaction", lvl=6, cost=3, fam="Garde", text="Réduisez de 5 les dégâts de l'attaque, infligez 5 dégâts à l'attaquant."),
  dict(code="B11", name="Rempart ancestral", kind="action", lvl=7, cost=6, fam="Garde", text="Gagnez 15 armures."),
  dict(code="B12", name="Juste châtiment", kind="action", lvl=7, cost=5, fam="Garde", text="Infligez 15 dégâts.", chain="Moyenne : si vous avez au moins 10 armures, 12 dégâts de plus."),
]

# Annexe A : les 30 quêtes (⚔ situationnelle, ⏳ pas en ouverture)
Q = lambda code, name, tier, goal, reward, tag="": dict(code=code, name=name, kind="quete", tier=tier, cost={"simple": 1, "intermediaire": 2, "complexe": 3}[tier], goal=goal, reward=reward, tag=tag)
QUESTS = [
  Q("D1", "Premier sang", "simple", "Infliger 3 dégâts en un tour.", "Piocher 1, infliger 2 dégâts."),
  Q("D2", "Briseur de garde", "simple", "Détruire 2 armures adverses.", "Infliger 5 dégâts.", "⚔"),
  Q("A1", "Garde levée", "simple", "Avoir au moins 4 armures.", "Gagner 4 armures."),
  Q("A2", "Parade", "simple", "Jouer 1 carte Réaction.", "Piocher 1, soigner 2.", "⚔"),
  Q("S1", "Étincelle", "simple", "Jouer une carte Action de coût 2 ou plus.", "Infliger 3 dégâts, gagner 1 armure."),
  Q("S2", "Concentration", "simple", "Finir votre tour avec au moins 2 mana non dépensé.", "Gagner 2 armures, soigner 3."),
  Q("E1", "Ajustement", "simple", "Activer 1 pièce d'équipement.", "Gagner 4 armures.", "⏳"),
  Q("E2", "Forge", "simple", "Débloquer une pièce d'équipement.", "Piocher 1, soigner 2.", "⏳"),
  Q("P1", "Exploration", "simple", "Piocher 2 cartes en plus de la pioche de début de tour.", "Soigner 6."),
  Q("P2", "Blessure", "simple", "Perdre au moins 3 PV.", "Piocher 1, soigner 2.", "⚔"),
  Q("D3", "Assaut", "intermediaire", "Infliger des dégâts pendant 2 de vos tours consécutifs.", "Infliger 8 dégâts, détruire 4 armures."),
  Q("D4", "Frappe lourde", "intermediaire", "Infliger au moins 6 dégâts avec une seule carte.", "Piocher 1, infliger 7 dégâts."),
  Q("A3", "Rempart", "intermediaire", "Absorber 6 dégâts avec votre armure.", "Gagner 8 armures.", "⚔"),
  Q("A4", "Encaisser", "intermediaire", "Subir une attaque de 5 dégâts ou plus sans perdre de PV.", "Piocher 1, gagner 5 armures.", "⚔"),
  Q("S3", "Incantation", "intermediaire", "Jouer 2 cartes Action dans le même tour.", "Piocher 1, infliger 7 dégâts."),
  Q("S4", "Combo", "intermediaire", "Déclencher 2 enchaînements.", "Piocher 1, infliger 3 dégâts, gagner 3 armures."),
  Q("E3", "Forgeron", "intermediaire", "Activer 2 pièces d'équipement différentes.", "Piocher 1, gagner 5 armures.", "⏳"),
  Q("E4", "Panoplie", "intermediaire", "Avoir 2 pièces d'équipement débloquées.", "Infliger 5 dégâts, gagner 4 armures.", "⏳"),
  Q("P3", "Seconde chance", "intermediaire", "Soigner 4 PV.", "Piocher 1, soigner 9."),
  Q("P4", "Main pleine", "intermediaire", "Avoir au moins 6 cartes en main à la fin de votre tour.", "Gagner 5 armures, soigner 5."),
  Q("D5", "Exécution", "complexe", "Infliger 12 dégâts.", "Infliger 11 dégâts, détruire 8 armures."),
  Q("D6", "Siège", "complexe", "Faire perdre 8 PV à l'adversaire.", "Piocher 2, infliger 8 dégâts."),
  Q("A5", "Forteresse", "complexe", "Avoir au moins 15 armures à la fin de votre tour.", "Piocher 2, gagner 6 armures."),
  Q("A6", "Inébranlable", "complexe", "Ne perdre aucun PV pendant 2 tours adverses consécutifs, en subissant au moins une attaque à chacun.", "Gagner 8 armures, soigner 6.", "⚔"),
  Q("S5", "Flux arcanique", "complexe", "Dépenser au moins 6 mana en un tour, sans compter le coût de cette quête.", "Piocher 2, infliger 8 dégâts."),
  Q("S6", "Maîtrise", "complexe", "Jouer une carte dont le coût dépasse votre niveau.", "Piocher 3, infliger 4 dégâts.", "⏳"),
  Q("E5", "Arsenal", "complexe", "Avoir 4 pièces d'équipement débloquées.", "Piocher 2, gagner 6 armures.", "⏳"),
  Q("E6", "Maître d'armes", "complexe", "Activer au moins une pièce pendant 3 de vos tours consécutifs.", "Piocher 2, infliger 8 dégâts.", "⏳"),
  Q("P5", "Sanctuaire", "complexe", "Soigner 8 PV.", "Piocher 2, soigner 10."),
  Q("P6", "Dos au mur", "complexe", "Commencer votre tour avec 15 PV ou moins.", "Piocher 1, soigner 16.", "⚔"),
]

E = lambda code, name, slot, cost, mode, text: dict(code=code, name=name, kind="equipement", slot=slot, cost=cost, mode=mode, text=text)
EQUIP = [
  E("EQ1", "Casque d'acier", "Casque", 6, "Activé", "Gagnez 2 armures."),
  E("EQ2", "Plastron runique", "Plastron", 10, "Passif", "Au début de votre tour, gagnez 3 armures."),
  E("EQ3", "Jambières du pèlerin", "Jambières", 6, "Activé", "Soignez 4 PV."),
  E("EQ4", "Bottes de voyage", "Bottes", 5, "Passif", "Quand vous validez une quête, piochez 1 carte."),
  E("EQ5", "Gants de duelliste", "Gants", 3, "Activé", "La prochaine carte qui inflige des dégâts ce tour inflige 2 dégâts de plus."),
  E("EQ6", "Épée longue", "Épée", 8, "Activé", "Infligez 4 dégâts."),
  E("EQ7", "Bouclier de chêne", "Bouclier", 10, "Passif", "La première attaque que vous subissez à chaque tour adverse inflige 4 dégâts de moins."),
]

DECKS = [
  dict(name="Brasier (démo)", cards={"A1": 3, "A2": 3, "A3": 3, "A4": 3, "A5": 3, "A6": 2, "A7": 3, "A8": 3, "A9": 1, "A10": 2, "A11": 2, "A12": 2},
       quests=["D3", "E1", "D1", "S1", "D4", "S3", "S4", "D2", "D6", "D5"]),
  dict(name="Bastion (démo)", cards={"B1": 3, "B2": 3, "B3": 3, "B4": 2, "B5": 3, "B6": 3, "B7": 2, "B8": 3, "B9": 3, "B10": 2, "B11": 2, "B12": 1},
       quests=["A2", "P2", "A1", "S2", "A3", "A4", "P3", "A5", "D5", "P5"]),
]
for d in DECKS:
    assert sum(d["cards"].values()) == 30, d["name"]
    assert len(d["quests"]) == 10
