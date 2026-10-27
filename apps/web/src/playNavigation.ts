/** A new route key gives each attempt its own Player and cartridge lifecycle. */
export function nextAttemptHref(pathname: string, search: string, id: string): string {
  const params = new URLSearchParams(search);
  params.set("attempt", id);
  return `${pathname}?${params}`;
}
