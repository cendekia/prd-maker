import type { Metadata } from "next";

import { LegalList, LegalSection, LegalShell } from "@/components/marketing/legal";

const TITLE = "Terms of Service · PRD Maker";
const DESCRIPTION =
  "The terms that govern your use of PRD Maker, including accounts, content ownership, bring-your-own AI keys, billing, and plan limits.";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/terms" },
  twitter: { title: TITLE, description: DESCRIPTION },
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="June 2, 2026"
      intro="These terms are an agreement between you and PRD Maker governing your access to and use of our website and application. By creating an account or using the service, you agree to these terms."
    >
      <LegalSection heading="The service">
        <p>
          PRD Maker is a collaborative editor for product requirements
          documents, featuring real-time multiplayer editing, version history,
          comments, templates, publishing, and an AI assistant. We may update,
          improve, or change features over time.
        </p>
      </LegalSection>

      <LegalSection heading="Accounts and eligibility">
        <p>
          You must provide accurate information and are responsible for activity
          under your account. You must be at least 16 years old to use PRD
          Maker. Keep your sign-in method secure and notify us of any
          unauthorized use.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to:</p>
        <LegalList
          items={[
            "Use the service for unlawful, harmful, or abusive purposes.",
            "Upload content that infringes others' rights or violates applicable law.",
            "Attempt to disrupt, reverse engineer, or gain unauthorized access to the service.",
            "Resell or provide the service to third parties except as permitted by your plan.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          You retain all rights to the content you create in PRD Maker. You grant
          us a limited license to host, store, process, and display your content
          solely to provide and improve the service for you and the people you
          share it with. You are responsible for the content you create and
          publish.
        </p>
      </LegalSection>

      <LegalSection heading="AI features and third-party services">
        <p>
          The AI assistant uses an Anthropic API key that you provide. You are
          responsible for your key, for complying with Anthropic&apos;s terms,
          and for any usage costs Anthropic charges you. AI output may be
          inaccurate; review it before relying on it. We are not responsible for
          third-party services you connect to PRD Maker.
        </p>
      </LegalSection>

      <LegalSection heading="Plans, billing, and seats">
        <LegalList
          items={[
            "Paid plans are billed per seat, monthly or annually, through our payment processor.",
            "Subscriptions renew automatically until cancelled. You can cancel anytime; access continues until the end of the current billing period.",
            "Adding or removing members adjusts your seat count and may change your charges.",
            "Fees are exclusive of taxes where applicable. We may change prices with reasonable advance notice.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Free plan limits">
        <p>
          The Free plan is subject to usage limits, including caps on members,
          documents, and version-history retention. These limits are described
          on our pricing page and may be enforced within the product.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You may stop using the service and delete your account at any time. We
          may suspend or terminate access if you violate these terms or use the
          service in a way that risks harm to others or to the service. Certain
          provisions survive termination, including content ownership,
          disclaimers, and limitations of liability.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimers">
        <p>
          The service is provided &ldquo;as is&rdquo; without warranties of any
          kind, to the maximum extent permitted by law. We do not warrant that
          the service will be uninterrupted, error-free, or secure.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, PRD Maker will not be liable
          for any indirect, incidental, special, or consequential damages, or
          for lost profits or data. Our total liability for any claim is limited
          to the amount you paid for the service in the twelve months before the
          claim.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          We may update these terms from time to time. When we make material
          changes, we will update the date above and, where appropriate, notify
          you. Continued use of the service after changes take effect means you
          accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms? Email us at{" "}
          <a
            href="mailto:legal@prdmaker.app"
            className="text-link underline-offset-2 hover:underline hover:text-link-hover"
          >
            legal@prdmaker.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
