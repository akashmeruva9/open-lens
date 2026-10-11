/** Env access is evaluated at call time so secrets injected after import (and tests) are honoured. */
export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function missingEnv(names: string[]): string[] {
  return names.filter((n) => !env(n));
}

export function intEnv(name: string, def: number): number {
  const v = env(name);
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function boolEnv(name: string, def = false): boolean {
  const v = env(name);
  if (!v) return def;
  return /^(1|true|yes|on)$/i.test(v);
}

export function jsonEnv<T>(name: string): T | undefined {
  const v = env(name);
  if (!v) return undefined;
  try {
    return JSON.parse(v) as T;
  } catch {
    return undefined;
  }
}

export function graphVersion(): string {
  return env("META_GRAPH_VERSION") ?? "v23.0";
}

export function graphBase(): string {
  return `https://graph.facebook.com/${graphVersion()}`;
}

export function statusFromMissing(names: string[]): { live: boolean; reason?: string } {
  const m = missingEnv(names);
  return m.length ? { live: false, reason: `missing env: ${m.join(", ")}` } : { live: true };
}
