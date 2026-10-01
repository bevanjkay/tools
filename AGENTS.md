# AGENTS.md

Instructions for AI agents working on this project.

## Project Overview

This is a **SvelteKit** project that builds a collection of web-based tools. It uses:

- **Svelte 5** with runes
- **TypeScript** with strict mode
- **Vite 8** for bundling
- **pnpm** as the package manager
- **Tailwind CSS 4** with [shadcn-svelte](https://www.shadcn-svelte.com) UI components
- **Vitest** for unit tests
- **Static adapter** for deployment to GitHub Pages (outputs to `build/`)

## Project Structure

```text
src/
├── app.html          # HTML template
├── app.d.ts          # TypeScript declarations
├── lib/              # Shared library code
│   ├── tools.ts      # Tool registry (drives the home page and menu)
│   ├── types.ts      # Type definitions
│   ├── *.ts          # Framework-free logic, with `*.test.ts` alongside
│   ├── components/   # Shared components; `ui/` is shadcn-svelte
│   ├── shims/        # Build shims (see `vite.config.ts`)
│   ├── assets/       # Static assets
│   └── styles/       # Global styles
└── routes/                   # SvelteKit routes
    ├── +layout.svelte
    ├── +page.svelte
    └── tools/                # Tool routes
        └── pdf-imposition/   # Example individual tool
cloudflare/
└── favicon-proxy/    # Optional Cloudflare Worker used by the favicon extractor
```

## Development Commands

| Command         | Description              |
| --------------- | ------------------------ |
| `pnpm dev`      | Start development server |
| `pnpm build`    | Build for production     |
| `pnpm preview`  | Preview production build |
| `pnpm check`    | Run Svelte type checking |
| `pnpm test`     | Run Vitest unit tests    |
| `pnpm lint`     | Run ESLint               |
| `pnpm lint:fix` | Run ESLint with auto-fix |

## Before Completing Work

**Always run these commands before completing any work:**

```bash
pnpm check
pnpm lint
pnpm test
```

Ensure all three commands pass without errors before considering work complete.

## Code Style

This project uses [@antfu/eslint-config](https://github.com/antfu/eslint-config) with the following settings:

- **Quotes:** Double quotes (`"`)
- **Semicolons:** Required
- **Indentation:** Tabs
- **Formatters:** Enabled (handles Svelte, HTML, CSS, etc.)

ESLint handles both linting and formatting. Run `pnpm lint:fix` to auto-fix issues.

## TypeScript

- Strict mode is enabled
- Path alias `$lib` maps to `src/lib/`
- Use proper type annotations
- Avoid `any` types

## Svelte Guidelines

- Use Svelte 5 runes syntax (`$state`, `$derived`, `$effect`, etc.)
- Components are in `.svelte` files
- Each tool lives in its own route under `src/routes/tools/`

## Adding New Tools

1. Create a new folder under `src/routes/tools/` with the tool name
2. Add a `+page.svelte` file for the tool's UI
3. Register the tool in `src/lib/tools.ts`
4. Put non-trivial, DOM-free logic in `src/lib/` with Vitest tests
5. Use `$lib` imports for shared code and types
6. Follow existing tools as examples

## Dependencies

- **pdf-lib** - PDF creation and manipulation (PDF tools)
- **pdfjs-dist** - PDF rendering (PDF compressor)
- **jszip** - ZIP downloads for multi-file output
- **qr-code-styling** - QR code generator
- **@tensorflow-models/face-detection** - Face-aware cropping in the collage creator
- **bits-ui** / **@lucide/svelte** - UI primitives and icons

Install dependencies with `pnpm install`.
