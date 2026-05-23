import { createHash } from "node:crypto";

export function sanitizeBaseUrl(value?: string) {
  if (!value) {
    return null;
  }

  try {
    const parsedUrl = new URL(value);
    const normalized = parsedUrl.origin;

    return {
      label: normalized,
      hash: createHash("sha256").update(normalized).digest("hex")
    };
  } catch {
    return {
      label: null,
      hash: createHash("sha256").update(value).digest("hex")
    };
  }
}
