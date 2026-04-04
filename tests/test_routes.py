from unittest.mock import patch

from tests.conftest import MOCK_CONTAINERS


class TestHealthEndpoint:
    def test_healthy_returns_200(self, flask_client):
        with patch("app.proxmox") as mock_proxmox:
            mock_proxmox.check_connection.return_value = (True, None)
            response = flask_client.get("/health")

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "healthy"
        assert "error" not in data
        assert "timestamp" in data

    def test_unhealthy_returns_503(self, flask_client):
        with patch("app.proxmox") as mock_proxmox:
            mock_proxmox.check_connection.return_value = (False, "Connection refused")
            response = flask_client.get("/health")

        assert response.status_code == 503
        data = response.get_json()
        assert data["status"] == "unhealthy"
        assert data["error"] == "Connection refused"


class TestContainersEndpoint:
    def test_returns_cached_containers(self, flask_client):
        cache = {"containers": MOCK_CONTAINERS, "last_updated": "2024-01-01T00:00:00"}
        with patch("app._container_cache", cache):
            response = flask_client.get("/api/containers")

        assert response.status_code == 200
        data = response.get_json()
        assert data["total"] == len(MOCK_CONTAINERS)
        assert len(data["containers"]) == len(MOCK_CONTAINERS)
        assert data["last_updated"] == "2024-01-01T00:00:00"

    def test_empty_cache_returns_empty_list(self, flask_client):
        cache = {"containers": [], "last_updated": None}
        with patch("app._container_cache", cache):
            response = flask_client.get("/api/containers")

        assert response.status_code == 200
        data = response.get_json()
        assert data["total"] == 0
        assert data["containers"] == []


class TestServicesEndpoint:
    def test_filters_to_running_with_known_ip_and_service(self, flask_client):
        cache = {"containers": MOCK_CONTAINERS, "last_updated": "2024-01-01T00:00:00"}
        with patch("app._container_cache", cache):
            response = flask_client.get("/api/services")

        assert response.status_code == 200
        data = response.get_json()
        # Only jellyfin qualifies: running + known IP + has service with port
        assert data["total"] == 1
        assert data["services"][0]["name"] == "Jellyfin"
        assert data["services"][0]["url"] == "http://192.168.1.100:8096"

    def test_services_sorted_alphabetically(self, flask_client):
        containers = [
            {
                **MOCK_CONTAINERS[0],
                "name": "zebra",
                "ip": "192.168.1.1",
                "service": {
                    "port": 80,
                    "name": "Zebra",
                    "icon": "🦓",
                    "description": "Z",
                    "protocol": "http",
                },
            },
            {
                **MOCK_CONTAINERS[0],
                "name": "alpha",
                "ip": "192.168.1.2",
                "service": {
                    "port": 80,
                    "name": "Alpha",
                    "icon": "🅰️",
                    "description": "A",
                    "protocol": "http",
                },
            },
        ]
        cache = {"containers": containers, "last_updated": "2024-01-01T00:00:00"}
        with patch("app._container_cache", cache):
            response = flask_client.get("/api/services")

        data = response.get_json()
        names = [s["name"] for s in data["services"]]
        assert names == sorted(names, key=str.lower)

    def test_https_protocol_in_url(self, flask_client):
        containers = [
            {
                **MOCK_CONTAINERS[0],
                "service": {**MOCK_CONTAINERS[0]["service"], "protocol": "https"},
            },
        ]
        cache = {"containers": containers, "last_updated": "2024-01-01T00:00:00"}
        with patch("app._container_cache", cache):
            response = flask_client.get("/api/services")

        data = response.get_json()
        assert data["services"][0]["url"].startswith("https://")


class TestPageRoutes:
    def test_homepage_returns_200(self, flask_client):
        response = flask_client.get("/")
        assert response.status_code == 200

    def test_detailed_returns_200(self, flask_client):
        response = flask_client.get("/detailed")
        assert response.status_code == 200
