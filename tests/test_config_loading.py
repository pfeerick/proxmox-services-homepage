import pytest
import yaml


class TestLoadConfig:
    def test_returns_defaults_when_file_missing(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.APP_DIR", str(tmp_path))
        from app import load_config

        result = load_config()
        assert result["proxmox"]["host"] == "your-proxmox-ip:8006"
        assert result["proxmox"]["ssl_verify"] is False
        assert result["flask"]["port"] == 8000
        assert result["dashboard"]["auto_refresh_seconds"] == 30

    def test_env_vars_used_in_fallback(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.APP_DIR", str(tmp_path))
        monkeypatch.setenv("PROXMOX_HOST", "192.168.1.1:8006")
        monkeypatch.setenv("PROXMOX_USER", "admin@pam!mytoken")
        monkeypatch.setenv("PROXMOX_TOKEN", "secret-token")
        from app import load_config

        result = load_config()
        assert result["proxmox"]["host"] == "192.168.1.1:8006"
        assert result["proxmox"]["user"] == "admin@pam!mytoken"
        assert result["proxmox"]["token"] == "secret-token"

    def test_loads_valid_yaml(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.APP_DIR", str(tmp_path))
        config_data = {
            "proxmox": {
                "host": "pve:8006",
                "user": "user@pam!tok",
                "token": "abc123",
                "ssl_verify": True,
            },
            "flask": {"host": "0.0.0.0", "port": 8080, "debug": False},
            "dashboard": {"auto_refresh_seconds": 60, "title": "My Dashboard"},
        }
        (tmp_path / "config.yaml").write_text(yaml.dump(config_data))
        from app import load_config

        result = load_config()
        assert result["proxmox"]["host"] == "pve:8006"
        assert result["proxmox"]["ssl_verify"] is True
        assert result["flask"]["port"] == 8080
        assert result["dashboard"]["title"] == "My Dashboard"

    def test_raises_on_invalid_yaml(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.APP_DIR", str(tmp_path))
        (tmp_path / "config.yaml").write_text("proxmox: {host: [invalid: yaml: }")
        from app import load_config

        with pytest.raises(yaml.YAMLError):
            load_config()


class TestLoadServices:
    def test_returns_defaults_when_file_missing(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.APP_DIR", str(tmp_path))
        from app import load_services

        result = load_services()
        assert "jellyfin" in result
        assert result["jellyfin"]["port"] == 8096

    def test_loads_valid_services_yaml(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.APP_DIR", str(tmp_path))
        services_data = {
            "services": {
                "myapp": {"port": 3000, "name": "My App", "icon": "🚀", "description": "An app"},
            }
        }
        (tmp_path / "services.yaml").write_text(yaml.dump(services_data))
        from app import load_services

        result = load_services()
        assert "myapp" in result
        assert result["myapp"]["port"] == 3000

    def test_missing_services_key_returns_empty_dict(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.APP_DIR", str(tmp_path))
        (tmp_path / "services.yaml").write_text(yaml.dump({"other_key": "value"}))
        from app import load_services

        assert load_services() == {}

    def test_raises_on_invalid_yaml(self, monkeypatch, tmp_path):
        monkeypatch.setattr("app.APP_DIR", str(tmp_path))
        (tmp_path / "services.yaml").write_text("services: {bad: [yaml: }")
        from app import load_services

        with pytest.raises(yaml.YAMLError):
            load_services()
