const backgroundCanvas = document.getElementById("semantic-background");
const homeView = document.getElementById("home-view");
const resultsView = document.getElementById("results-view");
const homeForm = document.getElementById("home-form");
const resultsForm = document.getElementById("results-form");
const homeSearchInput = document.getElementById("home-search-input");
const resultsSearchInput = document.getElementById("results-search-input");
const homeAutocomplete = document.getElementById("home-autocomplete");
const resultsAutocomplete = document.getElementById("results-autocomplete");
const homeStats = document.getElementById("home-stats");
const loadingState = document.getElementById("loading-state");
const emptyState = document.getElementById("empty-state");
const errorState = document.getElementById("error-state");
const resultsList = document.getElementById("results-list");
const resultsSummary = document.getElementById("results-summary");
const brandHomeButton = document.getElementById("brand-home-button");

const configuredApiBaseUrl = window.SEARCHIQ_API_BASE_URL || "";
const API_BASE_URL = configuredApiBaseUrl || `${window.location.origin}/api`;
const AUTOCOMPLETE_DEBOUNCE_MS = 300;

let activeAutocompleteIndex = -1;
let currentSuggestions = [];
let lastAutocompleteRequestId = 0;
let latestStats = null;

function startSemanticBackground() {
  if (!backgroundCanvas) {
    return;
  }

  const context = backgroundCanvas.getContext("2d");
  const pointer = { x: 0, y: 0, active: false };
  const colors = ["#15b8a6", "#f4b942", "#ff6b4a", "#2b6dff"];
  let width = 0;
  let height = 0;
  let nodes = [];

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    backgroundCanvas.width = Math.floor(width * ratio);
    backgroundCanvas.height = Math.floor(height * ratio);
    backgroundCanvas.style.width = `${width}px`;
    backgroundCanvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const nodeCount = Math.max(32, Math.min(84, Math.floor(width / 18)));
    nodes = Array.from({ length: nodeCount }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      radius: 1.5 + Math.random() * 2.2,
      color: colors[index % colors.length],
    }));
  }

  function draw() {
    context.clearRect(0, 0, width, height);

    const wash = context.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, "rgba(10, 20, 31, 0.05)");
    wash.addColorStop(0.42, "rgba(21, 184, 166, 0.09)");
    wash.addColorStop(1, "rgba(255, 107, 74, 0.10)");
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);

    for (const node of nodes) {
      node.x += node.vx;
      node.y += node.vy;

      if (node.x < -20 || node.x > width + 20) {
        node.vx *= -1;
      }
      if (node.y < -20 || node.y > height + 20) {
        node.vy *= -1;
      }

      if (pointer.active) {
        const dx = node.x - pointer.x;
        const dy = node.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 160) {
          const force = (160 - distance) / 160;
          node.x += dx * force * 0.018;
          node.y += dy * force * 0.018;
        }
      }
    }

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const left = nodes[i];
        const right = nodes[j];
        const distance = Math.hypot(left.x - right.x, left.y - right.y);
        if (distance < 150) {
          context.beginPath();
          context.moveTo(left.x, left.y);
          context.lineTo(right.x, right.y);
          context.strokeStyle = `rgba(16, 24, 32, ${0.11 * (1 - distance / 150)})`;
          context.lineWidth = 1;
          context.stroke();
        }
      }
    }

    for (const node of nodes) {
      context.beginPath();
      context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      context.fillStyle = node.color;
      context.globalAlpha = 0.62;
      context.fill();
      context.globalAlpha = 1;
    }

    window.requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  });
  window.addEventListener("pointerleave", () => {
    pointer.active = false;
  });

  resize();
  draw();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setView(view) {
  const showHome = view === "home";
  homeView.classList.toggle("hidden", !showHome);
  resultsView.classList.toggle("hidden", showHome);
}

function setLoading(isLoading) {
  loadingState.classList.toggle("hidden", !isLoading);
  if (isLoading) {
    emptyState.classList.add("hidden");
    errorState.classList.add("hidden");
  }
}

function setError(message = "") {
  errorState.textContent = message;
  errorState.classList.toggle("hidden", !message);
  if (message) {
    loadingState.classList.add("hidden");
    emptyState.classList.add("hidden");
  }
}

function setEmpty(isEmpty) {
  emptyState.classList.toggle("hidden", !isEmpty);
  if (isEmpty) {
    loadingState.classList.add("hidden");
    errorState.classList.add("hidden");
  }
}

function hideAutocomplete(container) {
  container.classList.add("hidden");
  container.innerHTML = "";
  currentSuggestions = [];
  activeAutocompleteIndex = -1;
}

function renderAutocomplete(container, suggestions, onSelect) {
  currentSuggestions = suggestions;
  activeAutocompleteIndex = -1;

  if (!suggestions.length) {
    hideAutocomplete(container);
    return;
  }

  container.innerHTML = suggestions
    .map(
      (item, index) => `
        <button class="autocomplete-item" type="button" data-index="${index}">
          ${escapeHtml(item)}
        </button>
      `
    )
    .join("");

  container.classList.remove("hidden");

  Array.from(container.querySelectorAll(".autocomplete-item")).forEach((button) => {
    button.addEventListener("click", () => {
      onSelect(button.textContent.trim());
      hideAutocomplete(container);
    });
  });
}

function updateAutocompleteHighlight(container) {
  const items = Array.from(container.querySelectorAll(".autocomplete-item"));
  items.forEach((item, index) => {
    item.classList.toggle("active", index === activeAutocompleteIndex);
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function debounce(callback, delay) {
  let timerId = null;

  return (...args) => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => {
      callback(...args);
    }, delay);
  };
}

function formatScore(score) {
  const numericScore = Number(score);
  if (Number.isNaN(numericScore)) {
    return "0.0000";
  }
  return numericScore.toFixed(4);
}

function formatInteger(value) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return "--";
  }
  return numericValue.toLocaleString();
}

function formatDuration(durationMs) {
  if (durationMs == null || Number.isNaN(Number(durationMs))) {
    return "Not run yet";
  }

  const duration = Number(durationMs);
  if (duration < 1000) {
    return `${duration.toFixed(0)} ms`;
  }

  return `${(duration / 1000).toFixed(2)} s`;
}

function formatSemanticSummary(query, results, durationMs, semantic) {
  const baseSummary = `${results.length} result${results.length === 1 ? "" : "s"} for "${query}" in ${formatDuration(durationMs)}`;
  const expandedTerms = Array.isArray(semantic?.expandedTerms) ? semantic.expandedTerms : [];

  if (!semantic?.enabled || expandedTerms.length === 0) {
    return baseSummary;
  }

  const terms = expandedTerms.map((item) => item.term || item).filter(Boolean).slice(0, 5);
  return `${baseSummary} | expanded with ${terms.join(", ")}`;
}

async function fetchStats() {
  try {
    const stats = await fetchJson(`${API_BASE_URL}/stats`);
    latestStats = stats;
    const vectors = stats.semanticModel?.enabled ? ` | ${formatInteger(stats.semanticModel.vocabularySize)} embedding terms` : "";
    homeStats.textContent = `${formatInteger(stats.totalDocuments)} docs indexed${vectors}`;
    homeStats.classList.remove("hidden");
  } catch (_error) {
    homeStats.classList.add("hidden");
  }
}

async function fetchAutocomplete(prefix, targetInput, targetContainer) {
  if (!prefix.trim()) {
    hideAutocomplete(targetContainer);
    return;
  }

  const requestId = ++lastAutocompleteRequestId;

  try {
    const data = await fetchJson(`${API_BASE_URL}/autocomplete?prefix=${encodeURIComponent(prefix)}`);
    if (requestId !== lastAutocompleteRequestId || targetInput.value.trim() !== prefix.trim()) {
      return;
    }

    renderAutocomplete(targetContainer, data.suggestions || [], (value) => {
      targetInput.value = value;
      submitSearch(value);
    });
  } catch (_error) {
    hideAutocomplete(targetContainer);
  }
}

const scheduleAutocomplete = debounce((input, container) => {
  fetchAutocomplete(input.value, input, container);
}, AUTOCOMPLETE_DEBOUNCE_MS);

function renderResults(results) {
  resultsList.innerHTML = results
    .map(
      (result) => `
        <article class="result-card">
          <div class="result-meta-row">
            <div class="result-url">Document ${escapeHtml(String(result.docId))}</div>
            <div class="result-score-badge">Score ${formatScore(result.score)}</div>
          </div>
          <h2 class="result-title">Indexed document #${escapeHtml(String(result.docId))}</h2>
          <p class="result-score">Ranked through semantic query expansion and native TF-IDF scoring.</p>
          <p class="result-preview">${escapeHtml(result.preview || "")}</p>
        </article>
      `
    )
    .join("");
}

async function performSearch(query) {
  setView("results");
  resultsSearchInput.value = query;
  resultsSummary.textContent = `Searching for "${query}"`;
  resultsList.innerHTML = "";
  setError("");
  setEmpty(false);
  setLoading(true);
  const startedAt = performance.now();

  try {
    const data = await fetchJson(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}`);
    const results = Array.isArray(data.results) ? data.results : [];
    const durationMs = performance.now() - startedAt;
    resultsSummary.textContent = formatSemanticSummary(query, results, durationMs, data.semantic);
    renderResults(results);
    setLoading(false);
    setEmpty(results.length === 0);
  } catch (error) {
    resultsList.innerHTML = "";
    setLoading(false);
    setError(error.message || "Something went wrong while searching");
  }
}

function submitSearch(rawQuery) {
  const query = rawQuery.trim();
  if (!query) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("q", query);
  window.history.pushState({}, "", url);
  hideAutocomplete(homeAutocomplete);
  hideAutocomplete(resultsAutocomplete);
  performSearch(query);
}

function resetToHome() {
  const url = new URL(window.location.href);
  url.searchParams.delete("q");
  window.history.pushState({}, "", url.pathname);
  setView("home");
  resultsList.innerHTML = "";
  setError("");
  setEmpty(false);
  setLoading(false);
  homeSearchInput.focus();
}

function wireAutocompleteInput(input, container) {
  input.addEventListener("input", () => {
    scheduleAutocomplete(input, container);
  });

  input.addEventListener("keydown", (event) => {
    const items = container.querySelectorAll(".autocomplete-item");

    if (container.classList.contains("hidden") || !items.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeAutocompleteIndex = (activeAutocompleteIndex + 1) % items.length;
      updateAutocompleteHighlight(container);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeAutocompleteIndex = (activeAutocompleteIndex - 1 + items.length) % items.length;
      updateAutocompleteHighlight(container);
    } else if (event.key === "Enter" && activeAutocompleteIndex >= 0) {
      event.preventDefault();
      const chosenValue = items[activeAutocompleteIndex].textContent.trim();
      input.value = chosenValue;
      hideAutocomplete(container);
      submitSearch(chosenValue);
    } else if (event.key === "Escape") {
      hideAutocomplete(container);
    }
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => hideAutocomplete(container), 120);
  });
}

homeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitSearch(homeSearchInput.value);
});

resultsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitSearch(resultsSearchInput.value);
});

brandHomeButton.addEventListener("click", () => {
  resetToHome();
});

window.addEventListener("popstate", () => {
  const query = new URLSearchParams(window.location.search).get("q") || "";
  if (query.trim()) {
    performSearch(query.trim());
  } else {
    resetToHome();
  }
});

wireAutocompleteInput(homeSearchInput, homeAutocomplete);
wireAutocompleteInput(resultsSearchInput, resultsAutocomplete);
startSemanticBackground();
fetchStats();

const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
if (initialQuery.trim()) {
  performSearch(initialQuery.trim());
} else {
  setView("home");
  homeSearchInput.focus();
}
