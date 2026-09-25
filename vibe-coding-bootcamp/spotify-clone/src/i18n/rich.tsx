import { Fragment, type ReactNode } from 'react';

/**
 * Renders a translated message containing <tag>…</tag> markers, replacing each
 * with a React element: rich(t('queue.emptyHint'), { songs: (c) => <Link …>{c}</Link> }).
 * Keeps markup (links, emphasis) out of the translation files.
 */
export function rich(text: string, tags: Record<string, (chunk: string) => ReactNode>): ReactNode {
  const parts: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const render = tags[m[1]!];
    parts.push(<Fragment key={m.index}>{render ? render(m[2]!) : m[2]}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
