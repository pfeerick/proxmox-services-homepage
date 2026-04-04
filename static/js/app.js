import { initDashboard } from "./dashboard.js";
import { hasServicesChanged, renderServices } from "./services.js";
import { hasContainersChanged, renderContainers } from "./containers.js";

const refreshIndicator = document.getElementById("refresh-indicator");

// --- Services dashboard ---
const { load: loadServices } = initDashboard({
  apiUrl: "/api/services",
  els: {
    loading: document.getElementById("services-loading"),
    error: document.getElementById("services-error"),
    content: document.getElementById("services-content"),
    refreshIndicator,
  },
  hasChanged: hasServicesChanged,
  render: renderServices,
});

// --- Containers dashboard ---
const { load: loadContainers } = initDashboard({
  apiUrl: "/api/containers",
  els: {
    loading: document.getElementById("containers-loading"),
    error: document.getElementById("containers-error"),
    content: document.getElementById("containers-content"),
    refreshIndicator,
  },
  hasChanged: hasContainersChanged,
  render: renderContainers,
  onSuccess(data) {
    const updateTime = new Date(data.last_updated).toLocaleString();
    document.getElementById("last-updated").textContent = `Last updated: ${updateTime}`;
  },
});

// --- Retry buttons ---
document.getElementById("services-retry").addEventListener("click", () => loadServices(false));
document.getElementById("containers-retry").addEventListener("click", () => loadContainers(false));

// --- View switching ---
function getActiveView() {
  return window.location.hash === "#detailed" ? "detailed" : "services";
}

function switchView(viewName) {
  document.getElementById("view-services").style.display = viewName === "services" ? "" : "none";
  document.getElementById("view-detailed").style.display = viewName === "detailed" ? "" : "none";
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });
}

window.addEventListener("hashchange", () => switchView(getActiveView()));

// --- Initialise ---
switchView(getActiveView());
loadServices(false);
loadContainers(false);
