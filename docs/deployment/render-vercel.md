# Render and Vercel Deployment

This project is designed to run as two deploys:

- Render hosts the Node/Express API and native C++ search binary.
- Vercel hosts the static frontend from `public/`.

## Render Backend

Use these settings if you configure Render manually:

```text
Runtime: Node
Build Command: npm run deploy:build
Start Command: npm start
```

Environment variables:

```text
SEARCH_DATASET_PATH=20news-18828
SEARCH_ENGINE_PATH=./search_engine
WORD_EMBEDDINGS_PATH=./src/models/word_embeddings.json
SEMANTIC_EXPANSION_LIMIT=5
SEMANTIC_SIMILARITY_THRESHOLD=0.45
```

Health checks:

```text
https://your-render-service.onrender.com/health
https://your-render-service.onrender.com/api/stats
```

## Vercel Frontend

Use these settings:

```text
Framework Preset: Other
Build Command: empty
Output Directory: public
```

After the Render backend is live, set the frontend API base URL in `public/config.js`:

```js
window.SEARCHIQ_API_BASE_URL = "https://your-render-service.onrender.com/api";
```

For local full-stack development, the default same-origin API path works with `npm start`.
