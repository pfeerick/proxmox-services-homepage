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

# Disable SSL warnings for self-signed certs (common with Proxmox)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

def load_config():
    """Load configuration from config.yaml file"""
    config_file = os.path.join(os.path.dirname(__file__), 'config.yaml')
    
    if not os.path.exists(config_file):
        print(f"Warning: {config_file} not found. Please create it from the template.")
        print("Using environment variables or defaults...")
        return {
            'proxmox': {
                'host': os.getenv('PROXMOX_HOST', 'your-proxmox-ip:8006'),
                'user': os.getenv('PROXMOX_USER', 'api@pam!dashboard'),
                'token': os.getenv('PROXMOX_TOKEN', 'your-api-token-here')
            },
            'flask': {
                'host': '0.0.0.0',
                'port': 5000,
                'debug': True
            },
            'dashboard': {
                'auto_refresh_seconds': 30,
                'title': 'Proxmox Container Dashboard'
            }
        }
    
    try:
        with open(config_file, 'r') as f:
            return yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f"Error reading config.yaml: {e}")
        raise

# Load configuration
config = load_config()

# Service lookup table for community script containers
SERVICE_MAP = {
    'paperless-ngx': {
        'port': 8000,
        'name': 'Paperless-NGX',
        'icon': '📄',
        'description': 'Document Management'
    },
    'wikijs': {
        'port': 3000,
        'name': 'Wiki.js',
        'icon': '📖',
        'description': 'Wiki Platform'
    },
    'homer': {
        'port': 8080,
        'name': 'Homer Dashboard',
        'icon': '🏠',
        'description': 'Static Dashboard'
    },
    'code-server': {
        'port': 8080,
        'name': 'VS Code Server',
        'icon': '💻',
        'description': 'Web-based IDE'
    },
    'syncthing': {
        'port': 8384,
        'name': 'Syncthing',
        'icon': '🔄',
        'description': 'File Synchronization'
    },
    'adguard': {
        'port': 3000,
        'name': 'AdGuard Home',
        'icon': '🛡️',
        'description': 'DNS Ad Blocker'
    },
    'jellyfin': {
        'port': 8096,
        'name': 'Jellyfin',
        'icon': '🎬',
        'description': 'Media Server'
    },
    'cloudflared': {
        'port': None,  # No web interface
        'name': 'Cloudflare Tunnel',
        'icon': '☁️',
        'description': 'Tunnel Service'
    },
    'unifi': {
        'port': 8443,
        'name': 'UniFi Controller',
        'icon': '📶',
        'description': 'Network Controller',
        'protocol': 'https'
    },
    'fileserver': {
        'port': 80,
        'name': 'File Server',
        'icon': '📁',
        'description': 'File Sharing'
    },
    'navidrome': {
        'port': 4533,
        'name': 'Navidrome',
        'icon': '🎵',
        'description': 'Music Server'
    },
    'dashy': {
        'port': 80,
        'name': 'Dashy Dashboard',
        'icon': '📊',
        'description': 'Dashboard'
    },
    'homebox': {
        'port': 7745,
        'name': 'Homebox',
        'icon': '📦',
        'description': 'Home Inventory'
    },
    'myspeed': {
        'port': 5216,
        'name': 'MySpeed',
        'icon': '⚡',
        'description': 'Speed Test'
    },
    'pulse': {
        'port': 8080,
        'name': 'Pulse',
        'icon': '💓',
        'description': 'Proxmox Monitor'
    },
    'homepage': {
        'port': 3000,
        'name': 'Homepage',
        'icon': '🏡',
        'description': 'Dashboard'
    }
}

def get_service_info(container_name):
    """Get service information for a container based on its name"""
    # Direct match first
    if container_name in SERVICE_MAP:
        return SERVICE_MAP[container_name]
    
    # Try partial matches for containers with suffixes (e.g., jellyfin-001, adguard-home)
    for service_name in SERVICE_MAP:
        if container_name.startswith(service_name):
            return SERVICE_MAP[service_name]
    
    # No match found
    return None

class ProxmoxAPI:
    def __init__(self, host, user, token):
        self.host = host
        self.user = user
        self.token = token
        self.base_url = f"https://{host}/api2/json"
        
    def get_containers(self):
        """Get all LXC containers with their IPs"""
        try:
            # Get all nodes first
            nodes_url = f"{self.base_url}/nodes"
            headers = {"Authorization": f"PVEAPIToken={self.user}={self.token}"}
            
            nodes_response = requests.get(nodes_url, headers=headers, verify=False, timeout=10)
            nodes_response.raise_for_status()
            nodes = nodes_response.json()['data']
            
            containers = []
            
            for node in nodes:
                node_name = node['node']
                # Get LXC containers for this node
                lxc_url = f"{self.base_url}/nodes/{node_name}/lxc"
                
                lxc_response = requests.get(lxc_url, headers=headers, verify=False, timeout=10)
                lxc_response.raise_for_status()
                lxc_list = lxc_response.json()['data']
                
                for container in lxc_list:
                    vmid = container['vmid']
                    
                    # Get detailed info including network config
                    detail_url = f"{self.base_url}/nodes/{node_name}/lxc/{vmid}/config"
                    detail_response = requests.get(detail_url, headers=headers, verify=False, timeout=10)
                    
                    if detail_response.status_code == 200:
                        config = detail_response.json()['data']
                        
                        # Extract IP from network config
                        ip_address = self._extract_ip_from_config(config)
                        
                        # If no static IP found, try to get the actual IP from running container
                        if not ip_address and container.get('status') == 'running':
                            ip_address = self._get_actual_ip_address(node_name, vmid)
                        
                        # Final fallback
                        if not ip_address:
                            ip_address = 'DHCP/Unknown'
                        
                        container_name = container.get('name', f'CT-{vmid}')
                        service_info = get_service_info(container_name)
                        
                        containers.append({
                            'vmid': vmid,
                            'name': container_name,
                            'status': container.get('status', 'unknown'),
                            'node': node_name,
                            'ip': ip_address,
                            'uptime': container.get('uptime', 0),
                            'memory_usage': container.get('mem', 0),
                            'memory_max': container.get('maxmem', 0),
                            'service': service_info
                        })
            
            return containers
            
        except requests.exceptions.RequestException as e:
            print(f"Error connecting to Proxmox: {e}")
            return []
        except Exception as e:
            print(f"Error parsing Proxmox data: {e}")
            return []
    
    def _extract_ip_from_config(self, config):
        """Extract IP address from container network configuration"""
        # Look for network interfaces (net0, net1, etc.)
        for key, value in config.items():
            if key.startswith('net') and isinstance(value, str):
                # Parse network config string
                if 'ip=' in value:
                    # Extract IP from string like "name=eth0,bridge=vmbr0,ip=192.168.1.100/24"
                    parts = value.split(',')
                    for part in parts:
                        if part.strip().startswith('ip='):
                            ip_with_subnet = part.strip()[3:]  # Remove 'ip='
                            if ip_with_subnet.lower() != 'dhcp':
                                return ip_with_subnet.split('/')[0]  # Remove subnet mask
        
        return None  # Return None instead of 'DHCP/Unknown' for now
    
    def _get_actual_ip_address(self, node_name, vmid):
        """Get the actual IP address from the running container"""
        try:
            # Get the current status which includes network info
            status_url = f"{self.base_url}/nodes/{node_name}/lxc/{vmid}/status/current"
            headers = {"Authorization": f"PVEAPIToken={self.user}={self.token}"}
            
            status_response = requests.get(status_url, headers=headers, verify=False, timeout=10)
            status_response.raise_for_status()
            status_data = status_response.json()['data']
            
            # Check if there's network information in the status
            if 'netin' in status_data or 'netout' in status_data:
                # Try to get network interfaces
                interfaces_url = f"{self.base_url}/nodes/{node_name}/lxc/{vmid}/interfaces"
                interfaces_response = requests.get(interfaces_url, headers=headers, verify=False, timeout=10)
                
                if interfaces_response.status_code == 200:
                    interfaces = interfaces_response.json()['data']
                    # Look for the first non-loopback interface with an IP
                    for interface in interfaces:
                        if interface.get('name') != 'lo' and 'inet' in interface:
                            ip = interface['inet']
                            # Remove subnet mask if present
                            if '/' in ip:
                                ip = ip.split('/')[0]
                            return ip
            
            return None
            
        except Exception as e:
            print(f"Error getting actual IP for container {vmid}: {e}")
            return None

# Initialize Proxmox API
proxmox = ProxmoxAPI(
    config['proxmox']['host'], 
    config['proxmox']['user'], 
    config['proxmox']['token']
)

@app.route('/')
def index():
    """Main dashboard page"""
    containers = proxmox.get_containers()
    last_updated = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    return render_template('index.html', 
                         containers=containers, 
                         last_updated=last_updated,
                         config=config['dashboard'])

@app.route('/api/containers')
def api_containers():
    """JSON API endpoint for containers"""
    containers = proxmox.get_containers()
    return jsonify({
        'containers': containers,
        'last_updated': datetime.now().isoformat(),
        'total': len(containers)
    })

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})

if __name__ == '__main__':
    flask_config = config['flask']
    app.run(
        host=flask_config['host'], 
        port=flask_config['port'], 
        debug=flask_config['debug']
    )