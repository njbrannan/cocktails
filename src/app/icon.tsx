import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

// Favicon / app icon rendered at build time. This matches the prawn-in-cocktail-glass mark.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0b0b0c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="340"
          height="340"
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Martini glass */}
          <path
            d="M112 124h288l-144 152L112 124Z"
            stroke="#86B9C3"
            strokeWidth="18"
            strokeLinejoin="round"
          />
          <path
            d="M256 276v118"
            stroke="#86B9C3"
            strokeWidth="18"
            strokeLinecap="round"
          />
          <path
            d="M200 410h112"
            stroke="#86B9C3"
            strokeWidth="18"
            strokeLinecap="round"
          />

          {/* Prawn body (stylized) */}
          <path
            d="M312 170c-26-26-74-28-102-2-20 18-24 45-11 66 15 25 45 34 74 27 19-4 33-14 41-28 10-18 9-44-2-63Z"
            fill="#E85A61"
          />
          <path
            d="M214 214c-20-2-37-12-50-28-8-10-18-14-30-12"
            stroke="#E85A61"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M330 188c18 0 34 8 46 22"
            stroke="#E85A61"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <circle cx="304" cy="188" r="8" fill="#0b0b0c" />
        </svg>
      </div>
    ),
    size,
  );
}

