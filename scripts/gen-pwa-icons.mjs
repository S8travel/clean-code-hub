// Sinh bộ icon PWA từ public/logo.jpg → public/*.png.
// sharp KHÔNG nằm trong dependencies (chỉ dùng 1 lần khi đổi logo). Chạy:
//   npm install --no-save sharp && node scripts/gen-pwa-icons.mjs
// Logo gốc 307x397 (dọc) → bo vào canvas vuông nền trắng, căn giữa.
import sharp from "sharp";

const SRC = "public/logo.jpg";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// size: cạnh canvas vuông; pad: tỉ lệ canvas mà logo chiếm (phần còn lại là lề).
async function make(size, pad, out) {
  const box = Math.round(size * pad);
  const logo = await sharp(SRC).resize(box, box, { fit: "inside" }).toBuffer();
  const { width, height } = await sharp(logo).metadata();
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
    .png()
    .toFile(out);
  console.log("✓", out, `${size}x${size}`);
}

await make(192, 0.82, "public/pwa-192x192.png");
await make(512, 0.82, "public/pwa-512x512.png");
// Maskable: lề rộng hơn để logo nằm trong "safe zone" (~60% giữa) khi launcher bo tròn/cắt.
await make(512, 0.6, "public/maskable-512x512.png");
await make(180, 0.82, "public/apple-touch-icon.png");
await make(32, 0.88, "public/favicon-32x32.png");
