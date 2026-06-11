// Tạo VAPID key pair cho Web Push (chạy 1 lần duy nhất):
//   node scripts/gen-vapid-keys.mjs
// Output:
//   - vapid-keys.local.json (gitignored) — JSON {publicKey, privateKey} dạng JWK,
//     paste NGUYÊN VĂN vào secret VAPID_KEYS_JSON của edge function send-push.
//   - In ra applicationServerKey (base64url) — hardcode vào src/lib/push-notify.ts.
// ⚠️ KHÔNG chạy lại sau khi đã có user subscribe: đổi key = mọi subscription chết,
// từng máy phải bật lại toggle thông báo.
import { webcrypto } from "node:crypto";
import { writeFileSync } from "node:fs";

const pair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const publicKey = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
const privateKey = await webcrypto.subtle.exportKey("jwk", pair.privateKey);

// applicationServerKey = base64url(0x04 || x || y) — uncompressed P-256 point
const b64uToBuf = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const raw = Buffer.concat([Buffer.from([4]), b64uToBuf(publicKey.x), b64uToBuf(publicKey.y)]);

writeFileSync("vapid-keys.local.json", JSON.stringify({ publicKey, privateKey }, null, 2));
console.log("Đã ghi vapid-keys.local.json (KHÔNG commit file này).");
console.log("applicationServerKey (public, cho push-notify.ts):");
console.log(raw.toString("base64url"));
