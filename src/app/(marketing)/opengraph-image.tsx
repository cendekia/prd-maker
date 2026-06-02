import { ImageResponse } from "next/og";

// Default social-share image for all marketing pages. Generated at build/
// request time by Satori, so there's no binary asset to maintain and it stays
// crisp at the 1200×630 spec. Twitter falls back to this via og:image.
export const alt = "PRD Maker — collaborative PRDs with a built-in AI assistant";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori has no access to the app's CSS tokens, so colors are inlined here to
// match the design system (indigo brand #5333D8, neutral-950 background).
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          backgroundColor: "#0A0A0A",
          backgroundImage:
            "radial-gradient(900px 500px at 15% -10%, rgba(83,51,216,0.45), transparent)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 72,
              height: 72,
              borderRadius: 18,
              backgroundColor: "#5333D8",
              color: "#FFFFFF",
              fontSize: 44,
              fontWeight: 700,
            }}
          >
            P
          </div>
          <div style={{ color: "#FAFAFA", fontSize: 34, fontWeight: 600 }}>
            PRD Maker
          </div>
        </div>

        <div
          style={{
            color: "#FAFAFA",
            fontSize: 66,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: -2,
            maxWidth: 920,
          }}
        >
          Where product teams write PRDs together.
        </div>

        <div style={{ color: "#A1A1AA", fontSize: 27, fontWeight: 400 }}>
          Real-time editor · Version history · Bring your own AI key
        </div>
      </div>
    ),
    { ...size },
  );
}
