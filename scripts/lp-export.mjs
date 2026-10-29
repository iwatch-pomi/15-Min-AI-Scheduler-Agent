// Claude Design から書き出した紹介ページ（HTML）を、JS なしで表示できる普通の HTML にして public/ に置く。
// 書き出しのファイルは、開いたあとに中身を展開する作りなので、そのままでは Google や SNS が説明文・画像を読めない。
//
// 使い方：node scripts/lp-export.mjs <書き出したHTML> <出力先のフォルダ> <公開するアドレス> <画像の名前,…>
//   例：node scripts/lp-export.mjs ~/Downloads/LP.html public/lp https://15-min-ai-scheduler-agent.vercel.app/lp home,chat,calendar
// 画像の名前は、ページに出てくる順。og-image.jpg は別に用意して、出力先のフォルダに置く
// Playwright（Chromium）が要る。アプリの依存には入れていないので、使うときは `npx -p playwright` などで用意する
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");

const [src, outDir, base, names] = process.argv.slice(2);
if (!src || !outDir || !base || !names) {
  console.error("使い方：node scripts/lp-export.mjs <書き出したHTML> <出力先のフォルダ> <公開するアドレス> <画像の名前,…>");
  process.exit(1);
}
const imageNames = names.split(",");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("file://" + path.resolve(src));
await page.waitForTimeout(5000);
// 下までスクロールして、スクロールで出てくる部分も描かせる
const height = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < height; y += 300) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(80);
}
await page.waitForTimeout(1500);

// 画像（blob:）を取り出す
const images = await page.evaluate(async () => {
  const out = [];
  for (const img of document.querySelectorAll("img")) {
    const blob = await (await fetch(img.src)).blob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);
    out.push({ src: img.getAttribute("src"), type: blob.type, data: btoa(bin) });
  }
  return out;
});
if (images.length !== imageNames.length) throw new Error(`画像は ${images.length} 枚あります（名前は ${imageNames.length} 個）`);
let html = "<!DOCTYPE html>\n" + (await page.evaluate(() => document.documentElement.outerHTML));
await browser.close();

fs.mkdirSync(outDir, { recursive: true });
const urlPath = new URL(base).pathname.replace(/\/$/, "");
images.forEach((img, i) => {
  const ext = img.type.split("/")[1].replace("jpeg", "jpg");
  const file = `${imageNames[i]}.${ext}`;
  fs.writeFileSync(path.join(outDir, file), Buffer.from(img.data, "base64"));
  html = html.split(img.src).join(`${urlPath}/${file}`);
});

// 実行時の部品（スクリプト・テンプレート・下書き用の見た目）を外す。JSON-LD は残す
html = html
  .replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g, "")
  .replace(/<x-dc>[\s\S]*?<\/x-dc>/g, "")
  .replace(/<style>\s*x-dc\{display:none!important\}\s*<\/style>/g, "")
  .replace(/<style>\s*\.sc-placeholder[\s\S]*?<\/style>/, "")
  .replace(/<meta name="hz:[^"]*"[^>]*>/g, "")
  .replace(/\s(data-dc-[a-z-]+|data-sc-[a-z-]+)="[^"]*"/g, "")
  .replace(/\sclass="(sc-dc-streaming)?"/g, "");
// SNS 用：og:image は完全なアドレスにし、og:url と canonical を足す
html = html.replace(
  /<meta property="og:image" content="[^"]*">/,
  `<meta property="og:image" content="${base}/og-image.jpg"><meta property="og:url" content="${base}"><link rel="canonical" href="${base}">`,
);
if (/blob:|\/_blob\//.test(html)) throw new Error("まだ書き出し先の中を指している画像があります");
fs.writeFileSync(path.join(outDir, "index.html"), html);
console.log(`書き出しました：${path.join(outDir, "index.html")}（画像 ${images.length} 枚）`);
