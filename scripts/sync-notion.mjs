import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import fs from "fs-extra";
import path from "path";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const n2m = new NotionToMarkdown({ notionClient: notion });

const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const OUT_DIR = "src/content/docs";

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function titleCase(slug) {
  return slug
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, { retries = 5, baseDelayMs = 1000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimited = err?.code === "rate_limited" || err?.status === 429;
      if (!isRateLimited || attempt === retries) throw err;

      const retryAfterHeader = err?.headers?.get?.("retry-after");
      const retryAfterMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : baseDelayMs * Math.pow(2, attempt);

      console.log(
        `Rate limited. Retrying in ${retryAfterMs}ms (attempt ${attempt + 1}/${retries})...`
      );
      await sleep(retryAfterMs);
    }
  }
}

async function run() {
  const pages = [];
  let cursor;

  do {
    const res = await withRetry(() =>
      notion.databases.query({
        database_id: DATABASE_ID,
        start_cursor: cursor,
      })
    );
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  await fs.ensureDir(OUT_DIR);

  const categoriesUsed = new Set();

  for (const page of pages) {
    const titleProp = Object.values(page.properties).find(
      (p) => p.type === "title"
    );
    const title = titleProp?.title?.[0]?.plain_text || "Untitled";

    const fieldProp = page.properties["Field"];
    const category = fieldProp?.select?.name
      ? slugify(fieldProp.select.name)
      : "general";

    categoriesUsed.add(category);

    const mdBlocks = await withRetry(() => n2m.pageToMarkdown(page.id));
    const mdString = n2m.toMarkdownString(mdBlocks).parent;

    const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
---

`;

    const dir = path.join(OUT_DIR, category);
    await fs.ensureDir(dir);
    const filePath = path.join(dir, `${slugify(title)}.md`);
    await fs.writeFile(filePath, frontmatter + mdString);
    console.log(`Wrote ${filePath}`);

    await sleep(350);
  }

  // Generate (or refresh) a landing/index page for every category found this run
  for (const category of categoriesUsed) {
    const indexPath = path.join(OUT_DIR, category, "index.md");
    // Don't overwrite if you've hand-edited it already
    const alreadyExists = await fs.pathExists(indexPath);
    if (!alreadyExists) {
      const stubContent = `---
title: "${titleCase(category)}"
description: "Notes on ${titleCase(category)}."
---

Browse the notes in this section using the sidebar.
`;
      await fs.writeFile(indexPath, stubContent);
      console.log(`Created category index: ${indexPath}`);
    }
  }

  console.log(`\nDone. ${categoriesUsed.size} categories processed.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});