/**
 * initView — manages loading/error/content state for a single dashboard panel.
 * Data is pushed in from the SSE stream rather than fetched internally.
 *
 * @param {object} opts
 * @param {object}   opts.els        - DOM elements: loading, error, content
 * @param {function} opts.hasChanged - (data) => boolean
 * @param {function} opts.render     - (data) => void, called when hasChanged is true
 * @param {function} [opts.onData]   - (data) => void, called on every data event
 * @returns {{ onData: function, onError: function, reset: function }}
 */
export function initView({ els, hasChanged, render, onData: onDataCallback }) {
  const { loading, error, content } = els;
  let hasReceivedData = false;

  function showLoading() {
    loading.style.display = "block";
    error.style.display = "none";
    content.style.display = "none";
  }

  showLoading();

  return {
    onData(data) {
      if (!hasReceivedData) {
        loading.style.display = "none";
        content.style.display = "block";
        hasReceivedData = true;
      }
      error.style.display = "none";
      onDataCallback?.(data);
      if (hasChanged(data)) render(data);
    },

    onError() {
      // Only surface the error state if we've never successfully received data.
      // If we already have data on screen, keep showing it — the browser will
      // reconnect automatically and update it when the stream recovers.
      if (!hasReceivedData) {
        loading.style.display = "none";
        error.style.display = "block";
        content.style.display = "none";
      }
    },

    reset() {
      hasReceivedData = false;
      showLoading();
    },
  };
}
