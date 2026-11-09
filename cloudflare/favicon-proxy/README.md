# Favicon Proxy Worker

This worker is a separate deploy target for the GitHub Pages frontend.

It exposes:

- `GET /health`
- `GET /discover?url=https://example.com`
- `GET /proxy?url=https://example.com/favicon.ico`

Requests are only served to browsers whose `Origin` (or, for `<img>` loads,
`Referer`) matches an entry in `ALLOWED_ORIGINS` in `wrangler.toml`; an entry
such as `https://*.example.pages.dev` matches every subdomain, and an empty
list allows any caller during local development. Upstream fetches time out after
10 seconds, follow at most five redirects with each hop checked against the
private-address blocklist, and are capped at 2 MB for HTML and 10 MB for
proxied files.

## Deploy

1. Install dependencies:

```bash
cd cloudflare/favicon-proxy
pnpm install --ignore-workspace --ignore-scripts
```

`--ignore-scripts` skips the esbuild and workerd post-install steps, which
pnpm 12 otherwise refuses to run unapproved; wrangler's bundling and the
type-check do not need them.

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
