from app import get_service_info
from tests.conftest import MOCK_SERVICE_MAP


class TestGetServiceInfo:
    def test_direct_match(self):
        result = get_service_info("jellyfin", MOCK_SERVICE_MAP)
        assert result["name"] == "Jellyfin"
        assert result["port"] == 8096

    def test_prefix_match(self):
        result = get_service_info("jellyfin-001", MOCK_SERVICE_MAP)
        assert result["name"] == "Jellyfin"

    def test_prefix_match_with_suffix(self):
        result = get_service_info("navidrome-music", MOCK_SERVICE_MAP)
        assert result["name"] == "Navidrome"

    def test_no_match_returns_none(self):
        assert get_service_info("unknown-service", MOCK_SERVICE_MAP) is None

    def test_empty_service_map_returns_none(self):
        assert get_service_info("jellyfin", {}) is None
