import { escapeHtml } from "./utils.js";

let currentServices = [];

export function hasServicesChanged(data) {
  const newServices = data.services;
  if (newServices.length !== currentServices.length) return true;
  // Every field that renderServices puts on the page must appear here, or a change
  // to it won't repaint — container_name feeds each card's title tooltip.
  const fingerprint = (services) =>
    services
      .map((s) => `${s.url}|${s.name}|${s.icon}|${s.description}|${s.container_name}`)
      .sort()
      .join(",");
  return fingerprint(currentServices) !== fingerprint(newServices);
}

export function renderServices(data) {
  const services = data.services;
  const servicesGrid = document.getElementById("services-grid");
  const serviceCount = document.getElementById("service-count");
  const emptyState = document.getElementById("services-empty");

  currentServices = services;

  if (services.length === 0) {
    servicesGrid.innerHTML = "";
    serviceCount.style.display = "none";
    emptyState.style.display = "block";
    return;
  }

  const countText = `${services.length} service${services.length !== 1 ? "s" : ""} running`;
  serviceCount.textContent = countText;
  serviceCount.style.display = "block";
  emptyState.style.display = "none";

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
