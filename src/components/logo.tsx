import Image from "next/image";

interface LogoProps {
  variant?: "mark" | "wordmark";
  size?: number;
  className?: string;
}

export function Logo({ variant = "wordmark", size, className }: LogoProps) {
  if (variant === "mark") {
    const px = size ?? 32;
    return (
      <Image
        src="/logo-mark.svg"
        alt="PRD Maker"
        width={px}
        height={px}
        className={className}
        priority
      />
    );
  }
  const height = size ?? 28;
  return (
    <Image
      src="/logo-wordmark.svg"
      alt="PRD Maker"
      width={(220 / 48) * height}
      height={height}
      className={className}
      priority
    />
  );
}
