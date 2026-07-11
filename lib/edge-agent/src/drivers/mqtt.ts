/**
 * MQTT poller for the edge agent.
 *
 * MQTT is push-based, not request/response, so "polling" means: keep one
 * persistent subscription per broker+topic and return the latest decoded
 * message whenever the orchestrator's poll tick fires.
 */

import mqtt, { type MqttClient } from "mqtt";
import type { FieldDef, ParamMap } from "./types.js";
import { logger } from "../logger.js";

function getByJsonPath(obj: unknown, jsonPath: string): unknown {
  // Supports simple "$.a.b.c" dot paths — matches the cloud driver's convention.
  const parts = jsonPath.replace(/^\$\.?/, "").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export class MqttSubscription {
  private client: MqttClient | null = null;
  private latest: Record<string, unknown> | null = null;

  constructor(
    private readonly brokerUrl: string,
    private readonly topic: string,
    private readonly fieldMap: FieldDef[],
  ) {}

  connect(): void {
    this.client = mqtt.connect(this.brokerUrl, { reconnectPeriod: 5_000 });
    this.client.on("connect", () => {
      this.client!.subscribe(this.topic, (err) => {
        if (err) logger.warn("MQTT subscribe failed", { topic: this.topic, err: String(err) });
      });
    });
    this.client.on("message", (_topic, payload) => {
      try {
        this.latest = JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
      } catch {
        // Non-JSON payload — ignore, keep last good value
      }
    });
    this.client.on("error", (err) => logger.warn("MQTT client error", { topic: this.topic, err: String(err) }));
  }

  /** Returns the most recently decoded message, or throws if nothing has arrived yet. */
  async poll(): Promise<ParamMap> {
    if (!this.latest) throw new Error("No MQTT message received yet");
    const params: ParamMap = {};
    for (const field of this.fieldMap) {
      if (!field.jsonPath) continue;
      const value = getByJsonPath(this.latest, field.jsonPath);
      if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
        params[field.key] = value;
      }
    }
    return params;
  }

  close(): void {
    this.client?.end(true);
  }
}
