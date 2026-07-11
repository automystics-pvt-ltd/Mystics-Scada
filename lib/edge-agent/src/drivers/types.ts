export interface FieldDef {
  key: string;
  label?: string;
  unit?: string;
  // Modbus
  address?: number;
  length?: number;
  dataType?: "INT16" | "UINT16" | "INT32" | "UINT32" | "FLOAT32";
  multiplier?: number;
  offset?: number;
  // MQTT / HTTP
  jsonPath?: string;
  [key: string]: unknown;
}

export type ParamMap = Record<string, number | string | boolean | null>;

/** One poll cycle for a single device. Returns decoded params, or throws on failure. */
export type PollFn = () => Promise<ParamMap>;
