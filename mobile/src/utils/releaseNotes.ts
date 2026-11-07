/** Release notes are written as Markdown on GitHub; show them as plain, tidy lines. */
export function releaseNotes(notes: string): string[] {
  return notes
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
        .replace(/^#{1,6}\s*/, '')
        .replace(/\*\*|__|`/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 12);
}
