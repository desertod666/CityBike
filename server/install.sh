#!/bin/sh
# Run as root with this directory as the working directory. Only CityBike is changed.
set -eu
test "$(id -u)" = 0
id citybike >/dev/null 2>&1 || useradd --system --home-dir /opt/citybike --shell /usr/sbin/nologin citybike
install -d -m 0755 /opt/citybike/app
install -d -o citybike -g citybike -m 0700 /opt/citybike/data
install -d -o root -g citybike -m 0750 /opt/citybike/config
install -m 0644 receiver.py /opt/citybike/app/receiver.py
if [ ! -f /opt/citybike/config/clients.json ]; then
    printf '{"clients":[]}\n' > /opt/citybike/config/clients.json
fi
chown root:citybike /opt/citybike/config/clients.json
chmod 0640 /opt/citybike/config/clients.json
install -m 0644 citybike.service /etc/systemd/system/citybike.service
systemctl daemon-reload
systemctl enable --now citybike.service
systemctl restart citybike.service
systemctl is-active citybike.service
