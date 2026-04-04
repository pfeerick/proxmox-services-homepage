import pytest

from app import ProxmoxAPI


@pytest.fixture()
def api():
    return ProxmoxAPI("pve:8006", "user@pam!token", "secret")


class TestExtractIpFromConfig:
    def test_static_ip_stripped_of_subnet(self, api):
        config = {"net0": "name=eth0,bridge=vmbr0,ip=192.168.1.100/24"}
        assert api._extract_ip_from_config(config) == "192.168.1.100"

    def test_ip_without_subnet_returned_as_is(self, api):
        config = {"net0": "name=eth0,bridge=vmbr0,ip=192.168.1.100"}
        assert api._extract_ip_from_config(config) == "192.168.1.100"

    def test_dhcp_returns_none(self, api):
        config = {"net0": "name=eth0,bridge=vmbr0,ip=dhcp"}
        assert api._extract_ip_from_config(config) is None

    def test_dhcp_uppercase_returns_none(self, api):
        config = {"net0": "name=eth0,bridge=vmbr0,ip=DHCP"}
        assert api._extract_ip_from_config(config) is None

    def test_no_ip_key_returns_none(self, api):
        config = {"net0": "name=eth0,bridge=vmbr0"}
        assert api._extract_ip_from_config(config) is None

    def test_no_network_keys_returns_none(self, api):
        config = {"hostname": "myhost", "memory": 512}
        assert api._extract_ip_from_config(config) is None

    def test_first_interface_wins(self, api):
        config = {
            "net0": "name=eth0,bridge=vmbr0,ip=192.168.1.100/24",
            "net1": "name=eth1,bridge=vmbr1,ip=10.0.0.5/24",
        }
        assert api._extract_ip_from_config(config) == "192.168.1.100"

    def test_skips_non_net_keys(self, api):
        config = {
            "hostname": "myhost",
            "network": "should-not-match",
            "net0": "name=eth0,bridge=vmbr0,ip=10.0.0.1/24",
        }
        assert api._extract_ip_from_config(config) == "10.0.0.1"
