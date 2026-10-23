import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const legal = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/legal' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** One sentence shown under the title. */
    summary: z.string(),
    order: z.number(),
    /** false: reachable by link only (not in the Help and legal list or the sitemap). */
    listed: z.boolean().default(true),
    /** Three short facts for the tile beside the title. */
    facts: z.array(z.string()).length(3),
  }),
});

export const collections = { legal };
