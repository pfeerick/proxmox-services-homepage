import { escapeHtml } from "./utils.js";

let currentContainersData = null;

export function hasContainersChanged(data) {
  if (!currentContainersData) return true;
  if (data.containers.length !== currentContainersData.containers.length) return true;
  const currentSummary = currentContainersData.containers
    .map((c) => `${c.vmid}-${c.status}-${c.ip}-${c.name}`)
    .sort()
    .join("|");
  const newSummary = data.containers
    .map((c) => `${c.vmid}-${c.status}-${c.ip}-${c.name}`)
    .sort()
    .join("|");
  return currentSummary !== newSummary;
}

export function renderContainers(data) {
  const containers = data.containers;
  currentContainersData = data;

  const running = containers.filter((c) => c.status === "running").length;
  const stopped = containers.filter((c) => c.status === "stopped").length;
  document.getElementById("stat-total").textContent = containers.length;
  document.getElementById("stat-running").textContent = running;
  document.getElementById("stat-stopped").textContent = stopped;

  document.getElementById("containers-grid").innerHTML = containers
    .map((container) => {
      const quickLinksHtml = createQuickLinks(container);
      const serviceInfo = container.service
        ? `<span class="detail-label">Service:</span>
           <span>${escapeHtml(container.service.icon)} ${escapeHtml(container.service.name)}</span>`
        : "";
      const uptime = formatUptime(container.uptime);
      const memory = formatMemory(container.memory_usage, container.memory_max);
      const uptimeHtml = uptime
        ? `<span class="detail-label">Uptime:</span><span>${escapeHtml(uptime)}</span>`
        : "";
      const memoryHtml = memory
        ? `<span class="detail-label">Memory:</span><span>${escapeHtml(memory)}</span>`
        : "";

      return `
        <div class="container-card ${escapeHtml(container.status)}">
            <div class="container-name">${escapeHtml(container.name)}</div>
            <div class="container-details">
                <span class="detail-label">Status:</span>
                <span class="status ${escapeHtml(container.status)}">${escapeHtml(
                  container.status,
                )}</span>
                ${serviceInfo}
                <span class="detail-label">VMID:</span>
                <span>${container.vmid}</span>
                <span class="detail-label">Node:</span>
                <span>${escapeHtml(container.node)}</span>
                <span class="detail-label">IP Address:</span>
                <span class="ip-address">${escapeHtml(container.ip)}</span>
                ${uptimeHtml}
                ${memoryHtml}
            </div>
            ${quickLinksHtml}
        </div>
      `;
    })
    .join("");
}

function formatUptime(seconds) {
  if (!seconds) return null;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatMemory(used, max) {
  if (!max) return null;
  const usedMB = Math.round(used / 1048576);
  const maxMB = Math.round(max / 1048576);
  if (maxMB >= 1024) {
    return `${(usedMB / 1024).toFixed(1)} / ${(maxMB / 1024).toFixed(1)} GB`;
  }
  return `${usedMB} / ${maxMB} MB`;
}

function createQuickLinks(container) {
  if (container.status !== "running") return "";

  if (container.ip === "DHCP/Unknown") {
    return `<div class="quick-links">
        <span class="no-ip-warning">⚠️ IP address not detected - container may be using DHCP</span>
    </div>`;
  }

  let links = "";

  if (container.service?.port) {
    const protocol = container.service.protocol === "https" ? "https" : "http";
    links += `<a href="${protocol}://${escapeHtml(container.ip)}:${parseInt(
      container.service.port,
      10,
    )}"
         class="quick-link primary" target="_blank">
        ${escapeHtml(container.service.icon)} Open ${escapeHtml(container.service.name)}
    </a>`;
  } else {
    links += `<a href="http://${escapeHtml(
      container.ip,
    )}:80" class="quick-link" target="_blank">HTTP</a>
    <a href="http://${escapeHtml(container.ip)}:8080" class="quick-link" target="_blank">8080</a>`;
  }

  links += `<a href="ssh://${escapeHtml(
    container.ip,
  )}:22" class="quick-link ssh" target="_blank">SSH</a>`;
  return `<div class="quick-links">${links}</div>`;
}
