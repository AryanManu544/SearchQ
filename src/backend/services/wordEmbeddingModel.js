const fs = require("fs");
const { SEARCH_STOPWORDS, preprocessText, sanitizeCommandText } = require("../utils/textProcessing");

class WordEmbeddingModel {
  constructor(options) {
    this.filePath = options.filePath;
    this.expansionLimit = options.expansionLimit;
    this.similarityThreshold = options.similarityThreshold;
    this.entries = [];
    this.byTerm = new Map();
    this.dimension = 0;
    this.loaded = false;
    this.loadError = null;
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        throw new Error(`Embeddings file not found: ${this.filePath}`);
      }

      const rawEmbeddings = JSON.parse(fs.readFileSync(this.filePath, "utf8"));

      for (const [term, vector] of Object.entries(rawEmbeddings)) {
        if (!Array.isArray(vector) || vector.length === 0) {
          continue;
        }

        const normalized = this.normalizeVector(vector);
        if (!normalized) {
          continue;
        }

        const entry = { term: term.toLowerCase(), vector: normalized };
        this.entries.push(entry);
        this.byTerm.set(entry.term, entry.vector);
      }

      this.dimension = this.entries[0]?.vector.length || 0;
      this.loaded = this.entries.length > 0;
    } catch (error) {
      this.loadError = error.message;
      this.loaded = false;
      console.warn(`Semantic search disabled: ${error.message}`);
    }
  }

  getStatus() {
    return {
      enabled: this.loaded,
      vocabularySize: this.entries.length,
      dimensions: this.dimension,
      path: this.filePath,
      error: this.loadError,
    };
  }

  expandQuery(query) {
    if (!this.loaded || this.expansionLimit <= 0) {
      return {
        originalTerms: preprocessText(query),
        expandedTerms: [],
        expandedQuery: sanitizeCommandText(query),
      };
    }

    const originalTerms = [...new Set(preprocessText(query))];
    const queryVector = this.buildQueryVector(originalTerms);

    if (!queryVector) {
      return { originalTerms, expandedTerms: [], expandedQuery: sanitizeCommandText(query) };
    }

    const originalTermSet = new Set(originalTerms);
    const scoredTerms = [];

    for (const entry of this.entries) {
      if (originalTermSet.has(entry.term) || SEARCH_STOPWORDS.has(entry.term) || !/^[a-z0-9]+$/.test(entry.term)) {
        continue;
      }

      const score = this.cosineSimilarity(queryVector, entry.vector);
      if (score >= this.similarityThreshold) {
        scoredTerms.push({ term: entry.term, score });
      }
    }

    scoredTerms.sort((a, b) => b.score - a.score);
    const expandedTerms = scoredTerms.slice(0, this.expansionLimit);
    const expansionText = expandedTerms.map((item) => item.term).join(" ");
    const exactBoostText = originalTerms.join(" ");
    const expandedQuery = sanitizeCommandText(`${query} ${exactBoostText} ${expansionText}`);

    return { originalTerms, expandedTerms, expandedQuery };
  }

  buildQueryVector(terms) {
    const vectors = terms.map((term) => this.byTerm.get(term)).filter(Boolean);

    if (!vectors.length) {
      return null;
    }

    const centroid = new Array(vectors[0].length).fill(0);
    for (const vector of vectors) {
      for (let index = 0; index < vector.length; index += 1) {
        centroid[index] += vector[index];
      }
    }

    return this.normalizeVector(centroid);
  }

  normalizeVector(vector) {
    const numericVector = vector.map(Number);
    const magnitude = Math.sqrt(numericVector.reduce((sum, value) => sum + value * value, 0));

    if (!Number.isFinite(magnitude) || magnitude === 0) {
      return null;
    }

    return numericVector.map((value) => value / magnitude);
  }

  cosineSimilarity(left, right) {
    let score = 0;
    for (let index = 0; index < left.length; index += 1) {
      score += left[index] * right[index];
    }
    return score;
  }
}

module.exports = WordEmbeddingModel;
