/**
 * HTTP poller for the edge agent — GET a JSON endpoint and extract fields by
 * jsonPath, same convention as the cloud API's HttpDriver.
 */

import type { FieldDef, ParamMap } from "./types.js";

function getByJsonPath(obj: unknown, jsonPath: string): unknown {
  const parts = jsonPath.replace(/^\$\.?/, "").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export interface HttpTarget {
  url: string;
  fieldMap: FieldDef[];
  httpAuthMethod?: "none" | "bearer" | "api_key" | "basic";
  httpAuthValue?: string;
  httpApiKeyHeader?: string;
}

export async function pollHttp(target: HttpTarget): Promise<ParamMap> {
  const headers: Record<string, string> = {};
  if (target.httpAuthMethod === "bearer" && target.httpAuthValue) {
    headers["Authorization"] = `Bearer ${target.httpAuthValue}`;
  } else if (target.httpAuthMethod === "basic" && target.httpAuthValue) {
    headers["Authorization"] = `Basic ${Buffer.from(target.httpAuthValue).toString("base64")}`;
  } else if (target.httpAuthMethod === "api_key" && target.httpAuthValue && target.httpApiKeyHeader) {
    headers[target.httpApiKeyHeader] = target.httpAuthValue;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(target.url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP poll failed: ${res.status}`);
    const body = (await res.json()) as unknown;
    const params: ParamMap = {};
    for (const field of target.fieldMap) {
      if (!field.jsonPath) continue;
      const value = getByJsonPath(body, field.jsonPath);
      if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
        params[field.key] = value;
      }
    }
    return params;
  } finally {
    clearTimeout(timer);
  }
}
