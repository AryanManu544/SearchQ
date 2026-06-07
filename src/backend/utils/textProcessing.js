const SEARCH_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
  "to", "was", "were", "will", "with", "this", "but", "they", "have",
  "had", "what", "said", "each", "which", "their", "time", "if", "up",
  "out", "many", "then", "them", "these", "so", "some", "her", "would",
  "make", "like", "into", "him", "two", "more", "very", "after", "words",
  "long", "than", "first", "been", "call", "who", "oil", "now", "find",
  "down", "day", "did", "get", "come", "made", "may", "part",
]);

function preprocessText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term && !SEARCH_STOPWORDS.has(term));
}

function sanitizeCommandText(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

module.exports = {
  SEARCH_STOPWORDS,
  preprocessText,
  sanitizeCommandText,
};
