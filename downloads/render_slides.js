/* Render the 13 deck slides (public/slides) to 2560x1440 PNGs for PPTX export. */
const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const outDir = "/home/z/my-project/download/render";
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  });
  for (let i = 1; i <= 13; i++) {
    const n = String(i).padStart(2, "0");
    await page.goto(`file:///home/z/my-project/public/slides/slide_${n}.html`, {
      waitUntil: "networkidle",
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${outDir}/slide_${n}.png` });
    console.log("rendered slide", n);
  }
  await browser.close();
  console.log("DONE");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
