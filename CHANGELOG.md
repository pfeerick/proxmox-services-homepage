## v0.6.0 (2026-07-30)

### Feat

- **install**: default the LXC deployment to port 80

### Fix

- **frontend**: resolve lint findings in the static assets
- **version**: tolerate prerelease Bun version strings
- **server**: escape the dashboard title before injecting it into HTML
- **services**: prefer the longest matching service prefix
- **config**: merge config.toml over defaults and contain reload errors
- **cache**: stop a stale timer clobbering the refresh trigger
- **cache**: keep the last good snapshot when Proxmox is unreachable
- **install**: restart the service when updating an existing install
- **install**: don't abort under set -e when a non-default value is entered

### Refactor

- **sse**: share snapshot serialization between routes and cache

### Perf

- **health**: reuse a briefly cached connection probe
- **proxmox**: fetch nodes and containers in parallel

## v0.5.0 (2026-07-30)

### Refactor

- rewrite backend in Bun/TypeScript (#1)

## v0.4.0 (2026-04-05)

### Feat

- add install.sh for one-command LXC setup
- use waitress as production WSGI server
- replace polling with SSE push for real-time updates

### Fix

- broaden change-detection fingerprints and fix parseInt radix
- escape HTML in template innerHTML to prevent XSS

### Refactor

- remove refresh indicator
- extract CSS to static file and add Prettier CSS formatting
- convert to SPA with ES modules and hash-based routing
- eliminate duplicate service-matching logic

## v0.3.0 (2026-04-04)

### Feat

- show memory usage and uptime in detailed container view

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
