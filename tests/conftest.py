import pytest

# Shared service map used across test modules
MOCK_SERVICE_MAP = {
    "jellyfin": {
        "port": 8096,
        "name": "Jellyfin",
        "icon": "🎬",
        "description": "Media Server",
        "protocol": "http",
    },
    "navidrome": {
        "port": 4533,
        "name": "Navidrome",
        "icon": "🎵",
        "description": "Music Server",
        "protocol": "http",
    },
}

# Sample container list used by route tests
MOCK_CONTAINERS = [
    {
        "vmid": 100,
        "name": "jellyfin",
        "status": "running",
        "node": "pve",
        "ip": "192.168.1.100",
        "uptime": 3600,
        "memory_usage": 512 * 1024 * 1024,
        "memory_max": 2048 * 1024 * 1024,
        "service": MOCK_SERVICE_MAP["jellyfin"],
    },
    {
        "vmid": 101,
        "name": "navidrome",
        "status": "running",
        "node": "pve",
        "ip": "DHCP/Unknown",
        "uptime": 1800,
        "memory_usage": 256 * 1024 * 1024,
        "memory_max": 1024 * 1024 * 1024,
        "service": None,
    },
    {
        "vmid": 102,
        "name": "stopped-ct",
        "status": "stopped",
        "node": "pve",
        "ip": "192.168.1.102",
        "uptime": 0,
        "memory_usage": 0,
        "memory_max": 512 * 1024 * 1024,
        "service": None,
    },
]


@pytest.fixture()
def flask_client():
    import app as app_module

    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as client:
        yield client
