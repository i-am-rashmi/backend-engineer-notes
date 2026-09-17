// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import fs from 'node:fs';
import path from 'node:path';

const docsDir = path.join(process.cwd(), 'src/content/docs');
const categories = fs
  .readdirSync(docsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const sidebar = categories.map((category) => ({
  label: category
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' '),
  items: [{ autogenerate: { directory: category } }],
}));

// https://astro.build/config
export default defineConfig({
  site: 'https://i-am-rashmi.github.io',
  base: '/backend-engineer-notes',
  integrations: [
    starlight({
      title: 'Backend Engineer Notes',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/i-am-rashmi/backend-engineer-notes' },
      ],
      sidebar,
    }),
  ],
});