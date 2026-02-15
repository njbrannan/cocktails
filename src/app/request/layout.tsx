import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://events.getinvolved.com.au",
  ),
  title: "Get Involved Catering | Cocktail Party Planner",
  description:
    "Our Cocktail Party Planning App offers a seamless and innovative new way to organise your perfect cocktail party! Select from our 12 most popular creations, fill in the quantity of drinks you’re after and receive your comprehensive shopping list for the night. Then just click to book your Bartender and we turn your vision into an unforgettable experience.",
  openGraph: {
    title: "Get Involved Catering | Cocktail Party Planner",
    description:
      "Our Cocktail Party Planning App offers a seamless and innovative new way to organise your perfect cocktail party! Select from our 12 most popular creations, fill in the quantity of drinks you’re after and receive your comprehensive shopping list for the night. Then just click to book your Bartender and we turn your vision into an unforgettable experience.",
    type: "website",
    images: [
      {
        url: "/icon",
        width: 512,
        height: 512,
        alt: "Get Involved Catering",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Get Involved Catering | Cocktail Party Planner",
    description:
      "Select cocktails, fill in quantities, get your shopping list, then book Bartenders.",
    images: ["/icon"],
  },
};

export default function RequestLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
