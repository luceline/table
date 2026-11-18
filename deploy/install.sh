#!/usr/bin/env bash
# Installation initiale. À lancer depuis le dossier du dépôt cloné (ex : /opt/table).
#   PORT=8091 bash deploy/install.sh
set -euo pipefail
PORT="${PORT:-8091}"
PB_VER="0.23.4"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ss -tln | grep -q ":$PORT\s"; then
  echo "Le port $PORT est déjà utilisé. Lancer « bash deploy/check.sh » pour trouver un port libre."
  exit 1
fi
if pm2 describe pb-table >/dev/null 2>&1; then
  echo "Un processus PM2 « pb-table » existe déjà. Pour mettre à jour : bash deploy/update.sh"
  exit 1
fi

cd "$ROOT/pocketbase"
if [ ! -x ./pocketbase ]; then
  echo "Téléchargement de PocketBase $PB_VER…"
  wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VER}/pocketbase_${PB_VER}_linux_amd64.zip" -O pb.zip
  unzip -oq pb.zip pocketbase && rm pb.zip
  chmod +x ./pocketbase
fi

read -rp "E-mail du compte administrateur PocketBase : " PB_EMAIL
read -rsp "Mot de passe (10 caractères minimum) : " PB_PASS; echo
./pocketbase superuser upsert "$PB_EMAIL" "$PB_PASS"

pm2 start ./pocketbase --name pb-table --cwd "$ROOT/pocketbase" -- serve --http="127.0.0.1:$PORT"
pm2 save

sleep 2
if curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null; then
  echo "PocketBase tourne sur 127.0.0.1:$PORT."
else
  echo "PocketBase ne répond pas : voir « pm2 logs pb-table »."
  exit 1
fi
[ "$PORT" != "8091" ] && echo "ATTENTION : remplacer 8091 par $PORT dans deploy/nginx-table.conf avant de le coller."
echo "Étape suivante : coller deploy/nginx-table.conf dans le bloc server HTTPS de resgestae.fr, puis : nginx -t && systemctl reload nginx"
