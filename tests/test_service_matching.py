from unittest.mock import patch

from tests.conftest import MOCK_SERVICE_MAP


class TestGetServiceInfo:
    def test_direct_match(self):
        with patch("app.SERVICE_MAP", MOCK_SERVICE_MAP):
            from app import get_service_info

            result = get_service_info("jellyfin")
            assert result["name"] == "Jellyfin"
            assert result["port"] == 8096

    def test_prefix_match(self):
        with patch("app.SERVICE_MAP", MOCK_SERVICE_MAP):
            from app import get_service_info

            result = get_service_info("jellyfin-001")
            assert result["name"] == "Jellyfin"

    def test_prefix_match_with_suffix(self):
        with patch("app.SERVICE_MAP", MOCK_SERVICE_MAP):
            from app import get_service_info

            result = get_service_info("navidrome-music")
            assert result["name"] == "Navidrome"

    def test_no_match_returns_none(self):
        with patch("app.SERVICE_MAP", MOCK_SERVICE_MAP):
            from app import get_service_info

            assert get_service_info("unknown-service") is None

    def test_empty_service_map_returns_none(self):
        with patch("app.SERVICE_MAP", {}):
            from app import get_service_info

            assert get_service_info("jellyfin") is None
