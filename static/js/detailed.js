const { autoRefreshSeconds, initialLoad } = window.DASHBOARD_CONFIG;

let autoRefreshInterval;
let isFirstLoad = true;
let currentContainersData = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadContainers(showIndicator = false) {
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const contentState = document.getElementById("content-state");
  const lastUpdated = document.getElementById("last-updated");
  const refreshIndicator = document.getElementById("refresh-indicator");

  // Only show full loading state on first load
  if (isFirstLoad) {
    loadingState.style.display = "block";
    errorState.style.display = "none";
    contentState.style.display = "none";
  } else if (showIndicator) {
    // Show subtle refresh indicator for background updates
    refreshIndicator.classList.add("active");
  }

  try {
    const response = await fetch("/api/containers");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Only hide loading state if it was the first load
    if (isFirstLoad) {
      loadingState.style.display = "none";
      contentState.style.display = "block";
      isFirstLoad = false;
    }

    // Hide refresh indicator
    refreshIndicator.classList.remove("active");

    // Update last updated time
    const updateTime = new Date(data.last_updated).toLocaleString();
    lastUpdated.textContent = `Last updated: ${updateTime}`;

    // Only update display if data has changed
    if (hasContainersChanged(data)) {
      currentContainersData = data;
      displayContainers(data.containers);
    }

    // Start auto-refresh if not already running
    if (autoRefreshSeconds > 0 && !autoRefreshInterval) {
      autoRefreshInterval = setInterval(() => loadContainers(true), autoRefreshSeconds * 1000);
    }
  } catch (error) {
    console.error("Error loading containers:", error);

    // Hide refresh indicator
    refreshIndicator.classList.remove("active");

    // Only show error state on first load, otherwise keep current data visible
    if (isFirstLoad) {
      loadingState.style.display = "none";
      errorState.style.display = "block";
      contentState.style.display = "none";
    } else {
      console.warn("Background refresh failed, keeping current data visible");
    }
  }
}

function hasContainersChanged(newData) {
  if (!currentContainersData) {
    return true;
  }

  // Compare container count
  if (newData.containers.length !== currentContainersData.containers.length) {
    return true;
  }

  // Create simplified comparison strings
  const currentSummary = currentContainersData.containers
    .map((c) => `${c.vmid}-${c.status}-${c.ip}`)
    .sort()
    .join("|");

  const newSummary = newData.containers
    .map((c) => `${c.vmid}-${c.status}-${c.ip}`)
    .sort()
    .join("|");

  return currentSummary !== newSummary;
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

function displayContainers(containers) {
  const containerGrid = document.getElementById("container-grid");
  const totalContainers = document.getElementById("total-containers");
  const runningContainers = document.getElementById("running-containers");
  const stoppedContainers = document.getElementById("stopped-containers");

  // Update stats
  const running = containers.filter((c) => c.status === "running").length;
  const stopped = containers.filter((c) => c.status === "stopped").length;

  totalContainers.textContent = containers.length;
  runningContainers.textContent = running;
  stoppedContainers.textContent = stopped;

  // Create container cards
  containerGrid.innerHTML = containers
    .map((container) => {
      const quickLinksHtml = createQuickLinks(container);
      const serviceInfo = container.service
        ? `<span class="detail-label">Service:</span><span>${escapeHtml(
            container.service.icon,
          )} ${escapeHtml(container.service.name)}</span>`
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

function createQuickLinks(container) {
  if (container.status !== "running") {
    return "";
  }

  if (container.ip === "DHCP/Unknown") {
    return `
            <div class="quick-links">
                <span class="no-ip-warning">⚠️ IP address not detected - container may be using DHCP</span>
            </div>
        `;
  }

  let links = "";

  if (container.service && container.service.port) {
    const protocol = container.service.protocol === "https" ? "https" : "http";
    links += `
            <a href="${protocol}://${escapeHtml(container.ip)}:${parseInt(container.service.port)}"
               class="quick-link primary" target="_blank">
                ${escapeHtml(container.service.icon)} Open ${escapeHtml(container.service.name)}
            </a>
        `;
  } else {
    // Fallback generic links for unknown services
    links += `
            <a href="http://${escapeHtml(
              container.ip,
            )}:80" class="quick-link" target="_blank">HTTP</a>
            <a href="http://${escapeHtml(
              container.ip,
            )}:8080" class="quick-link" target="_blank">8080</a>
        `;
  }

  // Always show SSH link for running containers
  links += `<a href="ssh://${escapeHtml(
    container.ip,
  )}:22" class="quick-link ssh" target="_blank">SSH</a>`;

  return `<div class="quick-links">${links}</div>`;
}

// Load containers immediately on page load
if (initialLoad) {
  loadContainers(false);
}

// Clean up interval when page unloads
window.addEventListener("beforeunload", () => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
});
