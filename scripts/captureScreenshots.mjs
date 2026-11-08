import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:5173";
const OUT_DIR = "public/assets/screenshots";
const README_DIR = "public/markdown";
const VIEWPORT = { width: 1600, height: 1000 };

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Everything is shot on the preloaded Barcelona area, so live downloads are blocked to keep the screenshots reproducible
async function newPage(browser) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.setRequestInterception(true);
  page.on("request", (request) => (request.url().includes("interpreter") ? request.abort() : request.continue()));
  return page;
}

async function waitForMap(page) {
  await page.waitForSelector(".leaflet-image-layer", { timeout: 120000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Getting"), { timeout: 120000 });
  // Let the heatmap overlay and map tiles settle
  await sleep(6000);
}

// The floating buttons and the loading popup would look clickable in a static screenshot
async function hideControls(page) {
  await page.evaluate(() => {
    document.querySelectorAll("div").forEach((el) => {
      if (el.style.zIndex === "100") el.style.display = "none";
    });
  });
}

async function shot(page, path) {
  await page.screenshot({ path: `${path}.jpg`, type: "jpeg", quality: 85 });
  console.log(`Saved ${path}`);
}

async function openMap(browser, lat, lng, zoom) {
  const page = await newPage(browser);
  await page.goto(`${BASE_URL}/preloaded/barcelona?lat=${lat}&lng=${lng}&zoom=${zoom}`, { waitUntil: "domcontentloaded" });
  await waitForMap(page);
  return page;
}

async function openSidebar(page) {
  await page.evaluate(() => {
    [...document.querySelectorAll("img")].find((i) => i.src.includes("menu.svg"))?.click();
  });
  await sleep(500);
  // Expand the Heatmap options first, then the Parks filters, so the layout does not shift between clicks
  for (const index of [1, 0]) {
    await page.evaluate((i) => {
      const icons = [...document.querySelectorAll("svg")].filter((s) => s.getAttribute("viewBox") === "0 0 24 24" && s.style.cursor === "pointer");
      icons[i]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, index);
    await sleep(300);
  }
  await sleep(1000);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  // Screenshots for the landing page
  const overview = await openMap(browser, 41.4, 2.16, 14);
  await hideControls(overview);
  await shot(overview, `${OUT_DIR}/heatmap-overview`);

  const detail = await openMap(browser, 41.3925, 2.1795, 16);
  await hideControls(detail);
  await shot(detail, `${OUT_DIR}/parks-detail`);

  const filters = await openMap(browser, 41.4, 2.16, 14);
  await openSidebar(filters);
  await shot(filters, `${OUT_DIR}/filters-panel`);

  // Screenshots for the README, with the interface visible
  const map = await openMap(browser, 41.3925, 2.1795, 14);
  await shot(map, `${README_DIR}/park-map`);

  const landing = await newPage(browser);
  await landing.goto(`${BASE_URL}/`, { waitUntil: "networkidle2" });
  await sleep(2000);
  await shot(landing, `${README_DIR}/city_selection`);
} finally {
  await browser.close();
}