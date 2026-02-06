import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.getinvolved.cocktailplanner",
  appName: "Get Involved",
  webDir: "dist",
  // We host the Next.js app on the web and simply wrap it for iOS.
  server: {
    url: "https://quantification-consulting.com",
    cleartext: false,
    allowNavigation: [
      "quantification-consulting.com",
      "*.quantification-consulting.com",
      "*.vercel.app",
      "vgieooqyseuriqdmbazp.supabase.co",
    ],
  },
};

export default config;
