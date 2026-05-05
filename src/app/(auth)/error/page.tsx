import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Sign-in error — PRDMaker",
};

const ERROR_MESSAGES: Record<string, string> = {
  Configuration:
    "There is a problem with the server configuration. Check the server logs.",
  AccessDenied: "You don't have permission to sign in.",
  Verification: "The sign-in link is no longer valid. It may have expired or already been used.",
  Default: "An unexpected error occurred while signing in.",
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AuthErrorPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const code = params.error ?? "Default";
  const message = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.Default;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in error</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href="/sign-in">Try again</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
