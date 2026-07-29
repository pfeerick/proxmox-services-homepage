const STORAGE_KEY = "theme";
const ICONS = { auto: "🖥️", light: "☀️", dark: "🌙" };

function getOverride() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function setOverride(value) {
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage unavailable (e.g. private browsing) — override just won't persist
  }
}

function applyTheme() {
  const override = getOverride();
  if (override) document.documentElement.setAttribute("data-theme", override);
  else document.documentElement.removeAttribute("data-theme");

  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const mode = override ?? "auto";
  btn.textContent = ICONS[mode];
  btn.title = `Theme: ${mode} (click to change)`;
  btn.setAttribute("aria-label", btn.title);
}

function cycleTheme() {
  const override = getOverride();
  const next = override === null ? "light" : override === "light" ? "dark" : null;
  setOverride(next);
  applyTheme();
}

export function initThemeToggle() {
  applyTheme();
  document.getElementById("theme-toggle")?.addEventListener("click", cycleTheme);
}
