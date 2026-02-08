import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.getinvolved.cocktailplanner",
  appName: "Get Involved",
  webDir: "dist",
  // We host the Next.js app on the web and simply wrap it for iOS.
  server: {
    url: "https://www.prawnstars.net/request",
    cleartext: false,
    allowNavigation: [
      "prawnstars.net",
      "*.prawnstars.net",
      "www.prawnstars.net",
      "*.vercel.app",
      "vgieooqyseuriqdmbazp.supabase.co",
    ],
  },
};

export default config;
