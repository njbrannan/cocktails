import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.getinvolved.cocktailplanner",
  appName: "Get Involved",
  webDir: "dist",
  // We host the Next.js app on the web and simply wrap it for iOS.
  server: {
    url: "https://events.getinvolved.com.au/request",
    cleartext: false,
    allowNavigation: [
      "events.getinvolved.com.au",
      "*.getinvolved.com.au",
      "*.vercel.app",
      "vgieooqyseuriqdmbazp.supabase.co",
    ],
  },
};

export default config;
