const minPort = 1;
const maxPort = 65_535;

export function resolvePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < minPort || port > maxPort) return fallback;
  return port;
}
