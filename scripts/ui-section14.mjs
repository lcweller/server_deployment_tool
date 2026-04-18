/**
 * Section 14: headless browser smoke — requires `npm run dev` + DB + verified user.
 * Env: BASE_URL (must be the dev server under test, e.g. http://127.0.0.1:3000), E2E_EMAIL, E2E_PASSWORD
 */
import { chromium, request as playwrightRequest } from "playwright";

// Use `||` so empty-string env vars (common in shells) don't bypass defaults (`??` only treats null/undefined).
const BASE = (process.env.BASE_URL || "").trim() || "http://127.0.0.1:3000";
const EMAIL =
  (process.env.E2E_EMAIL || "").trim() || "steamline_e2e_7314378@test.local";
const PASSWORD =
  (process.env.E2E_PASSWORD || "").trim() || "SecurePass123!";

function shouldIgnoreConsole(text) {
  const t = text.toLowerCase();
  if (t.includes("favicon")) return true;
  if (t.includes("chrome-extension://")) return true;
  if (t.includes("failed to load resource") && t.includes("turnstile")) return true;
  // Custom Node server does not upgrade Next dev HMR socket — noisy, not app bugs.
  if (t.includes("webpack-hmr") || t.includes("_next/webpack-hmr")) return true;
  if (t.includes("invalid_http_response") && t.includes("hmr")) return true;
  return false;
}

async function main() {
  const req = await playwrightRequest.newContext({ baseURL: BASE });
  let loginRes;
  for (let attempt = 0; attempt < 5; attempt++) {
    loginRes = await req.post("/api/auth/login", {
      data: { email: EMAIL, password: PASSWORD },
    });
    if (loginRes.ok()) break;
    if (attempt < 4) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  if (!loginRes.ok()) {
    const body = await loginRes.text();
    throw new Error(
      `Login API failed ${loginRes.status()}: ${body.slice(0, 500)} — set E2E_EMAIL/E2E_PASSWORD or verify user in DB`
    );
  }
  const storageState = await req.storageState();
  await req.dispose();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState,
    viewport: { width: 1440, height: 900 },
  });
  await context.addCookies([
    { name: "sidebar_state", value: "true", url: BASE },
  ]);
  const page = await context.newPage();

  const issues = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (shouldIgnoreConsole(text)) return;
    issues.push({ where: "console", url: page.url(), text });
  });
  page.on("pageerror", (err) => {
    issues.push({
      where: "pageerror",
      url: page.url(),
      text: err.message,
    });
  });

  /** @type {{path: string, note?: string}[]} */
  const routes = [
    { path: "/dashboard", note: "overview" },
    { path: "/hosts", note: "host list" },
    { path: "/servers", note: "instances" },
    { path: "/catalog", note: "catalog" },
    { path: "/notifications", note: "history" },
    { path: "/settings", note: "profile" },
    { path: "/billing", note: "billing" },
    { path: "/settings/notifications", note: "notification prefs" },
    { path: "/docs", note: "docs default" },
    { path: "/docs/getting-started", note: "docs md" },
  ];

  for (const { path, note } of routes) {
    const before = issues.length;
    console.log(`→ ${path} (${note})`);
    await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 60_000 });
    if (page.url().includes("/login")) {
      throw new Error(`${path}: unexpected redirect to login (session not applied?)`);
    }
    if (page.url().includes("/verify-email")) {
      throw new Error(
        `${path}: redirect to verify-email — mark user email_verified_at in DB`
      );
    }
    const textLen = (await page.locator("body").innerText()).trim().length;
    if (textLen < 30) {
      throw new Error(`${path}: body text too short (${textLen}) — possible blank page`);
    }
    const added = issues.length - before;
    if (added > 0) {
      console.log(`  WARN ${added} console/page errors`);
      issues.slice(before).forEach((i) => console.log("   ", JSON.stringify(i)));
    } else {
      console.log("  PASS");
    }
  }

  await page.goto(`${BASE}/hosts`, { waitUntil: "load" });
  const hostLink = page.locator("ul.grid a[href^=\"/hosts/\"]").first();
  const count = await hostLink.count();
  if (count === 0) {
    console.log("→ SKIP /hosts/[id] (no host cards)");
  } else {
    const href = await hostLink.getAttribute("href");
    console.log(`→ ${href} (host detail)`);
    const before = issues.length;
    await page.goto(`${BASE}${href}`, { waitUntil: "load", timeout: 60_000 });
    await page
      .locator("body")
      .getByText(/Game servers|Enrollment pending|Host ID/i)
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    await page
      .locator("body")
      .getByText(/Remote terminal|Terminal/i)
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    await page
      .locator("body")
      .getByText(/Backup|backups/i)
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    const added = issues.length - before;
    if (added > 0) {
      console.log(`  WARN ${added} errors on host detail`);
      issues.slice(before).forEach((i) => console.log("   ", JSON.stringify(i)));
    } else {
      console.log("  PASS host detail sections visible");
    }
  }

  console.log("→ notification bell (dashboard)");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "load", timeout: 60_000 });
  await page
    .getByText(/@test\.local|test\.local/i)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  // Dev keeps a long-lived HMR WebSocket open, so `networkidle` is unreliable; give React a beat to hydrate.
  await page.waitForTimeout(1200);
  const beforeBell = issues.length;
  const bell = page.locator('[aria-label="Notifications"]');
  await bell.waitFor({ state: "visible", timeout: 15_000 });
  await bell.click();
  await page
    .getByTestId("notification-dropdown")
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("link", { name: "View all" }).click();
  await page.waitForURL("**/notifications**", { timeout: 15_000 });
  if (issues.length > beforeBell) {
    console.log("  WARN bell flow");
    issues.slice(beforeBell).forEach((i) => console.log("   ", JSON.stringify(i)));
  } else {
    console.log("  PASS bell + view all");
  }

  console.log("→ Add host wizard");
  await page.goto(`${BASE}/hosts`, { waitUntil: "load" });
  const beforeWizard = issues.length;
  await page.getByRole("button", { name: "Add host" }).click();
  await page.getByRole("dialog").waitFor({ state: "visible", timeout: 20_000 });
  await page.getByLabel(/Host name/i).fill(`Playwright ${Date.now()}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Linux/i })
    .first()
    .click();
  await page.getByRole("button", { name: "Create & show command" }).click();
  await page
    .getByText(/^Pairing code$/)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  console.log("  PASS pairing + QR area");
  await page.keyboard.press("Escape");
  if (issues.length > beforeWizard) {
    issues.slice(beforeWizard).forEach((i) => console.log("   ", JSON.stringify(i)));
  }

  await browser.close();

  const hard = issues.filter((i) => !shouldIgnoreConsole(i.text ?? ""));
  if (hard.length > 0) {
    console.error("\nFAIL:", JSON.stringify(hard, null, 2));
    process.exit(1);
  }
  console.log("\nALL UI ROUTES OK — no blocking console/page errors.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
