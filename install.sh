#!/usr/bin/env bash
# Proxmox Services Homepage — installer / updater
# Run inside a Proxmox LXC (Debian/Ubuntu):
#   bash <(curl -fsSL https://raw.githubusercontent.com/pfeerick/proxmox-services-homepage/master/install.sh)
# Or, from inside a cloned repo:
#   bash install.sh
set -euo pipefail

INSTALL_DIR="/opt/dashboard"
SERVICE_FILE="/etc/systemd/system/dashboard.service"
UPDATE_SERVICE_FILE="/etc/systemd/system/dashboard-update.service"
UPDATE_TIMER_FILE="/etc/systemd/system/dashboard-update.timer"
REPO_URL="https://github.com/pfeerick/proxmox-services-homepage.git"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()    { echo -e "\e[32m[+]\e[0m $*"; }
warn()    { echo -e "\e[33m[!]\e[0m $*"; }
heading() { echo -e "\n\e[1;34m==> $*\e[0m"; }
ask()     { read -rp "    $1: " "$2"; }
ask_default() {
    # ask_default "Prompt" VAR_NAME "default value"
    read -rp "    $1 [${3}]: " "$2"
    [[ -z "${!2}" ]] && printf -v "$2" '%s' "$3"
}
ask_yn() {
    # ask_yn "Prompt [y/N]" VAR_NAME
    read -rp "    $1 " "$2"
    [[ "${!2,,}" == "y" ]]
}

# ---------------------------------------------------------------------------
# Root check
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root." >&2
    exit 1
fi

IS_UPDATE=false
[[ -d "$INSTALL_DIR/.git" ]] && IS_UPDATE=true

if $IS_UPDATE; then
    heading "Updating Proxmox Services Homepage"
else
    heading "Installing Proxmox Services Homepage"
fi

# ---------------------------------------------------------------------------
# System dependencies
# ---------------------------------------------------------------------------
heading "Installing system dependencies"
apt-get update -qq
apt-get install -y -qq git curl

# ---------------------------------------------------------------------------
# uv
# ---------------------------------------------------------------------------
heading "Checking uv"
UV_BIN=""
for candidate in /root/.local/bin/uv /usr/local/bin/uv; do
    [[ -x "$candidate" ]] && UV_BIN="$candidate" && break
done

if [[ -z "$UV_BIN" ]]; then
    info "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    UV_BIN="/root/.local/bin/uv"
else
    info "uv found at $UV_BIN"
fi

# ---------------------------------------------------------------------------
# Clone or update repo
# ---------------------------------------------------------------------------
heading "Setting up repository"
if $IS_UPDATE; then
    info "Pulling latest changes..."
    git -C "$INSTALL_DIR" pull
else
    info "Cloning into $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

# ---------------------------------------------------------------------------
# Python dependencies
# ---------------------------------------------------------------------------
heading "Installing Python dependencies"
"$UV_BIN" sync --project "$INSTALL_DIR"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
heading "Configuration"
CONFIG_FILE="$INSTALL_DIR/config.yaml"

if [[ -f "$CONFIG_FILE" ]]; then
    info "config.yaml already exists — skipping (edit $CONFIG_FILE to change settings)"
else
    info "No config.yaml found — let's create one."
    echo

    ask       "Proxmox host and port (e.g. 192.168.0.1:8006)" PROXMOX_HOST
    ask       "API user (e.g. dashboard@pam!token)"           PROXMOX_USER
    ask       "API token secret"                               PROXMOX_TOKEN
    ask_default "Dashboard port"                              DASHBOARD_PORT "8080"
    ask_default "Dashboard title"                             DASHBOARD_TITLE "Proxmox Container Dashboard"
    ask_default "Cache refresh interval (seconds)"           REFRESH_SECS "30"

    cp "$INSTALL_DIR/config.yaml.example" "$CONFIG_FILE"
    chmod 600 "$CONFIG_FILE"

    # Fill in values using Python (avoids sed quoting pitfalls with special chars)
    "$UV_BIN" run --project "$INSTALL_DIR" python3 - <<PYEOF
import yaml, sys

with open("$CONFIG_FILE") as f:
    cfg = yaml.safe_load(f)

cfg["proxmox"]["host"]  = "$PROXMOX_HOST"
cfg["proxmox"]["user"]  = "$PROXMOX_USER"
cfg["proxmox"]["token"] = "$PROXMOX_TOKEN"
cfg["flask"]["port"]    = int("$DASHBOARD_PORT")
cfg["flask"]["debug"]   = False
cfg["dashboard"]["auto_refresh_seconds"] = int("$REFRESH_SECS")
cfg["dashboard"]["title"] = "$DASHBOARD_TITLE"

with open("$CONFIG_FILE", "w") as f:
    yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True)

print("    config.yaml written.")
PYEOF
fi

# ---------------------------------------------------------------------------
# Systemd service
# ---------------------------------------------------------------------------
heading "Setting up systemd service"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Proxmox Services Dashboard
After=network.target

[Service]
WorkingDirectory=$INSTALL_DIR
ExecStart=$UV_BIN run --project $INSTALL_DIR dashboard
Restart=always
RestartSec=5
Environment=PATH=/root/.local/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now dashboard
info "Service started."

# ---------------------------------------------------------------------------
# Optional: daily auto-update timer
# ---------------------------------------------------------------------------
echo
if ask_yn "Set up a daily auto-update from GitHub? [y/N]" _SETUP_TIMER; then
    cat > "$UPDATE_SERVICE_FILE" << EOF
[Unit]
Description=Update Proxmox Services Dashboard
After=network.target

[Service]
Type=oneshot
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/git -C $INSTALL_DIR pull
ExecStart=$UV_BIN sync --project $INSTALL_DIR
ExecStartPost=/bin/systemctl restart dashboard
EOF

    cat > "$UPDATE_TIMER_FILE" << EOF
[Unit]
Description=Daily update of Proxmox Services Dashboard

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF

    systemctl daemon-reload
    systemctl enable --now dashboard-update.timer
    info "Auto-update timer enabled."
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
PORT=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
    cfg = yaml.safe_load(f)
print(cfg['flask']['port'])
" 2>/dev/null || echo "8080")

echo
echo -e "\e[1;32m✓ Done!\e[0m"
echo "  Dashboard: http://$(hostname -I | awk '{print $1}'):${PORT}"
echo "  Config:    $CONFIG_FILE"
echo "  Logs:      journalctl -u dashboard -f"
echo
