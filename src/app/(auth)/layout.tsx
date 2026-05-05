import Link from "next/link";

import { Logo } from "@/components/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-subtle px-4 py-12">
      <Link href="/" className="mb-8" aria-label="PRD Maker">
        <Logo variant="wordmark" size={28} />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 text-[12px] text-fg-3">
        By continuing you agree to the{" "}
        <Link href="/terms" className="text-link underline-offset-2 hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-link underline-offset-2 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
