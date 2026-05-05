import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { env } from "@/env";

import { SignInForm } from "./sign-in-form";

export const metadata = {
  title: "Sign in — PRDMaker",
};

interface PageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const googleEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const emailEnabled = !!env.RESEND_API_KEY || env.NODE_ENV === "development";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Use your email or Google account to continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm
          googleEnabled={googleEnabled}
          emailEnabled={emailEnabled}
          callbackUrl={params.callbackUrl}
        />
      </CardContent>
    </Card>
  );
}
