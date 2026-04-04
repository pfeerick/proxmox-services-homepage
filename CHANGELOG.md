## v0.2.2 (2026-04-04)

### Fix

- guard cache thread against None proxmox instance
- snapshot proxmox under config_lock in health endpoint
- use config title in detailed view page title

## v0.2.1 (2026-04-04)

### Refactor

- reorganize imports

## v0.2.0 (2026-04-04)

### Feat

- add server-side background cache for container data
- add ssl_verify config option; note config.yaml file permissions
- use gunicorn for https with tailscale
- background refresh
- loading spinner and AJAX refresh
- add config file hot reload watcher
- add simple dashboard

### Fix

- use configured title in simple.html h1 instead of hardcoded string
- health endpoint now returns 503 when Proxmox is unreachable
- anchor config paths and file watcher to APP_DIR, not working directory
- take a single consistent config snapshot per request in get_containers
- rename local config to lxc_config to avoid shadowing global
- remove duplicate get_service_info definition that shadowed the first
- move images into docs dir
- specify UTF-8 encoding when reading config and services files
- set flash port to 8000 (again!)
- made config reloads thread safe
- read config encoding correctly
- remove duplicated function
- correct port numbers for some services
- IP addresses and links work now

### Refactor

- make ProxmoxAPI a proper stateful class

## v0.1.0 (2025-09-24)
