import type { Metadata } from "next";

import { LegalList, LegalSection, LegalShell } from "@/components/marketing/legal";

const TITLE = "Privacy Policy · PRD Maker";
const DESCRIPTION =
  "How PRD Maker collects, uses, and protects your data — including how your bring-your-own AI key is encrypted and your GDPR rights.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/privacy" },
  twitter: { title: TITLE, description: DESCRIPTION },
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="June 2, 2026"
      intro="This policy explains what information PRD Maker collects, how we use it, and the choices and rights you have. It applies to our website and the PRD Maker application."
    >
      <LegalSection heading="Information we collect">
        <p>We collect only what we need to provide the service:</p>
        <LegalList
          items={[
            <>
              <strong className="font-medium text-fg-1">Account information</strong> —
              your email address (used for magic-link sign-in) and, if you sign
              in with Google, your name and profile photo.
            </>,
            <>
              <strong className="font-medium text-fg-1">Workspace content</strong> —
              the pages, comments, version history, and templates you and your
              team create.
            </>,
            <>
              <strong className="font-medium text-fg-1">Usage &amp; device data</strong> —
              log data such as IP address, browser type, and the actions you
              take, used to operate and secure the service.
            </>,
            <>
              <strong className="font-medium text-fg-1">Billing details</strong> —
              for paid plans, subscription and payment metadata processed by our
              payment provider. We never see or store full card numbers.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Your AI API key">
        <p>
          PRD Maker lets you bring your own Anthropic API key to power the AI
          assistant. We treat this key as highly sensitive:
        </p>
        <LegalList
          items={[
            "It is encrypted at rest using AES-256-GCM with a server-side master key.",
            "It is decrypted only on our server, only to make AI requests on your behalf.",
            "It is never written to logs, never sent back to your browser, and never shared with anyone.",
            "You can rotate or remove your key at any time from your account settings.",
          ]}
        />
        <p>
          Prompts and page context you send to the AI assistant are transmitted
          to Anthropic to generate responses, subject to Anthropic&apos;s terms
          and privacy practices.
        </p>
      </LegalSection>

      <LegalSection heading="How we use information">
        <LegalList
          items={[
            "Provide, maintain, and improve the service.",
            "Authenticate you and keep your account and workspaces secure.",
            "Process payments and manage subscriptions and seats.",
            "Respond to support requests and send essential service notices.",
            "Detect, prevent, and investigate abuse or security incidents.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Sharing and subprocessors">
        <p>
          We do not sell your personal data. We share data only with service
          providers who help us run PRD Maker, under contractual confidentiality
          and data-protection obligations. These include hosting and database
          infrastructure, our transactional email provider, our payment
          processor, and Anthropic for AI requests you initiate.
        </p>
      </LegalSection>

      <LegalSection heading="Data retention">
        <p>
          We retain your information for as long as your account is active or as
          needed to provide the service. When you delete your account, we
          permanently delete your personal data and encrypted API key after a
          short grace period, except where we are legally required to retain
          certain records.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Depending on your location, you may have the right to access, correct,
          export, or delete your personal data, and to object to or restrict
          certain processing. PRD Maker provides self-service tools for the most
          common requests:
        </p>
        <LegalList
          items={[
            "Export a copy of your data, including your workspaces' content, from your account privacy settings.",
            "Delete your account and associated data, with a 14-day cancellation grace period.",
          ]}
        />
        <p>
          To exercise any other right, contact us at{" "}
          <a
            href="mailto:privacy@prdmaker.app"
            className="text-link underline-offset-2 hover:underline hover:text-link-hover"
          >
            privacy@prdmaker.app
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          We use strictly necessary cookies to keep you signed in and to secure
          the service. We do not use third-party advertising or cross-site
          tracking cookies.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          We use industry-standard measures to protect your data, including
          encryption in transit, encryption of sensitive secrets at rest, and
          least-privilege access controls. No system is perfectly secure, but we
          work continuously to protect your information.
        </p>
      </LegalSection>

      <LegalSection heading="International transfers">
        <p>
          Your information may be processed in countries other than your own. We
          rely on appropriate safeguards for such transfers where required by
          applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          PRD Maker is not directed to children under 16, and we do not knowingly
          collect personal data from them.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this policy from time to time. When we make material
          changes, we will update the date above and, where appropriate, notify
          you.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this policy or your data? Email us at{" "}
          <a
            href="mailto:privacy@prdmaker.app"
            className="text-link underline-offset-2 hover:underline hover:text-link-hover"
          >
            privacy@prdmaker.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
