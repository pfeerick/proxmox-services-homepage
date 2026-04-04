#!/usr/bin/env python3
"""
Proxmox LXC Container IP Dashboard
A simple Flask app to display all LXC container IPs from Proxmox VE
"""

from flask import Flask, render_template, jsonify
import requests
import urllib3
from datetime import datetime
import os
import yaml
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import threading

app = Flask(__name__)

# Directory containing this file — used consistently by config loaders and
# the file watcher so the app works regardless of the working directory.
APP_DIR = os.path.dirname(os.path.abspath(__file__))

# Global variables for config, services, and Proxmox API client.
# All three are replaced atomically under config_lock on reload.
config = None
SERVICE_MAP = None
proxmox = None
config_lock = threading.Lock()

# Container cache — refreshed by a single background thread so multiple
# browser tabs never each trigger independent Proxmox API calls.
_container_cache = {"containers": [], "last_updated": None}
_cache_lock = threading.Lock()
_refresh_event = threading.Event()  # set to trigger an immediate cache refresh


class ProxmoxAPI:
    """Client for the Proxmox VE API. Owns its connection settings so it
    carries no references to module-level state. reload_configs() replaces
    the module-level proxmox instance atomically under config_lock, meaning
    in-flight requests complete against the old instance while new requests
    pick up the new one."""

    def __init__(self, host, user, token, ssl_verify=False):
        self.host = host
        self.user = user
        self.token = token
        self.ssl_verify = ssl_verify
        self._base_url = f"https://{host}/api2/json"
        self._headers = {"Authorization": f"PVEAPIToken={user}={token}"}
        # Proxmox ships with a self-signed cert by default. Suppress warnings
        # when verification is disabled to avoid noise on every request.
        # Set proxmox.ssl_verify in config.yaml to enable verification with
        # the system CA bundle (true) or a custom CA cert ("/path/to/ca.pem").
        if not ssl_verify:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def check_connection(self):
        """Probe the Proxmox API. Returns (True, None) or (False, error_str)."""
        try:
            response = requests.get(
                f"{self._base_url}/nodes",
                headers=self._headers,
                verify=self.ssl_verify,
                timeout=5,
            )
            response.raise_for_status()
            return True, None
        except requests.exceptions.RequestException as e:
            return False, str(e)

    def get_containers(self, service_map):
        """Get all LXC containers with their IPs.

        service_map should be a snapshot of SERVICE_MAP taken by the caller
        under config_lock so service enrichment is consistent for the full
        duration of the request.
        """
        try:
            nodes_response = requests.get(
                f"{self._base_url}/nodes",
                headers=self._headers,
                verify=self.ssl_verify,
                timeout=10,
            )
            nodes_response.raise_for_status()
            nodes = nodes_response.json()["data"]

            containers = []

            for node in nodes:
                node_name = node["node"]
                # Get LXC containers for this node
                lxc_response = requests.get(
                    f"{self._base_url}/nodes/{node_name}/lxc",
                    headers=self._headers,
                    verify=self.ssl_verify,
                    timeout=10,
                )
                lxc_response.raise_for_status()
                lxc_list = lxc_response.json()["data"]

                for container in lxc_list:
                    vmid = container["vmid"]

                    # Get detailed info including network config
                    detail_response = requests.get(
                        f"{self._base_url}/nodes/{node_name}/lxc/{vmid}/config",
                        headers=self._headers,
                        verify=self.ssl_verify,
                        timeout=10,
                    )

                    if detail_response.status_code == 200:
                        lxc_config = detail_response.json()["data"]

                        # Extract IP from network config
                        ip_address = self._extract_ip_from_config(lxc_config)

                        # If no static IP found, try to get the actual IP from running container
                        if not ip_address and container.get("status") == "running":
                            ip_address = self._get_actual_ip_address(node_name, vmid)

                        # Final fallback
                        if not ip_address:
                            ip_address = "DHCP/Unknown"

                        container_name = container.get("name", f"CT-{vmid}")
                        service_info = service_map.get(container_name)
                        if service_info is None:
                            for service_name in service_map:
                                if container_name.startswith(service_name):
                                    service_info = service_map[service_name]
                                    break

                        containers.append(
                            {
                                "vmid": vmid,
                                "name": container_name,
                                "status": container.get("status", "unknown"),
                                "node": node_name,
                                "ip": ip_address,
                                "uptime": container.get("uptime", 0),
                                "memory_usage": container.get("mem", 0),
                                "memory_max": container.get("maxmem", 0),
                                "service": service_info,
                            }
                        )

            return containers

        except requests.exceptions.RequestException as e:
            print(f"Error connecting to Proxmox: {e}")
            return []
        except Exception as e:
            print(f"Error parsing Proxmox data: {e}")
            return []

    def _extract_ip_from_config(self, lxc_config):
        """Extract IP address from container network configuration"""
        # Look for network interfaces (net0, net1, etc.)
        for key, value in lxc_config.items():
            if key.startswith("net") and isinstance(value, str):
                if "ip=" in value:
                    # Parse network config string like "name=eth0,bridge=vmbr0,ip=192.168.1.100/24"
                    for part in value.split(","):
                        if part.strip().startswith("ip="):
                            ip_with_subnet = part.strip()[3:]  # Remove 'ip='
                            if ip_with_subnet.lower() != "dhcp":
                                return ip_with_subnet.split("/")[0]  # Remove subnet mask
        return None

    def _get_actual_ip_address(self, node_name, vmid):
        """Get the actual IP address from the running container"""
        try:
            status_response = requests.get(
                f"{self._base_url}/nodes/{node_name}/lxc/{vmid}/status/current",
                headers=self._headers,
                verify=self.ssl_verify,
                timeout=10,
            )
            status_response.raise_for_status()
            status_data = status_response.json()["data"]

            # Check if there's network information in the status
            if "netin" in status_data or "netout" in status_data:
                interfaces_response = requests.get(
                    f"{self._base_url}/nodes/{node_name}/lxc/{vmid}/interfaces",
                    headers=self._headers,
                    verify=self.ssl_verify,
                    timeout=10,
                )

                if interfaces_response.status_code == 200:
                    interfaces = interfaces_response.json()["data"]

                    # Prefer eth0 if available
                    for interface in interfaces:
                        if interface.get("name") == "eth0" and "inet" in interface:
                            ip = interface["inet"]
                            return ip.split("/")[0] if "/" in ip else ip

                    # Fallback: first non-loopback interface with an IP
                    for interface in interfaces:
                        if interface.get("name") != "lo" and "inet" in interface:
                            ip = interface["inet"]
                            return ip.split("/")[0] if "/" in ip else ip

            return None

        except Exception as e:
            print(f"Error getting actual IP for container {vmid}: {e}")
            return None


class ConfigWatcher(FileSystemEventHandler):
    """File system event handler for config file changes"""

    def on_modified(self, event):
        if event.is_directory:
            return

        filename = os.path.basename(event.src_path)
        if filename in ["config.yaml", "services.yaml"]:
            print(f"📁 Config file changed: {filename}")
            reload_configs()


def load_config():
    """Load configuration from config.yaml file"""
    config_file = os.path.join(APP_DIR, "config.yaml")

    if not os.path.exists(config_file):
        print(f"Warning: {config_file} not found. Please create it from the template.")
        print("Using environment variables or defaults...")
        return {
            "proxmox": {
                "host": os.getenv("PROXMOX_HOST", "your-proxmox-ip:8006"),
                "user": os.getenv("PROXMOX_USER", "api@pam!dashboard"),
                "token": os.getenv("PROXMOX_TOKEN", "your-api-token-here"),
                "ssl_verify": False,
            },
            "flask": {"host": "0.0.0.0", "port": 8000, "debug": True},
            "dashboard": {"auto_refresh_seconds": 30, "title": "Proxmox Container Dashboard"},
        }

    try:
        with open(config_file, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f"Error reading config.yaml: {e}")
        raise


def load_services():
    """Load service definitions from services.yaml file"""
    services_file = os.path.join(APP_DIR, "services.yaml")

    if not os.path.exists(services_file):
        print(f"Warning: {services_file} not found. Using default service definitions.")
        # Fallback to hardcoded services if file doesn't exist
        return {
            "jellyfin": {
                "port": 8096,
                "name": "Jellyfin",
                "icon": "🎬",
                "description": "Media Server",
            },
            "homepage": {
                "port": 3000,
                "name": "Homepage",
                "icon": "🏡",
                "description": "Dashboard",
            },
        }

    try:
        with open(services_file, "r", encoding="utf-8") as f:
            services_data = yaml.safe_load(f)
            return services_data.get("services", {})
    except yaml.YAMLError as e:
        print(f"Error reading services.yaml: {e}")
        raise


def reload_configs():
    """Reload config and services files, then rebuild the Proxmox API client."""
    global config, SERVICE_MAP, proxmox

    with config_lock:
        try:
            print("🔄 Reloading configuration files...")
            config = load_config()
            SERVICE_MAP = load_services()
            proxmox = ProxmoxAPI(
                config["proxmox"]["host"],
                config["proxmox"]["user"],
                config["proxmox"]["token"],
                config["proxmox"].get("ssl_verify", False),
            )
            print(f"✅ Loaded {len(SERVICE_MAP)} service definitions")
        except Exception as e:
            print(f"❌ Error reloading configs: {e}")

    # Trigger an immediate cache refresh so the new config is reflected at once
    _refresh_event.set()


def setup_file_watcher():
    """Set up file system watcher for config files"""
    event_handler = ConfigWatcher()
    observer = Observer()
    observer.schedule(event_handler, path=APP_DIR, recursive=False)
    observer.start()
    print("👁️  File watcher started - configs will auto-reload on changes")
    return observer


# Load initial configuration, services, and Proxmox API client
reload_configs()

# Start file watcher
file_observer = setup_file_watcher()


def _refresh_cache():
    """Background thread: keep the container cache fresh.

    Refreshes once per auto_refresh_seconds. Setting _refresh_event skips the
    wait and triggers an immediate refresh — reload_configs() does this so the
    cache reflects new config without waiting for the next scheduled cycle.
    """
    while True:
        with config_lock:
            interval = config["dashboard"]["auto_refresh_seconds"]
            service_map = SERVICE_MAP
            current_proxmox = proxmox

        containers = current_proxmox.get_containers(service_map)

        with _cache_lock:
            _container_cache["containers"] = containers
            _container_cache["last_updated"] = datetime.now().isoformat()

        _refresh_event.wait(timeout=interval)
        _refresh_event.clear()


# Start background cache refresh thread
_cache_thread = threading.Thread(target=_refresh_cache, daemon=True, name="cache-refresh")
_cache_thread.start()


def get_service_info(container_name):
    """Get service information for a container based on its name"""
    with config_lock:
        # Direct match first
        if container_name in SERVICE_MAP:
            return SERVICE_MAP[container_name]

        # Try partial matches for containers with suffixes (e.g., jellyfin-001, adguard-home)
        for service_name in SERVICE_MAP:
            if container_name.startswith(service_name):
                return SERVICE_MAP[service_name]

        # No match found
        return None


@app.route("/")
def simple_homepage():
    """Simple homepage with just running services"""
    with config_lock:
        dashboard_config = config["dashboard"]

    # Start with loading state, let JavaScript fetch the data
    return render_template("simple.html", services=[], config=dashboard_config, loading=True)


@app.route("/detailed")
def detailed_dashboard():
    """Detailed dashboard page with all container info"""
    with config_lock:
        dashboard_config = config["dashboard"]

    # Start with loading state, let JavaScript fetch the data
    return render_template(
        "index.html", containers=[], last_updated=None, config=dashboard_config, loading=True
    )


@app.route("/api/containers")
def api_containers():
    """JSON API endpoint for containers"""
    with _cache_lock:
        containers = _container_cache["containers"]
        last_updated = _container_cache["last_updated"]
    return jsonify(
        {
            "containers": containers,
            "last_updated": last_updated or datetime.now().isoformat(),
            "total": len(containers),
        }
    )


@app.route("/api/services")
def api_services():
    """JSON API endpoint for running services"""
    with _cache_lock:
        containers = _container_cache["containers"]
        last_updated = _container_cache["last_updated"]

    # Filter to only running containers with known IPs and services
    running_services = []
    for container in containers:
        if (
            container["status"] == "running"
            and container["ip"] != "DHCP/Unknown"
            and container["service"]
            and container["service"]["port"]
        ):
            protocol = container["service"].get("protocol", "http")
            url = f"{protocol}://{container['ip']}:{container['service']['port']}"

            running_services.append(
                {
                    "name": container["service"]["name"],
                    "icon": container["service"]["icon"],
                    "url": url,
                    "description": container["service"]["description"],
                    "container_name": container["name"],
                }
            )

    # Sort alphabetically by service name
    running_services.sort(key=lambda x: x["name"].lower())

    return jsonify(
        {
            "services": running_services,
            "last_updated": last_updated or datetime.now().isoformat(),
            "total": len(running_services),
        }
    )


@app.route("/health")
def health():
    """Health check endpoint — returns 503 if Proxmox is unreachable"""
    ok, error = proxmox.check_connection()
    body = {"status": "healthy" if ok else "unhealthy", "timestamp": datetime.now().isoformat()}
    if error:
        body["error"] = error
    return jsonify(body), (200 if ok else 503)


def main():
    try:
        with config_lock:
            flask_config = config["flask"]

        print(f"🚀 Starting Proxmox Dashboard on {flask_config['host']}:{flask_config['port']}")
        app.run(host=flask_config["host"], port=flask_config["port"], debug=flask_config["debug"])
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
    finally:
        # Clean up file watcher
        if "file_observer" in globals():
            file_observer.stop()
            file_observer.join()
            print("🛑 File watcher stopped")


if __name__ == "__main__":
    main()
