import { createECDH, randomBytes } from "node:crypto";
import http from "node:http";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require("http_ece") as { decrypt: (buf: Buffer, p: Record<string, unknown>) => Buffer };

/**
 * A stand-in for a browser push service (like Google's FCM). The test plays
 * the browser: it makes the device keys, so it can decrypt exactly what the
 * app's server sent, proving the payload is encrypted end to end.
 */
export type PushMessage = { path: string; headers: http.IncomingHttpHeaders; payload: { title: string; body?: string; url?: string; tag?: string } };

export function fakeDevice(port: number, name: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    name,
    ecdh,
    auth,
    subscription: { endpoint: `http://127.0.0.1:${port}/push/${name}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } },
  };
}

export async function startMockPush(devices: ReturnType<typeof fakeDevice>[], port = 3298) {
  const received: PushMessage[] = [];
  const status = new Map<string, number>();
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const name = req.url?.split("/").pop() ?? "";
      const device = devices.find((d) => d.name === name);
      const code = status.get(name) ?? 201;
      if (device && code === 201) {
        const plain = ece.decrypt(Buffer.concat(chunks), { version: "aes128gcm", privateKey: device.ecdh, authSecret: device.auth.toString("base64url") });
        received.push({ path: req.url ?? "", headers: req.headers, payload: JSON.parse(plain.toString("utf8")) });
      }
      res.writeHead(code).end();
    });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return { received, setStatus: (name: string, code: number) => status.set(name, code), close: () => new Promise<void>((r) => server.close(() => r())) };
}
