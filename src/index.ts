import { startRefreshLoop } from "./cache.ts";
import { config, readMinBunVersion, startFileWatcher } from "./config.ts";
import { handleRequest } from "./router.ts";
import { satisfiesMinVersion } from "./utils.ts";

const minBunVersion = readMinBunVersion();
if (minBunVersion && !satisfiesMinVersion(Bun.version, minBunVersion)) {
  console.error(
    `❌ Bun ${minBunVersion}+ required (running ${Bun.version}). Update Bun and try again.`,
  );
  process.exit(1);
}

startFileWatcher();
startRefreshLoop();

const server = Bun.serve({
  hostname: config.server.host,
  port: config.server.port,

  fetch(req, server) {
    return handleRequest(req, { clearTimeout: () => server.timeout(req, 0) });
  },
});

console.log(`🚀 Proxmox Dashboard running at http://${server.hostname}:${server.port}`);
