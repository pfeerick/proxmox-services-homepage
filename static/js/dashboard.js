/**
 * initDashboard — shared fetch/refresh/loading-state factory.
 *
 * @param {object} opts
 * @param {string}   opts.apiUrl  - API endpoint to poll
 * @param {object}   opts.els     - DOM elements: loading, error, content
 * @param {function} opts.hasChanged  - (data) => boolean
 * @param {function} opts.render      - (data) => void, called when hasChanged is true
 * @param {function} [opts.onSuccess] - (data) => void, called on every successful fetch
 * @returns {{ load: function }}
 */
export function initDashboard({ apiUrl, els, hasChanged, render, onSuccess }) {
  const { autoRefreshSeconds } = window.DASHBOARD_CONFIG;
  const { loading, error, content } = els;
  let autoRefreshInterval;
  let isFirstLoad = true;

  async function load() {
    if (isFirstLoad) {
      loading.style.display = "block";
      error.style.display = "none";
      content.style.display = "none";
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

      onSuccess?.(data);

      if (hasChanged(data)) {
        render(data);
      }

      if (autoRefreshSeconds > 0 && !autoRefreshInterval) {
        autoRefreshInterval = setInterval(load, autoRefreshSeconds * 1000);
      }
    } catch (err) {
      console.error(`Error fetching ${apiUrl}:`, err);

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
