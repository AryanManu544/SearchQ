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
const homeDictionaryButton = document.getElementById("home-dictionary-button");
const homeDashboardButton = document.getElementById("home-dashboard-button");
const resultsDictionaryButton = document.getElementById("results-dictionary-button");
const resultsDashboardButton = document.getElementById("results-dashboard-button");
const statsModal = document.getElementById("stats-modal");
const statsModalClose = document.getElementById("stats-modal-close");
const statsModalError = document.getElementById("stats-modal-error");
const statsTotalDocuments = document.getElementById("stats-total-documents");
const statsTotalTerms = document.getElementById("stats-total-terms");
const statsTotalPostings = document.getElementById("stats-total-postings");
const statsSearchTime = document.getElementById("stats-search-time");
const statsModelTerms = document.getElementById("stats-model-terms");
const statsModelDimensions = document.getElementById("stats-model-dimensions");
const dictionaryModal = document.getElementById("dictionary-modal");
const dictionaryModalClose = document.getElementById("dictionary-modal-close");
const dictionaryLoading = document.getElementById("dictionary-loading");
const dictionaryError = document.getElementById("dictionary-error");
const dictionaryMeta = document.getElementById("dictionary-meta");
const dictionaryResults = document.getElementById("dictionary-results");
const dictionaryPagination = document.getElementById("dictionary-pagination");
const dictionaryPrevButton = document.getElementById("dictionary-prev");
const dictionaryNextButton = document.getElementById("dictionary-next");
const dictionaryPageInfo = document.getElementById("dictionary-page-info");
const dictionarySearchInput = document.getElementById("dictionary-search-input");

const API_BASE_URL = window.SEARCHIQ_API_BASE_URL || `${window.location.origin}/api`;
const AUTOCOMPLETE_DEBOUNCE_MS = 300;
const DICTIONARY_PAGE_LIMIT = 100;

let activeQuery = "";
let activeAutocompleteIndex = -1;
let currentSuggestions = [];
let lastAutocompleteRequestId = 0;
let latestStats = null;
let lastSearchDurationMs = null;
let dictionaryPage = 1;
let dictionaryTotalPages = 0;
let dictionaryTotalItems = 0;
let dictionarySearchTerm = "";

function escapeHtml(value) {
  return value
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
  const baseSummary = `${results.length} result${results.length === 1 ? "" : "s"} for “${query}” in ${formatDuration(durationMs)}`;
  const expandedTerms = Array.isArray(semantic?.expandedTerms) ? semantic.expandedTerms : [];

  if (!semantic?.enabled || expandedTerms.length === 0) {
    return baseSummary;
  }

  const terms = expandedTerms.map((item) => item.term || item).filter(Boolean).slice(0, 5);
  return `${baseSummary} • AI expanded with ${terms.join(", ")}`;
}

function renderStatsModal() {
  statsTotalDocuments.textContent = latestStats ? formatInteger(latestStats.totalDocuments) : "--";
  statsTotalTerms.textContent = latestStats ? formatInteger(latestStats.totalTerms) : "--";
  statsTotalPostings.textContent = latestStats ? formatInteger(latestStats.totalPostings) : "--";
  statsSearchTime.textContent = formatDuration(lastSearchDurationMs);
  statsModelTerms.textContent = latestStats?.semanticModel?.enabled
    ? formatInteger(latestStats.semanticModel.vocabularySize)
    : "--";
  statsModelDimensions.textContent = latestStats?.semanticModel?.enabled
    ? formatInteger(latestStats.semanticModel.dimensions)
    : "--";
}

function setDictionaryLoading(isLoading) {
  dictionaryLoading.classList.toggle("hidden", !isLoading);
  dictionaryLoading.classList.toggle("dictionary-loading-card", isLoading);
}

function setDictionaryError(message = "") {
  dictionaryError.textContent = message;
  dictionaryError.classList.toggle("hidden", !message);
}

function renderDictionaryTerms(items) {
  if (!items.length) {
    dictionaryResults.innerHTML = `
      <div class="dictionary-empty">
        <div>
          <p class="dictionary-empty-title">No matching indexed terms</p>
          <p class="dictionary-empty-copy">Try a shorter prefix, or clear the search field to browse the dictionary page by page.</p>
          <div class="dictionary-browse-hint">Prefix search works best with 2-5 letters</div>
        </div>
      </div>
    `;
    return;
  }

  dictionaryResults.innerHTML = items
    .map(
      (term) => `
        <article class="dictionary-row">
          <div class="dictionary-row-word">${escapeHtml(String(term))}</div>
        </article>
      `
    )
    .join("");
}

function renderDictionaryPagination() {
  dictionaryMeta.textContent = dictionarySearchTerm
    ? `${formatInteger(dictionaryTotalItems)} matches for “${dictionarySearchTerm}”`
    : `${formatInteger(dictionaryTotalItems)} indexed terms`;
  dictionaryMeta.classList.remove("hidden");
  dictionaryPageInfo.textContent = dictionaryTotalPages > 0
    ? `Page ${dictionaryPage} of ${dictionaryTotalPages}`
    : dictionarySearchTerm
      ? "Search mode"
      : "No pages available";
  dictionaryPrevButton.disabled = dictionaryPage <= 1;
  dictionaryNextButton.disabled = dictionaryPage >= dictionaryTotalPages;
  dictionaryPagination.classList.toggle("hidden", dictionarySearchTerm ? true : dictionaryTotalPages <= 0);
}

async function loadDictionaryPage(page) {
  dictionaryPage = page;
  setDictionaryLoading(true);
  setDictionaryError("");
  dictionaryResults.innerHTML = "";
  dictionaryPagination.classList.add("hidden");

  try {
    if (dictionarySearchTerm) {
      const suggestions = await fetchJson(
        `${API_BASE_URL}/autocomplete?prefix=${encodeURIComponent(dictionarySearchTerm)}`
      );
      const items = Array.isArray(suggestions.suggestions) ? suggestions.suggestions : [];
      dictionaryPage = 1;
      dictionaryTotalPages = items.length > 0 ? 1 : 0;
      dictionaryTotalItems = items.length;
      renderDictionaryTerms(items);
      renderDictionaryPagination();
    } else {
      const data = await fetchJson(`${API_BASE_URL}/dictionary?page=${page}&limit=${DICTIONARY_PAGE_LIMIT}`);
      dictionaryPage = Number(data.page) || 1;
      dictionaryTotalPages = Number(data.total_pages) || 0;
      dictionaryTotalItems = Number(data.total_items) || 0;
      renderDictionaryTerms(Array.isArray(data.items) ? data.items : []);
      renderDictionaryPagination();
    }
  } catch (error) {
    dictionaryTotalPages = 0;
    dictionaryTotalItems = 0;
    setDictionaryError(error.message || "Unable to load dictionary.");
    dictionaryResults.innerHTML = "";
  } finally {
    setDictionaryLoading(false);
  }
}

async function openDictionaryModal() {
  dictionaryModal.classList.remove("hidden");
  dictionarySearchInput.focus();
  await loadDictionaryPage(1);
}

function closeDictionaryModal() {
  dictionaryModal.classList.add("hidden");
}

async function fetchStats() {
  try {
    const stats = await fetchJson(`${API_BASE_URL}/stats`);
    latestStats = stats;
    homeStats.textContent = `${stats.totalDocuments} docs indexed • ${stats.totalTerms} terms`;
    homeStats.classList.remove("hidden");
    renderStatsModal();
  } catch (_error) {
    homeStats.classList.add("hidden");
  }
}

async function openStatsModal() {
  statsModal.classList.remove("hidden");
  statsModalError.classList.add("hidden");
  statsModalError.textContent = "";
  renderStatsModal();

  try {
    const stats = await fetchJson(`${API_BASE_URL}/stats`);
    latestStats = stats;
    renderStatsModal();
  } catch (error) {
    statsModalError.textContent = error.message || "Unable to load stats right now.";
    statsModalError.classList.remove("hidden");
  }
}

function closeStatsModal() {
  statsModal.classList.add("hidden");
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
          <p class="result-score">Ranked by semantic query expansion plus TF-IDF relevance.</p>
          <p class="result-preview">${escapeHtml(result.preview || "")}</p>
        </article>
      `
    )
    .join("");
}

async function performSearch(query) {
  activeQuery = query;
  setView("results");
  resultsSearchInput.value = query;
  resultsSummary.textContent = `Searching for “${query}”`;
  resultsList.innerHTML = "";
  setError("");
  setEmpty(false);
  setLoading(true);
  const startedAt = performance.now();

  try {
    const data = await fetchJson(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}`);
    const results = Array.isArray(data.results) ? data.results : [];
    lastSearchDurationMs = performance.now() - startedAt;
    resultsSummary.textContent = formatSemanticSummary(query, results, lastSearchDurationMs, data.semantic);
    renderResults(results);
    setLoading(false);
    setEmpty(results.length === 0);
    renderStatsModal();
  } catch (error) {
    lastSearchDurationMs = performance.now() - startedAt;
    resultsList.innerHTML = "";
    setLoading(false);
    setError(error.message || "Something went wrong while searching");
    renderStatsModal();
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

homeDashboardButton.addEventListener("click", () => {
  openStatsModal();
});

homeDictionaryButton.addEventListener("click", () => {
  openDictionaryModal();
});

resultsDictionaryButton.addEventListener("click", () => {
  openDictionaryModal();
});

resultsDashboardButton.addEventListener("click", () => {
  openStatsModal();
});

statsModalClose.addEventListener("click", () => {
  closeStatsModal();
});

statsModal.addEventListener("click", (event) => {
  if (event.target === statsModal) {
    closeStatsModal();
  }
});

dictionaryModalClose.addEventListener("click", () => {
  closeDictionaryModal();
});

dictionaryModal.addEventListener("click", (event) => {
  if (event.target === dictionaryModal) {
    closeDictionaryModal();
  }
});

dictionaryPrevButton.addEventListener("click", () => {
  if (dictionaryPage > 1) {
    loadDictionaryPage(dictionaryPage - 1);
  }
});

dictionaryNextButton.addEventListener("click", () => {
  if (dictionaryPage < dictionaryTotalPages) {
    loadDictionaryPage(dictionaryPage + 1);
  }
});

dictionarySearchInput.addEventListener(
  "input",
  debounce(() => {
    dictionarySearchTerm = dictionarySearchInput.value.trim().toLowerCase();
    loadDictionaryPage(1);
  }, 220)
);

window.addEventListener("popstate", () => {
  const query = new URLSearchParams(window.location.search).get("q") || "";
  if (query.trim()) {
    performSearch(query.trim());
  } else {
    setView("home");
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !statsModal.classList.contains("hidden")) {
    closeStatsModal();
  }
  if (event.key === "Escape" && !dictionaryModal.classList.contains("hidden")) {
    closeDictionaryModal();
  }
});

wireAutocompleteInput(homeSearchInput, homeAutocomplete);
wireAutocompleteInput(resultsSearchInput, resultsAutocomplete);

(async function init() {
  await fetchStats();

  const query = new URLSearchParams(window.location.search).get("q") || "";
  if (query.trim()) {
    homeSearchInput.value = query.trim();
    await performSearch(query.trim());
  } else {
    setView("home");
    homeSearchInput.focus();
  }
})();
