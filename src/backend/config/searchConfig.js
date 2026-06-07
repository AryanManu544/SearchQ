const path = require("path");

const projectRoot = path.resolve(__dirname, "../../..");

function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  projectRoot,
  port: numberFromEnv("PORT", 3000),
  datasetPath: process.env.SEARCH_DATASET_PATH || "20news-18828",
  searchEnginePath: path.resolve(projectRoot, process.env.SEARCH_ENGINE_PATH || "./search_engine"),
  embeddingsPath: path.resolve(projectRoot, process.env.WORD_EMBEDDINGS_PATH || "./src/models/word_embeddings.json"),
  publicDir: path.resolve(projectRoot, "public"),
  timeouts: {
    search: numberFromEnv("SEARCH_TIMEOUT_MS", 5000),
    autocomplete: numberFromEnv("AUTOCOMPLETE_TIMEOUT_MS", 3000),
    stats: numberFromEnv("STATS_TIMEOUT_MS", 3000),
    dictionary: numberFromEnv("DICTIONARY_TIMEOUT_MS", 15000),
  },
  semantic: {
    expansionLimit: numberFromEnv("SEMANTIC_EXPANSION_LIMIT", 5),
    similarityThreshold: numberFromEnv("SEMANTIC_SIMILARITY_THRESHOLD", 0.45),
  },
};
