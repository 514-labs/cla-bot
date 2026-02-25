import Image from "next/image"
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
  return (
    <Image
      src="/brand/cla-bot-github-app-logo.svg"
      alt={decorative ? "" : title}
      aria-hidden={decorative}
      className={cn("drop-shadow-[0_8px_18px_hsl(165_77%_56%_/_0.26)]", className)}
      width={72}
      height={72}
      unoptimized
    />
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
