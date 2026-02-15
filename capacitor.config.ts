import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.getinvolved.cocktailplanner",
  appName: "Get Involved",
  // Bundled (offline-first) web app for iOS lives here.
  webDir: "mobile/dist",
  server: {
    cleartext: false,
    allowNavigation: ["events.getinvolved.com.au", "*.getinvolved.com.au", "*.vercel.app"],
  },
};

export default config;
