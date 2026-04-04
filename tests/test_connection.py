from unittest.mock import MagicMock, patch

import pytest
import requests

from app import ProxmoxAPI


@pytest.fixture()
def api():
    return ProxmoxAPI("pve:8006", "user@pam!token", "secret")


class TestCheckConnection:
    def test_returns_true_on_success(self, api):
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        with patch("requests.get", return_value=mock_response):
            ok, error = api.check_connection()

        assert ok is True
        assert error is None

    def test_returns_false_on_connection_error(self, api):
        with patch("requests.get", side_effect=requests.exceptions.ConnectionError("refused")):
            ok, error = api.check_connection()

        assert ok is False
        assert "refused" in error

    def test_returns_false_on_timeout(self, api):
        with patch("requests.get", side_effect=requests.exceptions.Timeout("timed out")):
            ok, error = api.check_connection()

        assert ok is False
        assert "timed out" in error

    def test_returns_false_on_http_error(self, api):
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError(
            "401 Unauthorized"
        )
        with patch("requests.get", return_value=mock_response):
            ok, error = api.check_connection()

        assert ok is False
        assert "401" in error

    def test_probes_correct_url(self, api):
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        with patch("requests.get", return_value=mock_response) as mock_get:
            api.check_connection()

        mock_get.assert_called_once_with(
            "https://pve:8006/api2/json/nodes",
            headers={"Authorization": "PVEAPIToken=user@pam!token=secret"},
            verify=False,
            timeout=5,
        )

    def test_uses_ssl_verify_setting(self):
        api = ProxmoxAPI("pve:8006", "user@pam!token", "secret", ssl_verify=True)
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        with patch("requests.get", return_value=mock_response) as mock_get:
            api.check_connection()

        _, kwargs = mock_get.call_args
        assert kwargs["verify"] is True
