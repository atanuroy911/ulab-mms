/**
 * Lab courses often run two back-to-back sessions (e.g. "3:05PM - 4:25PM, 4:30PM - 5:50PM"),
 * so teachers sometimes duplicate the room for each slot when typing it in (e.g. "PB206,PB206")
 * to visually pair them up. Collapse that down to unique room names for display so the same
 * room isn't printed/shown twice.
 */
export function formatClassRoomDisplay(classRoom?: string | null): string {
  if (!classRoom) return '';
  const parts = classRoom
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return '';

  const unique = Array.from(new Set(parts));
  return unique.join(', ');
}
