/**
 * Display the org's name in tight nav/header chrome.
 * Falls back to the first whitespace-delimited word when the full name
 * exceeds `maxLen` so a long church name like "Hope Community Church"
 * collapses to "Hope" without breaking the header layout.
 */
/**
 * The church's name as it should read in prose ("Lakeside" → "Lakeside Church").
 * Leaves a name that already ends in "church" untouched, matching case-insensitively
 * but preserving whatever casing the church typed. Returns null when there is no
 * name, so callers can fall back to generic wording rather than printing an empty
 * slot mid-sentence.
 */
export function churchName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  return /(^|\s)church$/i.test(trimmed) ? trimmed : `${trimmed} Church`;
}

export function displayedOrgName(name: string | null | undefined, maxLen = 18): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length <= maxLen) return trimmed;
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord && firstWord.length > 0 ? firstWord : trimmed;
}
