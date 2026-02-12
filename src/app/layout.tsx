import type { Metadata } from "next";
import { Manrope, Playfair_Display, Roboto } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-classic-display",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-classic-body",
  subsets: ["latin"],
});

// getinvolved.com.au is using Roboto, so we load it for the optional "GI" theme.
const roboto = Roboto({
  variable: "--font-gi-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Get Involved - Cocktail Party Planner",
  description:
    "Client-facing cocktail party planning with inventory math, bottle rounding, and admin recipe management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const defaultTheme = process.env.NEXT_PUBLIC_THEME_DEFAULT || "classic";

  return (
    <html lang="en" data-theme={defaultTheme}>
      <head>
        <script
          // Allow quick "brand match" comparisons without shipping a visible UI toggle:
          // - Visit with `?theme=gi` to switch to the Get Involved (Squarespace) look
          // - Visit with `?theme=classic` to revert
          // Choice is persisted in localStorage (`gi_theme`) so it sticks on refresh.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=new URLSearchParams(window.location.search);var t=p.get('theme');if(t){localStorage.setItem('gi_theme',t);}var s=localStorage.getItem('gi_theme');var next=t||s||document.documentElement.getAttribute('data-theme')||'classic';if(next!=='classic'&&next!=='gi'){next='classic';}document.documentElement.setAttribute('data-theme',next);}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${playfair.variable} ${manrope.variable} ${roboto.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
