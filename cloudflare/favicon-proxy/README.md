# Favicon Proxy Worker

This worker is a separate deploy target for the GitHub Pages frontend.

It exposes:

- `GET /health`
- `GET /discover?url=https://example.com`
- `GET /proxy?url=https://example.com/favicon.ico`

## Deploy

1. Install dependencies:

```bash
cd cloudflare/favicon-proxy
pnpm install
```

2. Login and deploy:

```bash
pnpm wrangler login
pnpm deploy
```

3. Copy the deployed worker base URL, e.g.:

`https://tools-favicon-proxy.<account>.workers.dev`

4. In the frontend deployment, set env var:

`PUBLIC_FAVICON_PROXY_BASE=https://tools-favicon-proxy.<account>.workers.dev`

With this env var set, the favicon extractor will use the worker for cross-origin discovery and file downloads.
