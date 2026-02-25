export function AppBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[hsl(var(--background))]"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 1024"
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
      >
        <defs>
          <radialGradient id="glow-a" cx="20%" cy="16%" r="56%">
            <stop offset="0%" stopColor="hsl(163 69% 47% / 0.24)" />
            <stop offset="100%" stopColor="hsl(163 69% 47% / 0)" />
          </radialGradient>
          <radialGradient id="glow-b" cx="82%" cy="10%" r="52%">
            <stop offset="0%" stopColor="hsl(195 86% 65% / 0.2)" />
            <stop offset="100%" stopColor="hsl(195 86% 65% / 0)" />
          </radialGradient>
          <radialGradient id="glow-c" cx="48%" cy="100%" r="60%">
            <stop offset="0%" stopColor="hsl(42 95% 62% / 0.12)" />
            <stop offset="100%" stopColor="hsl(42 95% 62% / 0)" />
          </radialGradient>
          <linearGradient id="trust-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(163 69% 47% / 0)" />
            <stop offset="25%" stopColor="hsl(163 69% 47% / 0.55)" />
            <stop offset="70%" stopColor="hsl(195 86% 65% / 0.45)" />
            <stop offset="100%" stopColor="hsl(195 86% 65% / 0)" />
          </linearGradient>
          <filter id="soft-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <mask id="edge-fade">
            <rect width="1440" height="1024" fill="white" />
            <radialGradient id="fade-core" cx="50%" cy="44%" r="60%">
              <stop offset="65%" stopColor="white" />
              <stop offset="100%" stopColor="black" />
            </radialGradient>
            <rect width="1440" height="1024" fill="url(#fade-core)" />
          </mask>
        </defs>

        <rect width="1440" height="1024" fill="url(#glow-a)" />
        <rect width="1440" height="1024" fill="url(#glow-b)" />
        <rect width="1440" height="1024" fill="url(#glow-c)" />

        <g className="app-bg-drift" mask="url(#edge-fade)">
          <g fill="none" stroke="hsl(213 19% 25% / 0.55)" strokeWidth="1">
            <path d="M-120 520 C 210 430, 460 440, 800 530 C 1060 595, 1240 620, 1560 520" />
            <path d="M-120 600 C 180 500, 480 500, 820 600 C 1060 670, 1260 690, 1560 600" />
            <path d="M-120 680 C 240 590, 500 590, 840 680 C 1080 748, 1270 770, 1560 680" />
            <path d="M-100 440 C 250 360, 520 370, 860 450 C 1100 510, 1280 520, 1540 430" />
          </g>

          <g fill="none" stroke="hsl(213 19% 25% / 0.4)" strokeWidth="1">
            <path d="M120 920 C 280 740, 430 640, 650 520 C 840 414, 1060 380, 1350 420" />
            <path d="M40 820 C 250 690, 430 590, 640 500 C 900 385, 1120 360, 1450 410" />
            <path d="M0 760 C 230 640, 430 560, 640 480 C 920 360, 1130 334, 1480 392" />
          </g>

          <g
            className="app-bg-trace"
            fill="none"
            stroke="url(#trust-line)"
            strokeWidth="1.8"
            strokeLinecap="round"
            filter="url(#soft-blur)"
          >
            <path d="M-120 600 C 180 500, 480 500, 820 600 C 1060 670, 1260 690, 1560 600" />
            <path d="M40 820 C 250 690, 430 590, 640 500 C 900 385, 1120 360, 1450 410" />
            <path d="M-100 440 C 250 360, 520 370, 860 450 C 1100 510, 1280 520, 1540 430" />
          </g>
        </g>

        <g fill="none" strokeWidth="1.4">
          <circle
            cx="1160"
            cy="250"
            r="94"
            stroke="hsl(163 69% 47% / 0.22)"
            strokeDasharray="3 8"
            className="app-bg-spin"
          />
          <circle cx="1160" cy="250" r="74" stroke="hsl(195 86% 65% / 0.16)" />
          <circle cx="1160" cy="250" r="52" stroke="hsl(42 95% 62% / 0.2)" />
        </g>

        <g fill="hsl(163 69% 47% / 0.72)" stroke="hsl(212 36% 10% / 0.55)" strokeWidth="2">
          <circle className="app-bg-pulse" cx="384" cy="566" r="4.5" />
          <circle className="app-bg-pulse app-bg-delay-1" cx="610" cy="518" r="4.5" />
          <circle className="app-bg-pulse app-bg-delay-2" cx="812" cy="592" r="4.5" />
          <circle className="app-bg-pulse app-bg-delay-3" cx="1040" cy="652" r="4.5" />
          <circle className="app-bg-pulse app-bg-delay-4" cx="1144" cy="430" r="4.5" />
          <circle className="app-bg-pulse app-bg-delay-2" cx="930" cy="466" r="4.5" />
        </g>
      </svg>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_110%,hsl(163_69%_47%_/_0.05),transparent_52%)]" />
    </div>
  )
}
