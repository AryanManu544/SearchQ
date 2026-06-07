# SearchiQ

SearchiQ is a full-stack semantic document search engine. It combines a native C++ inverted index, TF-IDF ranking, a Node/Express API bridge, and a polished static frontend. A custom word embeddings model expands user queries before they hit the native ranker, giving the project a practical AI layer while keeping the core search engine fast and explainable.

## Highlights

- Native C++ search core with recursive document loading, preprocessing, inverted indexing, TF-IDF ranking, autocomplete, dictionary browsing, and API mode.
- Word embedding query expansion from `src/models/word_embeddings.json`.
- Express backend that keeps the compiled C++ process alive and serializes commands through stdin/stdout.
- Static frontend with semantic search summaries, autocomplete, result cards, dictionary browser, and model/index dashboard.
- Deployment-ready structure for Render backend hosting and Vercel static frontend hosting.

## Project Structure

```text
.
├── public/
│   ├── assets/
│   │   ├── css/
│   │   │   └── styles.css
│   │   └── js/
│   │       └── app.js
│   ├── config.js
│   └── index.html
├── src/
│   ├── backend/
│   │   ├── config/
│   │   │   └── searchConfig.js
│   │   ├── services/
│   │   │   ├── searchEngineClient.js
│   │   │   └── wordEmbeddingModel.js
│   │   ├── utils/
│   │   │   └── textProcessing.js
│   │   └── server.js
│   ├── cpp/
│   │   ├── InvertedIndex.cpp
│   │   ├── InvertedIndex.h
│   │   ├── PerformanceTracker.cpp
│   │   ├── PerformanceTracker.h
│   │   ├── Preprocessor.cpp
│   │   ├── Preprocessor.h
│   │   ├── SearchEngine.cpp
│   │   ├── SearchEngine.h
│   │   ├── TFIDFCalculator.cpp
│   │   ├── TFIDFCalculator.h
│   │   └── main.cpp
│   └── models/
│       └── word_embeddings.json
├── compile.sh
├── download_dataset.sh
├── package.json
├── render.yaml
└── vercel.json
```

## Architecture

Search requests flow through three layers:

```text
Browser UI -> Express API -> Word Embedding Expansion -> Native C++ TF-IDF Engine -> JSON Results
```

The C++ engine builds and queries the index. The backend loads the embedding model once at startup, creates a centroid from the user query, selects the closest terms, boosts exact query terms, and sends the expanded query to the native engine. The frontend renders both the ranked results and the AI expansion terms so the behavior is visible during testing.

## Quick Start

Install dependencies:

```bash
npm install
```

Prepare the dataset:

```bash
npm run dataset:prepare
```

Compile the native engine:

```bash
npm run build:native
```

Start the full local app:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run build:native      # Compile the C++ binary
npm run dataset:prepare   # Extract 20news-18828 if it is not already present
npm run deploy:build      # Render-friendly install/build/dataset command
npm run check             # Syntax-check backend and frontend JS
npm run dev               # Run the local Express server
npm start                 # Run the production server entrypoint
```

## API

```text
GET /health
GET /api/search?q=computer%20graphics
GET /api/autocomplete?prefix=comp
GET /api/dictionary?page=1&limit=100
GET /api/stats
```

Search responses include semantic metadata:

```json
{
  "results": [],
  "semantic": {
    "enabled": true,
    "originalTerms": ["computer", "graphics"],
    "expandedTerms": [
      { "term": "graphic", "score": 0.7569 }
    ],
    "expandedQuery": "computer graphics computer graphics graphic"
  }
}
```

## Configuration

Backend environment variables:

```bash
PORT=3000
SEARCH_DATASET_PATH=20news-18828
SEARCH_ENGINE_PATH=./search_engine
WORD_EMBEDDINGS_PATH=./src/models/word_embeddings.json
SEMANTIC_EXPANSION_LIMIT=5
SEMANTIC_SIMILARITY_THRESHOLD=0.45
SEARCH_TIMEOUT_MS=5000
AUTOCOMPLETE_TIMEOUT_MS=3000
STATS_TIMEOUT_MS=3000
DICTIONARY_TIMEOUT_MS=15000
```

Frontend API configuration lives in `public/config.js`:

```js
window.SEARCHIQ_API_BASE_URL = "";
```

Leave it empty for same-origin local development. Set it to your Render backend URL before deploying the static frontend to Vercel:

```js
window.SEARCHIQ_API_BASE_URL = "https://your-render-service.onrender.com/api";
```

## Deployment

Render can use `render.yaml`, or you can configure the service manually:

```text
Build Command: npm run deploy:build
Start Command: npm start
```

Vercel can use `vercel.json`:

```text
Output Directory: public
```

Detailed deployment steps are in [docs/deployment/render-vercel.md](docs/deployment/render-vercel.md).

## Notes

- The generated binary `search_engine`, object files, `node_modules`, and extracted dataset are intentionally ignored.
- The tarball `20news-18828.tar.gz` is used during deploy builds so Render can recreate the dataset.
- Render free services can cold start. The first search may take longer because the native index and embedding model need to load.
