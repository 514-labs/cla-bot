import { ImageResponse } from "next/og"

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = "image/png"

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        background: "linear-gradient(135deg, #05242f 0%, #0a1622 55%, #07111a 100%)",
        color: "#f2f8f8",
        fontFamily: "Arial",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 15% 20%, rgba(31,191,149,0.32), transparent 42%), radial-gradient(circle at 90% 5%, rgba(118,214,255,0.24), transparent 45%)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 20,
          padding: "56px 72px",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderRadius: 999,
            border: "1px solid rgba(31,191,149,0.45)",
            padding: "8px 14px",
            fontSize: 24,
            color: "#8ee9cc",
          }}
        >
          CLA Bot by fiveonefour
        </div>

        <div style={{ fontSize: 72, lineHeight: 1.02, fontWeight: 700, maxWidth: 940 }}>
          Automated Contributor License Agreements for GitHub
        </div>

        <div style={{ fontSize: 30, color: "rgba(233,247,246,0.8)", maxWidth: 900 }}>
          Install, publish, enforce, and re-sign with versioned legal evidence.
        </div>
      </div>
    </div>,
    {
      ...size,
    }
  )
}
