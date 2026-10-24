# backend-engineer-notes

Backend engineering notes from building systems at ThoughtClan, Swiggy and
Intuit: Java and the JVM, system design, databases, caching, Kafka, Postgress.

**Read the site:** https://i-am-rashmi.github.io/backend-engineer-notes/

## How it works
Notion (source of truth)
  → `npm run sync-notion` converts pages to Markdown in `src/content/docs/`
  → Astro Starlight builds the sidebar from the folder tree
  → GitHub Actions deploys to GitHub Pages

Folders are categories, `.md` files are pages. Add one and it appears on the
next build.

## Run locally
    npm install
    NOTION_TOKEN=... npm run sync-notion   # pull latest notes
    npm run dev                            # http://localhost:4321

## Repo layout
- `src/content/docs/`  the notes (synced from Notion)
- `scripts/`           Notion sync
- `src/styles/`        site theme
