const backgroundCanvas = document.getElementById("semantic-background");
const homeView = document.getElementById("home-view");
const resultsView = document.getElementById("results-view");
const homeForm = document.getElementById("home-form");
const resultsForm = document.getElementById("results-form");
const homeSearchInput = document.getElementById("home-search-input");
const resultsSearchInput = document.getElementById("results-search-input");
const homeAutocomplete = document.getElementById("home-autocomplete");
const resultsAutocomplete = document.getElementById("results-autocomplete");
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

function startSemanticBackground() {
  if (!backgroundCanvas) {
    return;
  }

  const context = backgroundCanvas.getContext("2d");
  const pointer = { x: 0, y: 0, active: false };
  const colors = ["#00E5C0", "#80F3E2", "#34D399", "#7EADA6"];
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
    const nodeCount = Math.max(60, Math.min(140, Math.floor(width / 11)));
    nodes = Array.from({ length: nodeCount }, (_, index) => {
      const baseRadius = 1.0 + Math.random() * 2.0;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        baseRadius: baseRadius,
        radius: baseRadius,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.0015 + Math.random() * 0.002,
        color: colors[index % colors.length],
      };
    });
  }

  function draw(timestamp) {
    context.clearRect(0, 0, width, height);

    // Subtle background glow overlay to complement the CSS gradient
    const wash = context.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, Math.max(width, height));
    wash.addColorStop(0, "rgba(0, 229, 192, 0.03)");
    wash.addColorStop(1, "rgba(10, 15, 14, 0)");
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);

    for (const node of nodes) {
      node.x += node.vx;
      node.y += node.vy;

      // Pulse radius
      node.radius = node.baseRadius + Math.sin(timestamp * node.pulseSpeed + node.phase) * 0.8;
      if (node.radius < 0.5) {
        node.radius = 0.5;
      }

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
          const shimmer = Math.sin(timestamp * 0.0015 + (left.x + right.y) * 0.01) * 0.35 + 0.65;
          const baseOpacity = 0.15 * (1 - distance / 150);
          const opacity = baseOpacity * shimmer;
          context.strokeStyle = `rgba(0, 229, 192, ${opacity})`;
          context.lineWidth = 1;
          context.stroke();
        }
      }
    }

    for (const node of nodes) {
      context.beginPath();
      context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      context.fillStyle = node.color;
      // Pulse node opacity slightly
      const pulseOpacity = 0.5 + 0.25 * Math.sin(timestamp * node.pulseSpeed + node.phase);
      context.globalAlpha = pulseOpacity;
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
  window.requestAnimationFrame(draw);
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
        <article class="result-card" data-doc-id="${escapeHtml(String(result.docId))}" data-score="${escapeHtml(Number(result.score || 0).toFixed(1))}">
          <div class="result-meta-row">
            <div class="result-url">Document ${escapeHtml(String(result.docId))}</div>
            <div class="result-score-badge">${escapeHtml(Number(result.score || 0).toFixed(1))} score</div>
          </div>
          <h2 class="result-title">Indexed document #${escapeHtml(String(result.docId))}</h2>
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

// Document Detail Modal Functionality
function parseDocHeaders(rawText) {
  const lines = rawText.split("\n");
  let from = "Unknown Sender";
  let subject = "No Subject";
  let bodyStartIndex = 0;
  let headersEnded = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") {
      bodyStartIndex = i + 1;
      headersEnded = true;
      break;
    }
    const fromMatch = line.match(/^From:\s*(.*)/i);
    if (fromMatch) {
      from = fromMatch[1];
      continue;
    }
    const subjectMatch = line.match(/^Subject:\s*(.*)/i);
    if (subjectMatch) {
      subject = subjectMatch[1];
      continue;
    }
  }

  const fullContent = headersEnded 
    ? lines.slice(bodyStartIndex).join("\n").trim()
    : rawText.trim();

  return { from, subject, fullContent };
}

function extractKeyTerms(subject, content) {
  const cleanSubject = subject
    .replace(/^(re|fwd|fw|re\^\[\d+\]):\s*/i, "")
    .replace(/[^\w\s]/g, " ")
    .trim();

  const stopWords = new Set([
    "the", "and", "a", "of", "to", "in", "is", "that", "it", "on", "for", "this",
    "with", "as", "was", "are", "have", "you", "your", "from", "subject", "organization"
  ]);

  const subjectTerms = cleanSubject
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length >= 3 && !stopWords.has(word));

  if (subjectTerms.length >= 2) {
    return subjectTerms.slice(0, 5).join(" ");
  }

  const bodyWords = content
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length >= 4 && !stopWords.has(word));

  const freqMap = {};
  for (const word of bodyWords) {
    freqMap[word] = (freqMap[word] || 0) + 1;
  }

  const sortedWords = Object.keys(freqMap).sort((a, b) => freqMap[b] - freqMap[a]);
  const contentTerms = sortedWords.slice(0, 4);

  const merged = [...subjectTerms, ...contentTerms].slice(0, 5);
  return merged.join(" ");
}

const modalOverlay = document.getElementById("document-modal");
const modalCloseBtn = document.getElementById("modal-close-button");
const modalBtnCopy = document.getElementById("modal-btn-copy");
const modalBtnExport = document.getElementById("modal-btn-export");
const modalBtnSimilar = document.getElementById("modal-btn-similar");

async function openDocumentModal(docId, score) {
  const modalDocId = document.getElementById("modal-doc-id");
  const modalTitle = document.getElementById("modal-doc-title");
  const modalScore = document.getElementById("modal-meta-score");
  const modalSender = document.getElementById("modal-meta-sender");
  const modalSubject = document.getElementById("modal-meta-subject");
  const modalFrom = document.getElementById("modal-body-from");
  const modalSubj = document.getElementById("modal-body-subject");
  const modalContent = document.getElementById("modal-body-content");

  // Reset fields
  modalDocId.textContent = `Document ID: ${docId}`;
  modalTitle.textContent = `Indexed Document #${docId}`;
  modalScore.textContent = `${score}`;
  modalSender.textContent = "Loading...";
  modalSubject.textContent = "Loading...";
  modalFrom.textContent = "Loading...";
  modalSubj.textContent = "Loading...";
  modalContent.textContent = "Loading full document content...";

  modalOverlay.classList.remove("hidden");

  try {
    const data = await fetchJson(`${API_BASE_URL}/document?id=${docId}`);
    const rawContent = data.content || "";
    const parsed = parseDocHeaders(rawContent);

    modalSender.textContent = parsed.from;
    modalSubject.textContent = parsed.subject;
    modalFrom.textContent = parsed.from;
    modalSubj.textContent = parsed.subject;
    modalContent.textContent = parsed.fullContent;

    modalOverlay.setAttribute("data-current-id", docId);
    modalOverlay.setAttribute("data-current-subject", parsed.subject);
    modalOverlay.setAttribute("data-current-from", parsed.from);
    modalOverlay.setAttribute("data-current-content", parsed.fullContent);
  } catch (error) {
    modalContent.textContent = `Error loading document content: ${error.message}`;
    modalSender.textContent = "Error";
    modalSubject.textContent = "Error";
    modalFrom.textContent = "Error";
    modalSubj.textContent = "Error";
  }
}

function closeDocumentModal() {
  modalOverlay.classList.add("hidden");
}

resultsList.addEventListener("click", (event) => {
  const card = event.target.closest(".result-card");
  if (!card) return;

  const docId = card.getAttribute("data-doc-id");
  const score = card.getAttribute("data-score");
  if (docId) {
    openDocumentModal(docId, score);
  }
});

modalCloseBtn.addEventListener("click", closeDocumentModal);

modalOverlay.addEventListener("click", (event) => {
  if (event.target === modalOverlay) {
    closeDocumentModal();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDocumentModal();
  }
});

modalBtnCopy.addEventListener("click", () => {
  const docId = modalOverlay.getAttribute("data-current-id");
  if (!docId) return;

  navigator.clipboard.writeText(docId).then(() => {
    const originalText = modalBtnCopy.textContent;
    modalBtnCopy.textContent = "Copied!";
    modalBtnCopy.style.color = "#00E5C0";
    setTimeout(() => {
      modalBtnCopy.textContent = originalText;
      modalBtnCopy.style.color = "";
    }, 1500);
  });
});

modalBtnExport.addEventListener("click", () => {
  const docId = modalOverlay.getAttribute("data-current-id");
  const content = modalOverlay.getAttribute("data-current-content");
  if (!docId || !content) return;

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `document_${docId}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

modalBtnSimilar.addEventListener("click", () => {
  const subject = modalOverlay.getAttribute("data-current-subject") || "";
  const content = modalOverlay.getAttribute("data-current-content") || "";
  const query = extractKeyTerms(subject, content);
  if (!query) return;

  closeDocumentModal();

  if (resultsView.classList.contains("hidden")) {
    homeSearchInput.value = query;
  } else {
    resultsSearchInput.value = query;
  }
  submitSearch(query);
});

const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
if (initialQuery.trim()) {
  performSearch(initialQuery.trim());
} else {
  setView("home");
  homeSearchInput.focus();
}
