import { logger } from "./logger.js";

export interface RemoteDevice {
  id: string;
  orgId: string;
  plantId: string;
  name: string;
  type: string;
  protocol: string;
  config: Record<string, unknown>;
  fieldMap: Array<Record<string, unknown>>;
  pollingIntervalSec: number;
}

export interface ReadingBatchItem {
  deviceId: string;
  ts: string;
  params: Record<string, number | string | boolean | null>;
}

/** Thin wrapper around the cloud API's /gateway/* endpoints (bearer token auth). */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request(path: string, init: RequestInit): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });
    return res;
  }

  async fetchDevices(): Promise<RemoteDevice[]> {
    const res = await this.request("/gateway/devices", { method: "GET" });
    if (!res.ok) {
      throw new Error(`fetchDevices failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
    return (await res.json()) as RemoteDevice[];
  }

  /** Returns true if the cloud accepted the batch (partial rejects are still success). */
  async pushReadings(batch: ReadingBatchItem[]): Promise<boolean> {
    if (batch.length === 0) return true;
    try {
      const res = await this.request("/gateway/readings", {
        method: "POST",
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        logger.warn("pushReadings rejected by cloud", { status: res.status });
        return false;
      }
      return true;
    } catch (err) {
      logger.warn("pushReadings network error — cloud unreachable", { err: String(err) });
      return false;
    }
  }

  async heartbeat(): Promise<void> {
    try {
      const res = await this.request("/gateway/heartbeat", { method: "POST" });
      if (!res.ok) logger.warn("heartbeat rejected by cloud", { status: res.status });
    } catch (err) {
      logger.warn("heartbeat network error — cloud unreachable", { err: String(err) });
    }
  }
}
