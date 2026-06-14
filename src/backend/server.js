const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config/searchConfig");
const SearchEngineClient = require("./services/searchEngineClient");
const WordEmbeddingModel = require("./services/wordEmbeddingModel");

const app = express();

app.use(cors());
app.use(express.static(config.publicDir));

const searchClient = new SearchEngineClient({
  executablePath: config.searchEnginePath,
  datasetPath: config.datasetPath,
});

const semanticModel = new WordEmbeddingModel({
  filePath: config.embeddingsPath,
  expansionLimit: config.semantic.expansionLimit,
  similarityThreshold: config.semantic.similarityThreshold,
});
semanticModel.load();

function getRequiredQueryParam(req, res, key) {
  const value = typeof req.query[key] === "string" ? req.query[key].trim() : "";
  if (!value) {
    res.status(400).json({ error: `Missing required query parameter: ${key}` });
    return null;
  }
  return value;
}

function getPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

app.get("/api/search", async (req, res) => {
  const query = getRequiredQueryParam(req, res, "q");
  if (!query) {
    return;
  }

  try {
    const expansion = semanticModel.expandQuery(query);
    const result = await searchClient.sendCommand(`search ${expansion.expandedQuery}`, config.timeouts.search);
    res.json({
      ...result,
      semantic: {
        enabled: semanticModel.loaded,
        originalTerms: expansion.originalTerms,
        expandedTerms: expansion.expandedTerms,
        expandedQuery: expansion.expandedQuery,
      },
    });
  } catch (error) {
    res.status(504).json({ error: error.message });
  }
});

app.get("/api/document", async (req, res) => {
  const id = getRequiredQueryParam(req, res, "id");
  if (!id) {
    return;
  }

  try {
    const result = await searchClient.sendCommand(`document ${id}`, config.timeouts.search);
    res.json(result);
  } catch (error) {
    res.status(504).json({ error: error.message });
  }
});

app.get("/api/autocomplete", async (req, res) => {
  const prefix = getRequiredQueryParam(req, res, "prefix");
  if (!prefix) {
    return;
  }

  try {
    const result = await searchClient.sendCommand(`autocomplete ${prefix}`, config.timeouts.autocomplete);
    res.json(result);
  } catch (error) {
    res.status(504).json({ error: error.message });
  }
});

app.get("/api/stats", async (_req, res) => {
  try {
    const result = await searchClient.sendCommand("stats", config.timeouts.stats);
    res.json({
      ...result,
      semanticModel: semanticModel.getStatus(),
    });
  } catch (error) {
    res.status(504).json({ error: error.message });
  }
});

app.get("/api/dictionary", async (req, res) => {
  const page = getPositiveInteger(req.query.page, 1);
  const limit = getPositiveInteger(req.query.limit, 100);

  try {
    const result = await searchClient.sendCommand("dictionary", config.timeouts.dictionary);

    if (!Array.isArray(result)) {
      res.status(502).json({ error: "Invalid dictionary response from search engine." });
      return;
    }

    const totalItems = result.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
    const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const startIndex = (safePage - 1) * limit;
    const endIndex = startIndex + limit;

    res.json({
      page: safePage,
      limit,
      total_items: totalItems,
      total_pages: totalPages,
      items: result.slice(startIndex, endIndex),
    });
  } catch (error) {
    res.status(504).json({ error: error.message });
  }
});

app.get("/health", async (_req, res) => {
  try {
    await searchClient.start();
    res.json({
      ok: true,
      service: "SearchiQ API",
      semanticModel: semanticModel.getStatus(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(config.publicDir, "index.html"));
});

const server = app.listen(config.port, async () => {
  try {
    await searchClient.start();
    console.log(`SearchiQ API listening on http://localhost:${config.port}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});

async function shutdown() {
  server.close(async () => {
    await searchClient.stop();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
