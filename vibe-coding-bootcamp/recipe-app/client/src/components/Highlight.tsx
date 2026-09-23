/**
 * Renders a search snippet with the matched words in <mark>. The server wraps
 * hits in \u0002 ... \u0003; splitting on those (instead of injecting HTML)
 * keeps recipe text from ever being interpreted as markup.
 */
export function Highlight({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\u0002[^\u0003]*\u0003)/);
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.startsWith('\u0002') ? (
          <mark key={index} className="rounded-sm bg-primary/15 px-0.5 font-medium text-foreground">
            {part.slice(1, -1)}
          </mark>
        ) : (
          part.replace(/\r?\n+/g, ' ')
        )
      )}
    </span>
  );
}

/** The snippet as plain text, e.g. to compare it with a title. */
export const plainSnippet = (text: string) => text.replace(/[\u0002\u0003]/g, '').replace(/\s+/g, ' ').trim();
