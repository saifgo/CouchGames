// couchpad.tv: the public site. Static output, no client framework.
// The app itself (TV host + phone controller) lives on app.couchpad.tv.
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import { remarkSiteTokens } from './src/remark-site-tokens.ts';

export default defineConfig({
  site: 'https://couchpad.tv',
  // privacy.html, terms.html…: the Play Console already points at these URLs (docs/PLAY-STORE.md).
  build: { format: 'file' },
  trailingSlash: 'never',
  integrations: [sitemap({ filter: (page) => !page.includes('/404') && !page.includes('/testing') })],
  markdown: { processor: unified({ remarkPlugins: [remarkSiteTokens] }) },
  devToolbar: { enabled: false },
});
