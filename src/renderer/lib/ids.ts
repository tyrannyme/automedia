export function newLocalId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
