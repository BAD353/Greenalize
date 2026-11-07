import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:5173";
const OUT_DIR = "public/assets/screenshots";
const VIEWPORT = { width: 1600, height: 1000 };

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function waitForMap(page) {
  await page.waitForSelector(".leaflet-image-layer", { timeout: 120000 });
  // Let the heatmap overlay and map tiles settle
  await page.waitForFunction(() => !document.body.innerText.includes("Loading parks"), { timeout: 120000 });
  await sleep(6000);
}

// The floating buttons would look clickable in a static screenshot
async function hideControls(page) {
  await page.evaluate(() => {
    document.querySelectorAll("div").forEach((el) => {
      if (el.style.zIndex === "100") el.style.display = "none";
    });
  });
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT_DIR}/${name}.jpg`, type: "jpeg", quality: 85 });
  console.log(`Saved ${name}`);
}

async function open(browser, lat, lng, zoom) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(`${BASE_URL}/map?lat=${lat}&lng=${lng}&zoom=${zoom}`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForMap(page);
  return page;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const overview = await open(browser, 41.4, 2.16, 14);
  await hideControls(overview);
  await shot(overview, "heatmap-overview");

  const detail = await open(browser, 41.3925, 2.1795, 16);
  await hideControls(detail);
  await shot(detail, "parks-detail");

  const filters = await open(browser, 41.4, 2.16, 14);
  await filters.evaluate(() => {
    [...document.querySelectorAll("img")].find((i) => i.src.includes("menu.svg"))?.click();
  });
  await sleep(500);
  // Expand the Heatmap options first, then the Parks filters, so the layout does not shift between clicks
  await filters.evaluate(() => {
    const icons = [...document.querySelectorAll("svg")].filter((s) => s.getAttribute("viewBox") === "0 0 24 24" && s.style.cursor === "pointer");
    icons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await sleep(300);
  await filters.evaluate(() => {
    const icons = [...document.querySelectorAll("svg")].filter((s) => s.getAttribute("viewBox") === "0 0 24 24" && s.style.cursor === "pointer");
    icons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await sleep(1500);
  await shot(filters, "filters-panel");
} finally {
  await browser.close();
}