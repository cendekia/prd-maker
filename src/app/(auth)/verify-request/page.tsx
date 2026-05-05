import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Check your email — PRDMaker",
};

export default function VerifyRequestPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent you a sign-in link. Click the link in your inbox to continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>The link expires in 24 hours.</p>
        <p>
          Didn&apos;t get an email?{" "}
          <Link
            href="/sign-in"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Try again
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
