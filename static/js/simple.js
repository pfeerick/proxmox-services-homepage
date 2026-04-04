const { autoRefreshSeconds, initialLoad } = window.DASHBOARD_CONFIG;

let autoRefreshInterval;
let isFirstLoad = true;
let currentServices = [];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadServices(showIndicator = false) {
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const contentState = document.getElementById("content-state");
  const refreshIndicator = document.getElementById("refresh-indicator");
  const servicesGrid = document.getElementById("services-grid");

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
    const response = await fetch("/api/services");
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

    // Only update display if data has changed
    if (hasServicesChanged(data.services)) {
      currentServices = data.services;
      displayServices(data.services);
    }

    // Start auto-refresh if not already running
    if (autoRefreshSeconds > 0 && !autoRefreshInterval) {
      autoRefreshInterval = setInterval(() => loadServices(true), autoRefreshSeconds * 1000);
    }
  } catch (error) {
    console.error("Error loading services:", error);

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

function hasServicesChanged(newServices) {
  // If lengths differ, definitely changed
  if (newServices.length !== currentServices.length) {
    return true;
  }

  // Compare service URLs (simplified comparison)
  const currentUrls = currentServices
    .map((s) => s.url)
    .sort()
    .join(",");
  const newUrls = newServices
    .map((s) => s.url)
    .sort()
    .join(",");

  return currentUrls !== newUrls;
}

function displayServices(services) {
  const servicesGrid = document.getElementById("services-grid");
  const serviceCount = document.getElementById("service-count");
  const emptyState = document.getElementById("empty-state");

  if (services.length === 0) {
    servicesGrid.innerHTML = "";
    serviceCount.style.display = "none";
    emptyState.style.display = "block";
    return;
  }

  // Update service count
  const countText = `${services.length} service${services.length !== 1 ? "s" : ""} running`;
  serviceCount.textContent = countText;
  serviceCount.style.display = "block";
  emptyState.style.display = "none";

  // Create service cards
  servicesGrid.innerHTML = services
    .map(
      (service) => `
        <a href="${escapeHtml(service.url)}" class="service-card" target="_blank"
           title="${escapeHtml(service.container_name)} - ${escapeHtml(service.description)}">
            <span class="service-icon">${escapeHtml(service.icon)}</span>
            <div class="service-name">${escapeHtml(service.name)}</div>
            <div class="service-description">${escapeHtml(service.description)}</div>
        </a>
    `,
    )
    .join("");
}

// Load services immediately on page load
if (initialLoad) {
  loadServices(false);
}

// Clean up interval when page unloads
window.addEventListener("beforeunload", () => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
});
