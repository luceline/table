// Réactions rapides entre joueurs : envoyées comme un message de partie marqué (pas affiché dans le tchat),
// elles s'affichent en grand chez l'adversaire et chez les spectateurs.
export const REACTIONS = ["👍", "👏", "😂", "😮", "😱", "😭", "🔥", "💪", "🤔", "😈", "🙏", "GG"];
const PREFIX = "::r ";
export const reactionText = (r) => PREFIX + r;
export const reactionOf = (m) => (m?.text && !m.audio && m.text.startsWith(PREFIX) ? m.text.slice(PREFIX.length) : null);
