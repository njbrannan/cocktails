import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get Involved Catering | Cocktail Menu Builder",
  description:
    "Tap cocktails, add quantities, and we’ll calculate a shopping list with bottle rounding plus a 10% buffer. Book Bartenders for your Event.",
  openGraph: {
    title: "Get Involved Catering | Cocktail Menu Builder",
    description:
      "Tap cocktails, add quantities, and we’ll calculate a shopping list with bottle rounding plus a 10% buffer.",
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
    title: "Get Involved Catering | Cocktail Menu Builder",
    description:
      "Tap cocktails, add quantities, and we’ll calculate a shopping list with bottle rounding plus a 10% buffer.",
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

