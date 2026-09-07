#!/bin/bash
# One-time setup on the pearlbloom VM (run as root). Safe to re-run.
set -e
cd /var/app/pearl-and-bloom/admin
sudo -u harbourlab -H npm install --omit=dev --silent
if [ ! -f /etc/pearlbloom-admin.env ]; then
  TOKEN=$(openssl rand -hex 32)
  printf 'ADMIN_TOKEN=%s\nWORKER_URL=https://pearlandbloom.us\n' "$TOKEN" > /etc/pearlbloom-admin.env
  chown root:harbourlab /etc/pearlbloom-admin.env; chmod 640 /etc/pearlbloom-admin.env
  echo "created /etc/pearlbloom-admin.env (new ADMIN_TOKEN)"
fi
cp pearlbloom-admin.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now pearlbloom-admin
systemctl restart pearlbloom-admin
tailscale serve --bg --set-path /admin http://127.0.0.1:8100 >/dev/null
sleep 1; systemctl is-active pearlbloom-admin; tailscale serve status
