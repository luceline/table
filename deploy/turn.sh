#!/usr/bin/env bash
# Relais de connexion (TURN, coturn) pour la vidéo et le vocal : quand deux appareils n'arrivent pas à se joindre
# directement (4G, certaines box, réseaux d'entreprise), le son et l'image passent par ce relais, toujours chiffrés
# de bout en bout (le relais ne peut ni les écouter ni les voir).
# À lancer une seule fois sur le serveur, en root, depuis le dossier du dépôt :  bash deploy/turn.sh
# Relancer le script est sans danger (même secret, configuration réécrite).
set -euo pipefail
main() {
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  CONF="$ROOT/turn/turn.json"
  [ "$(id -u)" = "0" ] || { echo "À lancer en root."; exit 1; }

  # Adresse IPv4 publique du serveur
  IP="${TURN_IP:-$(hostname -I | tr ' ' '\n' | grep -E '^[0-9]+\.' | grep -vE '^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[01])\.' | head -1)}"
  [ -n "$IP" ] || IP="$(curl -4 -fs https://api.ipify.org || true)"
  [ -n "$IP" ] || { echo "Adresse IP publique introuvable : relancer avec TURN_IP=1.2.3.4 bash deploy/turn.sh"; exit 1; }

  echo "Installation de coturn…"
  command -v turnserver >/dev/null 2>&1 || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq coturn; }

  mkdir -p "$ROOT/turn"
  SECRET=""
  [ -f "$CONF" ] && SECRET="$(sed -n 's/.*"secret": *"\([a-f0-9]*\)".*/\1/p' "$CONF")"
  [ -n "$SECRET" ] || SECRET="$(openssl rand -hex 32)"

  cat > /etc/turnserver.conf <<EOF
# Relais de Table de jeu (généré par deploy/turn.sh)
listening-port=3478
external-ip=$IP
fingerprint
use-auth-secret
static-auth-secret=$SECRET
realm=table.resgestae.fr
min-port=49160
max-port=49999
total-quota=60
user-quota=12
max-bps=2500000
stale-nonce=600
no-multicast-peers
no-loopback-peers
no-cli
no-tls
no-dtls
syslog
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=198.18.0.0-198.19.255.255
denied-peer-ip=224.0.0.0-255.255.255.255
EOF
  [ -f /etc/default/coturn ] && sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
  systemctl enable coturn >/dev/null 2>&1 || true
  systemctl restart coturn

  # Pare-feu du serveur (s'il est actif)
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    ufw allow 3478/udp >/dev/null
    ufw allow 3478/tcp >/dev/null
    ufw allow 49160:49999/udp >/dev/null
    echo "Pare-feu : ports 3478 (UDP et TCP) et 49160-49999 (UDP) ouverts."
  fi

  umask 077
  printf '{\n  "secret": "%s",\n  "urls": ["turn:%s:3478?transport=udp", "turn:%s:3478?transport=tcp"]\n}\n' "$SECRET" "$IP" "$IP" > "$CONF"
  chmod 600 "$CONF"

  sleep 1
  if systemctl is-active --quiet coturn; then
    echo "Relais installé sur $IP:3478. Rien à redémarrer : l'appli l'utilise dès maintenant."
    echo "Si votre hébergeur a un pare-feu dans son interface (Hetzner : Firewalls), y ouvrir aussi"
    echo "3478 en UDP et TCP, et 49160-49999 en UDP."
  else
    echo "coturn ne démarre pas : voir « journalctl -u coturn -n 30 »."
    exit 1
  fi
}
main "$@"
exit
