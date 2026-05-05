import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link
        href="/"
        className="mb-8 text-lg font-semibold tracking-tight text-foreground"
      >
        PRDMaker
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 text-xs text-muted-foreground">
        By continuing you agree to the{" "}
        <Link href="/terms" className="underline-offset-4 hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
