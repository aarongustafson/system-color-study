import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "browser.spec.js",
  use: { baseURL: "http://127.0.0.1:4189/system-color-study/" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command:
      "npm run build && node scripts/serve.js --dist --base /system-color-study",
    url: "http://127.0.0.1:4189/system-color-study/",
    reuseExistingServer: false,
  },
});
