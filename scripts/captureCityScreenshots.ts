import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { PRELOADED_CITIES } from "../src/utils/preloadedCities";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:5173";
const OUT_DIR = "public/assets/screenshots/cities";
const VIEWPORT = { width: 1600, height: 1000 };
const ONLY = process.argv.slice(2);

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

mkdirSync(OUT_DIR, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

try {
  for (const city of PRELOADED_CITIES.filter((c) => !ONLY.length || ONLY.includes(c.id))) {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    // Only the preloaded area is needed, so live downloads are blocked to keep the screenshots reproducible
    await page.setRequestInterception(true);
    page.on("request", (request) => (request.url().includes("interpreter") ? request.abort() : request.continue()));
    await page.goto(`${BASE_URL}/map?lat=${city.lat}&lng=${city.lng}&zoom=${city.zoom}&name=${encodeURIComponent(city.name)}`, {
      waitUntil: "domcontentloaded",
    });

    await page.waitForSelector(".leaflet-image-layer", { timeout: 180000 });
    await page.waitForFunction(() => !document.body.innerText.includes("Getting"), { timeout: 180000 });
    await sleep(5000);

    // Controls and the loading popup are interface, the screenshots should only show the map
    await page.evaluate(() => {
      document.querySelectorAll("div").forEach((el) => {
        if (el.style.zIndex === "100") el.style.display = "none";
      });
    });
    await page.screenshot({ path: `${OUT_DIR}/${city.id}.jpg`, type: "jpeg", quality: 82 });
    console.log(`Saved ${city.id}`);
    await page.close();
  }
} finally {
  await browser.close();
}