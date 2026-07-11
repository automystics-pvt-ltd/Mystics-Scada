/**
 * Minimal structured logger for the Edge Gateway Agent.
 *
 * This package ships as a standalone container that runs outside the
 * Replit workspace (on a plant-local Raspberry Pi / industrial PC), so it
 * does not use the workspace's pino/req.log conventions — plain
 * timestamped JSON lines to stdout/stderr are what a systemd/docker log
 * collector expects.
 */

type Fields = Record<string, unknown>;

function line(level: string, msg: string, fields?: Fields): string {
  return JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
}

export const logger = {
  info(msg: string, fields?: Fields): void {
    console.log(line("info", msg, fields));
  },
  warn(msg: string, fields?: Fields): void {
    console.warn(line("warn", msg, fields));
  },
  error(msg: string, fields?: Fields): void {
    console.error(line("error", msg, fields));
  },
};
