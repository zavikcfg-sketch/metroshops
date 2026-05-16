/** Порты для админки: Bothost проксирует домен на PORT из панели (часто 3000 или 8080). */

const BOTHOST_DEFAULT_PORTS = [3000, 8080];

function parsePort(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

export function logPortDiagnostics() {
  const keys = [
    "PORT",
    "ADMIN_PORT",
    "BOTHOST_PORT",
    "INTERNAL_PORT",
    "SERVER_PORT",
    "WEB_PORT",
  ];
  const envPorts = {};
  for (const k of keys) {
    if (process.env[k] != null) envPorts[k] = process.env[k];
  }
  console.log("[metro-shop] Port env:", JSON.stringify(envPorts));
}

/** Список портов, на которых поднимаем HTTP (чтобы не было Bad Gateway). */
export function resolveListenPorts() {
  const ports = new Set(BOTHOST_DEFAULT_PORTS);

  for (const key of [
    "PORT",
    "ADMIN_PORT",
    "BOTHOST_PORT",
    "INTERNAL_PORT",
    "SERVER_PORT",
    "WEB_PORT",
  ]) {
    const p = parsePort(process.env[key]);
    if (p) ports.add(p);
  }

  return [...ports].sort((a, b) => a - b);
}

export function primaryListenPort() {
  const ports = resolveListenPorts();
  const fromPort = parsePort(process.env.PORT);
  if (fromPort) return fromPort;
  const fromAdmin = parsePort(process.env.ADMIN_PORT);
  if (fromAdmin) return fromAdmin;
  return ports[0] ?? 3000;
}
