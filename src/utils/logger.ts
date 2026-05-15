const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "otp",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "jwt",
  "secret",
  "apikey",
  "api_key",
]);

const MAX_LOG_BODY_CHARS = 2000;

export function humanTimestamp(date: Date = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  const tzOffsetMin = -date.getTimezoneOffset();
  const tzSign = tzOffsetMin >= 0 ? "+" : "-";
  const tzAbs = Math.abs(tzOffsetMin);
  const tzh = pad(Math.floor(tzAbs / 60));
  const tzm = pad(tzAbs % 60);
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms} ${tzSign}${tzh}${tzm}`;
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return "[truncated]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function formatForLog(value: unknown): string {
  try {
    const safe = redact(value);
    const str = typeof safe === "string" ? safe : JSON.stringify(safe);
    if (str === undefined) return "undefined";
    if (str.length > MAX_LOG_BODY_CHARS) {
      return `${str.slice(0, MAX_LOG_BODY_CHARS)}... [truncated ${str.length - MAX_LOG_BODY_CHARS} chars]`;
    }
    return str;
  } catch {
    return "[unserializable]";
  }
}

export function newRequestId(): string {
  return Math.random().toString(36).slice(2, 10);
}
