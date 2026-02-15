import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get Involved Catering | Cocktail Party Planner",
  description:
    "Our Cocktail Party Planning App offers a seamless and innovative way to organise your perfect cocktail party. Select cocktails, set quantities, receive your shopping list, then book Bartenders.",
  openGraph: {
    title: "Get Involved Catering | Cocktail Party Planner",
    description:
      "Select cocktails, fill in quantities, get your comprehensive shopping list, then click to book Bartenders.",
    type: "website",
    images: [
      {
        url: "/icon.png",
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
      "Select cocktails, set quantities, get a shopping list, then book Bartenders.",
    images: ["/icon.png"],
  },
};

export default function RequestLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
