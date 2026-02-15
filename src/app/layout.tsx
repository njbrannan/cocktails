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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://events.getinvolved.com.au",
  ),
  title: "Get Involved! Catering | Cocktail Party Planner",
  description:
    "Our Cocktail Party Planning App offers a seamless and innovative new way to organise the perfect cocktail party! Select from our 12 most popular creations, fill in the quantity of drinks you’re after and receive your comprehensive shopping list for the night. Then just click to book your Bartender and we turn your vision into an unforgettable experience.",
  icons: {
    icon: [{ url: "/prawn-icon.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png" }],
  },
  openGraph: {
    title: "Get Involved! Catering | Cocktail Party Planner",
    description:
      "Our Cocktail Party Planning App offers a seamless and innovative new way to organise the perfect cocktail party! Select from our 12 most popular creations, fill in the quantity of drinks you’re after and receive your comprehensive shopping list for the night. Then just click to book your Bartender and we turn your vision into an unforgettable experience.",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Get Involved! Catering",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Get Involved! Catering | Cocktail Party Planner",
    description:
      "Select cocktails, fill in quantities, get your shopping list, then book Bartenders.",
    images: ["/og-image.png"],
  },
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
          // - `classic` is now the brand-matched look (Get Involved)
          // - Visit with `?theme=legacy` to revert to the previous (original) look
          // Choice is persisted in localStorage (`gi_theme`) so it sticks on refresh.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=new URLSearchParams(window.location.search);var t=p.get('theme');if(t){localStorage.setItem('gi_theme',t);}var s=localStorage.getItem('gi_theme');var next=t||s||document.documentElement.getAttribute('data-theme')||'classic';if(next==='gi'){next='classic';}if(next!=='classic'&&next!=='legacy'){next='classic';}document.documentElement.setAttribute('data-theme',next);}catch(e){}})();`,
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
