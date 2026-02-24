import { useId } from "react"
import { cn } from "@/lib/utils"

type BrandMarkProps = {
  className?: string
  decorative?: boolean
  title?: string
}

type BrandLockupProps = {
  className?: string
  markClassName?: string
  nameClassName?: string
  subtitleClassName?: string
  showSubtitle?: boolean
}

export function BrandMark({ className, decorative = true, title = "CLA Bot" }: BrandMarkProps) {
  const id = useId()
  const bgGradientId = `${id}-bg`
  const paperGradientId = `${id}-paper`
  const accentGradientId = `${id}-accent`

  return (
    <svg
      viewBox="0 0 72 72"
      className={cn("drop-shadow-[0_8px_18px_hsl(163_69%_47%_/_0.24)]", className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative}
      aria-label={decorative ? undefined : title}
    >
      <defs>
        <linearGradient
          id={bgGradientId}
          x1="9"
          y1="9"
          x2="63"
          y2="63"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0A2B30" />
          <stop offset="0.58" stopColor="#08373A" />
          <stop offset="1" stopColor="#10423D" />
        </linearGradient>
        <linearGradient
          id={paperGradientId}
          x1="18"
          y1="14"
          x2="54"
          y2="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E9FDF8" />
          <stop offset="1" stopColor="#B6F3E1" />
        </linearGradient>
        <linearGradient
          id={accentGradientId}
          x1="24"
          y1="18"
          x2="48"
          y2="52"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#5EEAD4" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>

      <rect x="4" y="4" width="64" height="64" rx="17" fill={`url(#${bgGradientId})`} />
      <rect
        x="4.9"
        y="4.9"
        width="62.2"
        height="62.2"
        rx="16.1"
        fill="none"
        stroke="rgba(255, 255, 255, 0.22)"
      />
      <path d="M12 13C22 10 40 7 60 14V22C40 15 22 18 12 22V13Z" fill="rgba(255,255,255,0.14)" />

      <path
        d="M22 14H41L54 27V52C54 55.314 51.314 58 48 58H22C18.686 58 16 55.314 16 52V20C16 16.686 18.686 14 22 14Z"
        fill={`url(#${paperGradientId})`}
      />
      <path d="M41 14V22C41 24.761 43.239 27 46 27H54L41 14Z" fill="rgba(10, 43, 48, 0.2)" />
      <path
        d="M41 14V22C41 24.761 43.239 27 46 27H54"
        fill="none"
        stroke="rgba(10, 43, 48, 0.3)"
        strokeWidth="1.5"
      />
      <path d="M24 29H43" stroke="rgba(10, 43, 48, 0.45)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 35H40" stroke="rgba(10, 43, 48, 0.35)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 41H36" stroke="rgba(10, 43, 48, 0.3)" strokeWidth="2.5" strokeLinecap="round" />

      <path
        d="M26 47.5L32.7 54L45.5 39.5"
        fill="none"
        stroke={`url(#${accentGradientId})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BrandLockup({
  className,
  markClassName,
  nameClassName,
  subtitleClassName,
  showSubtitle = true,
}: BrandLockupProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className={cn("h-8 w-8", markClassName)} />
      <span className="flex flex-col leading-none">
        <span className={cn("font-display text-lg tracking-tight text-foreground", nameClassName)}>
          CLA Bot
        </span>
        {showSubtitle ? (
          <span className={cn("text-[11px] text-muted-foreground", subtitleClassName)}>
            by fiveonefour
          </span>
        ) : null}
      </span>
    </div>
  )
}
