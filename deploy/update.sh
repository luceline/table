#!/usr/bin/env bash
# Mise à jour : récupère la dernière version et redémarre (les nouvelles migrations s'appliquent au démarrage).
# Tout est dans une fonction : bash la lit en entier avant de l'exécuter, même si « git pull » modifie ce fichier.
set -euo pipefail
main() {
  cd "$(dirname "$0")/.."
  git pull --ff-only
  # Notifications : bibliothèque du script d'envoi (une seule fois) et clés secrètes (créées si absentes)
  if command -v node >/dev/null 2>&1 && [ -f push/package.json ]; then
    ( cd push && { [ -d node_modules/web-push ] || npm install --omit=dev --no-audit --no-fund; } && node keys.js ) \
      || echo "Notifications : installation à vérifier dans le dossier push."
  else
    echo "Notifications : Node introuvable, les notifications ne partiront pas."
  fi
  pm2 restart pb-table
  echo "À jour. Recharger la page sur le téléphone suffit (pas de cache d'appli)."
}
main "$@"
exit
