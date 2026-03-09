/** Derive a concise title from a user prompt. */
export function deriveTitle(prompt: string): string {
  let text = prompt.replace(/\s+/g, " ").trim();

  const prefixes = [
    /^(can you|could you|please|i('d| would) like (you )?to|i want (you )?to|go ahead and|let'?s|try to)\s+/i,
    /^(make|change|update|set|add|remove|create|fix|adjust|modify)\s+/i,
  ];
  for (const re of prefixes) {
    const match = text.match(re);
    if (match) {
      text = text.slice(match[0].length);
      break;
    }
  }

  const clauseEnd = text.search(/[.!?\n]|,\s+(and|but|then|also)\s+/i);
  if (clauseEnd > 0 && clauseEnd < 60) {
    text = text.slice(0, clauseEnd);
  }

  text = text.charAt(0).toUpperCase() + text.slice(1);

  if (text.length > 45) {
    const cut = text.slice(0, 45);
    const lastSpace = cut.lastIndexOf(" ");
    text = (lastSpace > 15 ? cut.slice(0, lastSpace) : cut) + "…";
  }

  return text || "Chat";
}

/** Format a timestamp as a short relative time string (e.g. "2m", "3h", "5d"). */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
