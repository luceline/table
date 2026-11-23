import { useState } from "react";
import { pb, me, errMsg } from "../pb.js";

// Mentions légales, non-affiliation et confidentialité (lien ?infos, accessible sans compte)
export const CONTACT = "resgestae.game@gmail.com";

export function LegalFooter() {
  return (
    <footer className="legal-foot">
      Projet de fan gratuit et non officiel, sans lien avec les éditeurs des jeux.{" "}
      <a href={`${window.location.pathname}?infos`}>Mentions légales et confidentialité</a>
    </footer>
  );
}

export default function Legal() {
  const user = me();
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const home = window.location.pathname;
  const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

  async function deleteAccount() {
    setErr("");
    setBusy(true);
    try {
      await pb.collection("users").delete(user.id);
      pb.authStore.clear();
      window.location.href = home;
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <div className="page legal">
      <div className="topbar">
        <a className="btn icon ghost" href={home} aria-label="Retour">←</a>
        <h1 className="grow" style={{ margin: 0 }}>Mentions légales et confidentialité</h1>
      </div>

      <div className="card-box">
        <h2>Éditeur</h2>
        <p>
          Table de jeu (table.resgestae.fr) est un site personnel, gratuit et non commercial, édité par un particulier.
          Conformément à l'article 6, III, 2 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique,
          son identité a été communiquée à l'hébergeur.
        </p>
        <p>Contact (questions, signalements, demandes de retrait, données personnelles) : {mail}</p>
        <h2>Hébergeur</h2>
        <p>
          Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Allemagne. Téléphone : +49 9831 505-0.
        </p>
      </div>

      <div className="card-box">
        <h2>Jeux et propriété intellectuelle</h2>
        <p>
          Table de jeu est un projet de fan, non officiel, qui n'est ni affilié, ni approuvé, ni soutenu par Legend Story Studios
          ou par l'éditeur de Safir Cards. Flesh and Blood est une marque de Legend Story Studios. Safir Cards appartient à son éditeur.
          Les règles, illustrations et textes des cartes restent la propriété de leurs éditeurs et de leurs auteurs.
        </p>
        <p>
          L'appli ne fournit aucune image de carte : chaque joueur photographie ses propres cartes pour pouvoir jouer avec, en ligne,
          contre un autre joueur. Les rappels de règles sont des résumés rédigés pour l'appli. Les mécaniques de jeu sont reproduites
          sans automatisme : les joueurs appliquent eux-mêmes les règles.
        </p>
        <p>
          Ayant droit, vous souhaitez qu'un contenu ou qu'un jeu soit retiré ? Écrivez à {mail} : le retrait est fait sans délai.
        </p>
        <h2>Règles d'usage</h2>
        <p>
          Chaque joueur n'ajoute que des cartes qu'il possède, en les photographiant lui-même avec l'appareil photo de l'appli.
          Il est interdit d'ajouter des images de cartes trouvées en ligne, photographiées sur un écran ou appartenant à quelqu'un d'autre.
          Le joueur s'y engage à son premier scan et reste responsable des images qu'il ajoute. En cas d'abus, ces images et le compte
          peuvent être supprimés sans préavis.
        </p>
        <h2>Signaler un contenu</h2>
        <p>
          Les joueurs publient eux-mêmes leurs photos de cartes, leurs messages et ceux de la tribune. Pour signaler un contenu
          illicite ou choquant, écrivez à {mail} en indiquant le code de la partie : il sera examiné et retiré s'il y a lieu.
        </p>
      </div>

      <div className="card-box">
        <h2>Données personnelles</h2>
        <p>Le responsable du traitement est l'éditeur du site (contact ci-dessus). Les données servent uniquement à faire fonctionner le jeu.</p>
        <h3>Ce qui est enregistré</h3>
        <ul>
          <li>Votre compte : adresse e-mail, pseudo, mot de passe (jamais stocké en clair) et vos réglages (thème, fond de tapis, dos des cartes).</li>
          <li>Vos photos de cartes, vos decks et vos parties (état du jeu, journal des actions).</li>
          <li>Le tchat de partie et les messages vocaux du talkie-walkie 🎤, visibles par les deux joueurs et par les spectateurs de la partie.</li>
          <li>Les messages de la tribune, publiés par les spectateurs sous le pseudo de leur choix.</li>
          <li>
            Les messages des salons de discussion, visibles par tous les joueurs connectés avec votre pseudo, et conservés jusqu'à leur
            suppression (par vous, ou par un administrateur s'ils ne respectent pas les règles : propos injurieux, haineux, publicité, spam).
            Messages privés : lisibles par les deux joueurs concernés seulement. Vous pouvez bloquer un joueur, ou signaler une
            conversation ; dans ce cas seulement, l'administrateur peut lire les derniers messages de cette conversation.
            Groupes privés (10 joueurs au plus) : lisibles par leurs membres seulement ; un joueur qui quitte le groupe ne le lit plus.
            Signaler un membre permet à l'administrateur de lire les derniers messages du groupe.
            Présence et profil : les joueurs connectés voient qui est en ligne et où (accueil, salons, partie, vocal, carte du jour),
            sauf si vous choisissez « Apparaître hors ligne » dans votre profil. Votre profil montre à eux seuls votre titre et vos badges,
            calculés à partir du nombre de vos parties, decks, cartes scannées, messages et résultats de la carte du jour.
            La carte du jour montre l'image d'une carte scannée par un joueur, sans dire laquelle ni de qui ; le classement du mois
            affiche les pseudos et les points. Rappel du soir (facultatif) : une notification si des joueurs ont des disponibilités
            en commun avec vous ce soir. Échanges : vos listes de cartes en double et recherchées (saison, numéro, nom, échange ou
            vente, prix) sont visibles des joueurs connectés avec votre pseudo, pour qu'ils puissent vous écrire. L'appli ne gère
            ni paiement ni envoi : tout se règle entre joueurs.
            Votre tapis et votre dos de cartes personnalisés sont vus par vos adversaires et les spectateurs de vos parties.
            Tout joueur peut les signaler : l'image est alors masquée aux autres jusqu'à la vérification de l'administrateur,
            qui peut la débloquer ou la supprimer.
            Les images jointes suivent les mêmes règles : pas de contenu choquant, et uniquement des images que vous avez le droit de partager.
            Les réactions aux messages (émojis) sont visibles par les joueurs connectés.
          </li>
          <li>
            Vos disponibilités (jours et heures de jeu de votre semaine type) : personne ne voit votre agenda ; les autres joueurs voient
            seulement votre pseudo, les créneaux que vous avez en commun avec eux, et vos préférences de jeu (vocal, cartes filmées…) avec votre petit mot. Les propositions de partie (jour, heure, petit mot)
            sont visibles par les deux joueurs concernés.
          </li>
        </ul>
        <h3>Ce qui n'est pas enregistré</h3>
        <ul>
          <li>
            Le vocal en direct 🎧, la vidéo d'un joueur filmé, les salons vocaux 🔊 et les partages d'écran ou de caméra passent
            directement d'un appareil à l'autre, sans être enregistrés. Pour établir ce lien direct, les appareils échangent leur adresse
            réseau (IP) et interrogent des serveurs publics de Google et de Cloudflare, qui voient donc cette adresse. Quand le lien direct
            est impossible (certains réseaux mobiles ou d'entreprise), le son et l'image passent par notre relais, toujours chiffrés
            de bout en bout : le relais ne peut ni les écouter ni les voir. Dans un salon vocal, les joueurs connectés voient qui y est.
          </li>
          <li>
            Si vous activez « 🔔 Me prévenir », l'adresse d'abonnement de votre appareil est enregistrée pour vous envoyer une notification
            quand quelqu'un rejoint votre table. La notification passe par le service de votre navigateur (Google, Apple, Mozilla…) et contient
            seulement le pseudo du joueur et le code de la table. Désactivez-la à tout moment au même endroit.
          </li>
          <li>Aucune publicité, aucun outil de mesure d'audience, aucun pistage. Le navigateur garde seulement votre session et vos préférences d'affichage.</li>
        </ul>
        <h3>Qui voit quoi</h3>
        <p>
          Vos photos de cartes sont privées : elles ne sont visibles des autres que lorsque vous jouez la carte (votre adversaire et les
          spectateurs de la partie la voient alors). Votre pseudo apparaît dans les parties, les tables ouvertes et la liste des parties en direct.
          Les données ne sont ni vendues ni transmises à quiconque ; elles sont hébergées dans l'Union européenne (Hetzner, Allemagne).
        </p>
        <h3>Durée et droits</h3>
        <p>
          Les données sont conservées tant que votre compte existe. Les messages techniques de mise en relation du vocal et de la vidéo
          sont effacés dès leur lecture, et au plus tard après 15 minutes. Vous pouvez à tout moment demander l'accès, la rectification ou
          l'effacement de vos données, ou vous opposer à leur traitement, en écrivant à {mail}. Vous pouvez aussi adresser une réclamation
          à la CNIL (cnil.fr).
        </p>
      </div>

      {user && (
        <div className="card-box">
          <h2>Supprimer mon compte</h2>
          <p className="muted small">
            Efface définitivement votre compte, vos photos de cartes, vos decks, les parties que vous avez créées et vos messages.
            Les parties où vous étiez invité restent chez votre adversaire, sans votre nom de compte.
          </p>
          <div className="field">
            <label>Pour confirmer, tapez SUPPRIMER</label>
            <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="SUPPRIMER" />
          </div>
          {err && <div className="err">{err}</div>}
          <button className="btn danger" disabled={confirm.trim().toUpperCase() !== "SUPPRIMER" || busy} onClick={deleteAccount}>
            Supprimer définitivement mon compte
          </button>
        </div>
      )}
      <p className="muted small" style={{ textAlign: "center" }}>Dernière mise à jour : 21 novembre 2026</p>
    </div>
  );
}
