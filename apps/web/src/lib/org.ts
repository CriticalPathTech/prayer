/**
 * Display the org's name in tight nav/header chrome.
 * Falls back to the first whitespace-delimited word when the full name
 * exceeds `maxLen` so a long church name like "Hope Community Church"
 * collapses to "Hope" without breaking the header layout.
 */
export function displayedOrgName(name: string | null | undefined, maxLen = 18): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length <= maxLen) return trimmed;
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord && firstWord.length > 0 ? firstWord : trimmed;
}
