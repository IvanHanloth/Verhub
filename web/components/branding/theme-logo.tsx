import * as React from "react"
import Image from "next/image"

import { cn } from "@workspace/ui/lib/utils"

type ThemeLogoProps = {
  className?: string
  imgClassName?: string
  alt?: string
  width?: number
  height?: number
}

export function ThemeLogo({
  className,
  imgClassName = "h-8 w-auto",
  alt = "Verhub Logo",
  width = 500,
  height = 500,
}: ThemeLogoProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image src="/logo-500.png" alt={alt} width={width} height={height} className={imgClassName} />
    </span>
  )
}
