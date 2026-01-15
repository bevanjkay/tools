# AGENTS.md

Instructions for AI agents working on this project.

## Project Overview

This is a **SvelteKit** project that builds a collection of web-based tools. It uses:

- **Svelte 5** with runes
- **TypeScript** with strict mode
- **Vite 7** for bundling
- **pnpm** as the package manager
- **Static adapter** for deployment (outputs to `build/`)

## Project Structure

```
src/
├── app.html          # HTML template
├── app.d.ts          # TypeScript declarations
├── lib/              # Shared library code
│   ├── index.ts      # Library exports
│   ├── types.ts      # Type definitions
│   ├── assets/       # Static assets
│   └── styles/       # Global styles
└── routes/                   # SvelteKit routes
    ├── +layout.svelte
    ├── +page.svelte
    └── tools/                # Tool routes
        └── pdf-imposition/   # Example individual tool
```

## Development Commands

| Command         | Description              |
| --------------- | ------------------------ |
| `pnpm dev`      | Start development server |
| `pnpm build`    | Build for production     |
| `pnpm preview`  | Preview production build |
| `pnpm check`    | Run Svelte type checking |
| `pnpm lint`     | Run ESLint               |
| `pnpm lint:fix` | Run ESLint with auto-fix |

## Before Completing Work

**Always run these commands before completing any work:**

```bash
pnpm check
pnpm lint
```

Ensure both commands pass without errors before considering work complete.

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
3. Use `$lib` imports for shared code and types
4. Follow existing tools as examples

## Dependencies

- **pdf-lib** - PDF manipulation library (used by pdf-imposition tool)

Install dependencies with `pnpm install`.
