// Replaces {{email}}, {{developer}}, {{updated}} and {{price}} in Markdown text and links with the
// values in site.ts, so the legal pages never hold a second copy of them.
import { SITE } from './site';

const TOKENS: Record<string, string> = {
  email: SITE.email,
  developer: SITE.developer,
  updated: SITE.legalUpdated,
  price: SITE.proPrice,
};

const sub = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => TOKENS[k] ?? m);

type Node = { value?: unknown; url?: unknown; children?: Node[] };

export function remarkSiteTokens() {
  return (tree: Node) => {
    const walk = (node: Node) => {
      if (typeof node.value === 'string') node.value = sub(node.value);
      if (typeof node.url === 'string') node.url = sub(decodeURI(node.url));
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
