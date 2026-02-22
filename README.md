# tools

## Optional Favicon Proxy (GitHub Pages compatible)

This app is hosted statically and can optionally use a separate Cloudflare Worker for favicon extraction bypassing browser CORS limits.

- Worker source: `cloudflare/favicon-proxy/`
- Frontend env var: `PUBLIC_FAVICON_PROXY_BASE`

If `PUBLIC_FAVICON_PROXY_BASE` is not set, favicon extraction still works in browser-only mode, but some sites may fail due to CORS.
