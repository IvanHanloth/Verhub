import * as React from "react"
import Image from "next/image"

import { cn } from "@workspace/ui/lib/utils"

type ThemeLogoProps = {
  className?: string
  imgClassName?: string
  alt?: string
}

export function ThemeLogo({
  className,
  imgClassName = "h-8 w-auto",
  alt = "Verhub Logo",
}: ThemeLogoProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src="/logo-light-500.png"
        alt={alt}
        width={500}
        height={500}
        className={cn("dark:hidden", imgClassName)}
      />
      <Image
        src="/logo-dark-500.png"
        alt={alt}
        width={500}
        height={500}
        className={cn("hidden dark:block", imgClassName)}
      />
    </span>
  )
}
