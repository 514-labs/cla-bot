import { ImageResponse } from "next/og"

export const size = {
  width: 180,
  height: 180,
}

export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        borderRadius: 40,
        alignItems: "center",
        justifyContent: "center",
        fontSize: 110,
        fontWeight: 700,
        background: "linear-gradient(135deg, #1fbf95, #45e1b8)",
        color: "#041018",
        fontFamily: "Arial",
      }}
    >
      C
    </div>,
    {
      ...size,
    }
  )
}
