export const EVENT_BODY_LIMIT = 1e6;

export function idParam(u: URL): string {
  return u.searchParams.get('id') || '';
}
