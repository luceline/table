#!/usr/bin/env bash
# Mise à jour : récupère la dernière version et redémarre (les nouvelles migrations s'appliquent au démarrage).
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
pm2 restart pb-table
echo "À jour. Recharger la page sur le téléphone suffit (pas de cache d'appli)."
