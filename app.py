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

# Disable SSL warnings for self-signed certs (common with Proxmox)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

# Configuration - you can also use environment variables
PROXMOX_HOST = os.getenv('PROXMOX_HOST', 'your-proxmox-ip:8006')
PROXMOX_USER = os.getenv('PROXMOX_USER', 'api@pam!dashboard')
PROXMOX_TOKEN = os.getenv('PROXMOX_TOKEN', 'your-api-token-here')

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
                        
                        containers.append({
                            'vmid': vmid,
                            'name': container.get('name', f'CT-{vmid}'),
                            'status': container.get('status', 'unknown'),
                            'node': node_name,
                            'ip': ip_address,
                            'uptime': container.get('uptime', 0),
                            'memory_usage': container.get('mem', 0),
                            'memory_max': container.get('maxmem', 0)
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
                            return ip_with_subnet.split('/')[0]  # Remove subnet mask
        
        return 'DHCP/Unknown'

# Initialize Proxmox API
proxmox = ProxmoxAPI(PROXMOX_HOST, PROXMOX_USER, PROXMOX_TOKEN)

@app.route('/')
def index():
    """Main dashboard page"""
    containers = proxmox.get_containers()
    last_updated = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    return render_template('index.html', containers=containers, last_updated=last_updated)

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
    app.run(host='0.0.0.0', port=5000, debug=True)