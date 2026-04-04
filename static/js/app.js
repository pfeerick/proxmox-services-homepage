import { initView } from "./dashboard.js";
import { hasServicesChanged, renderServices } from "./services.js";
import { hasContainersChanged, renderContainers } from "./containers.js";

// --- View state managers ---
const servicesView = initView({
  els: {
    loading: document.getElementById("services-loading"),
    error: document.getElementById("services-error"),
    content: document.getElementById("services-content"),
  },
  hasChanged: hasServicesChanged,
  render: renderServices,
});

const containersView = initView({
  els: {
    loading: document.getElementById("containers-loading"),
    error: document.getElementById("containers-error"),
    content: document.getElementById("containers-content"),
  },
  hasChanged: hasContainersChanged,
  render: renderContainers,
  onData(data) {
    document.getElementById("last-updated").textContent = `Last updated: ${new Date(
      data.last_updated,
    ).toLocaleString()}`;
  },
});

// --- SSE stream ---
let es;

function connectStream() {
  es = new EventSource("/api/stream");
  es.addEventListener("services", (e) => servicesView.onData(JSON.parse(e.data)));
  es.addEventListener("containers", (e) => containersView.onData(JSON.parse(e.data)));
  es.onerror = () => {
    servicesView.onError();
    containersView.onError();
  };
}

function reconnect() {
  es?.close();
  servicesView.reset();
  containersView.reset();
  connectStream();
}

// --- Retry buttons ---
document.getElementById("services-retry").addEventListener("click", reconnect);
document.getElementById("containers-retry").addEventListener("click", reconnect);

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
window.addEventListener("beforeunload", () => es?.close());

// --- Initialise ---
switchView(getActiveView());
connectStream();
