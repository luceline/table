#!/usr/bin/env bash
# Diagnostic en lecture seule : ne modifie rien sur le serveur.
echo "== Ports en écoute (80, 443, 8080-8099) =="
ss -tlnp | grep -E ':(80|443|80[89][0-9])\s' || echo "(aucun)"
echo
echo "== Processus PM2 =="
pm2 ls 2>/dev/null || echo "PM2 introuvable"
echo
echo "== Configuration nginx =="
nginx -t 2>&1 | tail -2
echo
echo "== Fichier(s) nginx qui servent resgestae.fr =="
grep -rlsn "resgestae.fr" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ || echo "(aucun trouvé)"
echo
echo "== Chemin /table déjà utilisé dans nginx ? =="
grep -rsn "location.*/table" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ || echo "non, libre"
echo
PORT="${PORT:-8091}"
echo "== Port $PORT =="
if ss -tln | grep -q ":$PORT\s"; then echo "OCCUPÉ : choisir un autre port (PORT=8092 bash deploy/install.sh)"; else echo "libre"; fi
