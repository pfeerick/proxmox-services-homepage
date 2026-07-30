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
    # NOTE: use an explicit `if` rather than `[[ ... ]] && ...` — the latter returns
    # non-zero when the user supplies a value, which aborts the script under `set -e`.
    read -rp "    $1 [${3}]: " "$2"
    if [[ -z "${!2}" ]]; then
        printf -v "$2" '%s' "$3"
    fi
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
apt-get install -y -qq git curl unzip

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
# Bun (pinned to the version in .mise.toml, so deploys match tested dev builds)
# ---------------------------------------------------------------------------
heading "Checking Bun"
PINNED_BUN_VERSION=""
if [[ -f "$INSTALL_DIR/.mise.toml" ]]; then
    PINNED_BUN_VERSION=$(grep -E '^bun[[:space:]]*=' "$INSTALL_DIR/.mise.toml" | sed -E 's/.*"([^"]+)".*/\1/')
fi

BUN_BIN=""
for candidate in /root/.bun/bin/bun /usr/local/bin/bun; do
    [[ -x "$candidate" ]] && BUN_BIN="$candidate" && break
done
CURRENT_BUN_VERSION=""
[[ -n "$BUN_BIN" ]] && CURRENT_BUN_VERSION="$("$BUN_BIN" --version)"

if [[ -n "$BUN_BIN" && "$CURRENT_BUN_VERSION" == "$PINNED_BUN_VERSION" ]]; then
    info "Bun v$CURRENT_BUN_VERSION found at $BUN_BIN (matches pinned version)"
elif [[ -n "$PINNED_BUN_VERSION" ]]; then
    info "Installing Bun v$PINNED_BUN_VERSION (pinned in .mise.toml)..."
    curl -fsSL https://bun.sh/install | bash -s "bun-v$PINNED_BUN_VERSION"
    BUN_BIN="/root/.bun/bin/bun"
else
    warn "No .mise.toml found — installing latest Bun"
    curl -fsSL https://bun.sh/install | bash
    BUN_BIN="/root/.bun/bin/bun"
fi

# ---------------------------------------------------------------------------
# Dependencies and JS bundle
# ---------------------------------------------------------------------------
heading "Installing dependencies"
"$BUN_BIN" install --cwd "$INSTALL_DIR"

heading "Building frontend bundle"
"$BUN_BIN" run --cwd "$INSTALL_DIR" build

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
heading "Configuration"
CONFIG_FILE="$INSTALL_DIR/config.toml"

if [[ -f "$CONFIG_FILE" ]]; then
    info "config.toml already exists — skipping (edit $CONFIG_FILE to change settings)"
else
    info "No config.toml found — let's create one."
    echo

    ask         "Proxmox host and port (e.g. 192.168.0.1:8006)" PROXMOX_HOST
    ask         "API user (e.g. dashboard@pam!token)"            PROXMOX_USER
    ask         "API token secret"                                PROXMOX_TOKEN
    ask_default "Dashboard port"                                  DASHBOARD_PORT "8000"
    ask_default "Dashboard title"                                 DASHBOARD_TITLE "Proxmox Container Dashboard"
    ask_default "Cache refresh interval (seconds)"               REFRESH_SECS "30"

    cat > "$CONFIG_FILE" << TOMLEOF
[proxmox]
host = "$PROXMOX_HOST"
user = "$PROXMOX_USER"
token = "$PROXMOX_TOKEN"
ssl_verify = false

[server]
host = "0.0.0.0"
port = $DASHBOARD_PORT

[dashboard]
auto_refresh_seconds = $REFRESH_SECS
title = "$DASHBOARD_TITLE"
TOMLEOF

    chmod 600 "$CONFIG_FILE"
    info "config.toml written."
fi

# Read port for the summary at the end
DASHBOARD_PORT=$(awk '/^\[server\]/{s=1} s && /^port/{print $3; exit}' "$CONFIG_FILE" 2>/dev/null || echo "8000")

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
ExecStart=$BUN_BIN run $INSTALL_DIR/src/index.ts
Restart=always
RestartSec=5
Environment=PATH=/root/.bun/bin:/usr/local/bin:/usr/bin:/bin

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
ExecStart=/bin/bash $INSTALL_DIR/install.sh
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
echo
echo -e "\e[1;32m✓ Done!\e[0m"
echo "  Dashboard: http://$(hostname -I | awk '{print $1}'):${DASHBOARD_PORT}"
echo "  Config:    $CONFIG_FILE"
echo "  Logs:      journalctl -u dashboard -f"
echo
