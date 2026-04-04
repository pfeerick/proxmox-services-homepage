/**
 * initDashboard — shared fetch/refresh/loading-state factory.
 *
 * @param {object} opts
 * @param {string}   opts.apiUrl  - API endpoint to poll
 * @param {object}   opts.els     - DOM elements: loading, error, content, refreshIndicator
 * @param {function} opts.hasChanged  - (data) => boolean
 * @param {function} opts.render      - (data) => void, called when hasChanged is true
 * @param {function} [opts.onSuccess] - (data) => void, called on every successful fetch
 * @returns {{ load: function }}
 */
export function initDashboard({ apiUrl, els, hasChanged, render, onSuccess }) {
  const { autoRefreshSeconds } = window.DASHBOARD_CONFIG;
  const { loading, error, content, refreshIndicator } = els;
  let autoRefreshInterval;
  let isFirstLoad = true;

  async function load(showIndicator = false) {
    if (isFirstLoad) {
      loading.style.display = "block";
      error.style.display = "none";
      content.style.display = "none";
    } else if (showIndicator) {
      refreshIndicator.classList.add("active");
    }

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (isFirstLoad) {
        loading.style.display = "none";
        content.style.display = "block";
        isFirstLoad = false;
      }

      refreshIndicator.classList.remove("active");
      onSuccess?.(data);

      if (hasChanged(data)) {
        render(data);
      }

      if (autoRefreshSeconds > 0 && !autoRefreshInterval) {
        autoRefreshInterval = setInterval(() => load(true), autoRefreshSeconds * 1000);
      }
    } catch (err) {
      console.error(`Error fetching ${apiUrl}:`, err);
      refreshIndicator.classList.remove("active");

      if (isFirstLoad) {
        loading.style.display = "none";
        error.style.display = "block";
        content.style.display = "none";
      } else {
        console.warn("Background refresh failed, keeping current data visible");
      }
    }
  }

  window.addEventListener("beforeunload", () => {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  });

  return { load };
}
