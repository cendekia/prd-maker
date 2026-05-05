import { Resend } from "resend";

import { env } from "@/env";
import { APP_URL, isDev } from "@/lib/config";

const resendClient = env.RESEND_API_KEY
  ? new Resend(env.RESEND_API_KEY)
  : null;

const DEFAULT_FROM = env.RESEND_FROM ?? "PRDMaker <onboarding@resend.dev>";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendEmail({ to, subject, html, text }: SendEmailParams) {
  if (!resendClient) {
    if (!isDev) {
      throw new Error(
        "Email send attempted but RESEND_API_KEY is not configured.",
      );
    }
    // Dev fallback: log to console so the developer can copy magic links.
    console.log(
      [
        "",
        "──────────────────────────────────────────────────────────────",
        " 📬  RESEND_API_KEY is not set — printing email to console",
        "──────────────────────────────────────────────────────────────",
        ` to:      ${to}`,
        ` from:    ${DEFAULT_FROM}`,
        ` subject: ${subject}`,
        "",
        text,
        "──────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }

  const result = await resendClient.emails.send({
    from: DEFAULT_FROM,
    to,
    subject,
    html,
    text,
  });

  if (result.error) {
    throw new Error(`Failed to send email: ${result.error.message}`);
  }
}

export interface MagicLinkEmail {
  to: string;
  url: string;
  host: string;
}

export async function sendMagicLinkEmail({ to, url, host }: MagicLinkEmail) {
  const subject = `Sign in to ${host}`;
  const text = [
    `Sign in to ${host}`,
    "",
    `Click the link below to sign in. The link expires in 24 hours.`,
    "",
    url,
    "",
    `If you didn't request this, you can safely ignore this email.`,
  ].join("\n");

  const html = magicLinkTemplate({ host, url });

  await sendEmail({ to, subject, html, text });
}

function magicLinkTemplate({ host, url }: { host: string; url: string }) {
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">Sign in to ${host}</h1>
  <p style="line-height: 1.5; margin: 0 0 24px;">Click the button below to sign in. The link expires in 24 hours.</p>
  <p style="margin: 0 0 32px;">
    <a href="${url}" style="display:inline-block; background:#111; color:#fff; padding:10px 16px; border-radius:6px; text-decoration:none; font-weight:500;">Sign in</a>
  </p>
  <p style="font-size: 12px; color: #666; line-height: 1.5; margin: 0 0 8px;">Or paste this URL into your browser:</p>
  <p style="font-size: 12px; color: #666; word-break: break-all; margin: 0 0 24px;">${url}</p>
  <p style="font-size: 12px; color: #999; margin: 0;">If you didn't request this, you can safely ignore this email.</p>
</body></html>`;
}

export interface InviteEmail {
  to: string;
  workspaceName: string;
  inviterName: string;
  acceptUrl: string;
}

export async function sendWorkspaceInviteEmail({
  to,
  workspaceName,
  inviterName,
  acceptUrl,
}: InviteEmail) {
  const subject = `${inviterName} invited you to ${workspaceName} on PRDMaker`;
  const text = [
    `${inviterName} invited you to join "${workspaceName}" on PRDMaker.`,
    "",
    `Accept the invite:`,
    acceptUrl,
    "",
    `This invite expires in 7 days. If you don't recognize the sender, you can ignore this email.`,
  ].join("\n");

  const html = inviteTemplate({
    workspaceName,
    inviterName,
    acceptUrl,
    appHost: new URL(APP_URL).host,
  });

  await sendEmail({ to, subject, html, text });
}

function inviteTemplate({
  workspaceName,
  inviterName,
  acceptUrl,
  appHost,
}: {
  workspaceName: string;
  inviterName: string;
  acceptUrl: string;
  appHost: string;
}) {
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">You've been invited to ${escapeHtml(workspaceName)}</h1>
  <p style="line-height: 1.5; margin: 0 0 24px;">${escapeHtml(inviterName)} invited you to collaborate in <strong>${escapeHtml(workspaceName)}</strong> on ${appHost}.</p>
  <p style="margin: 0 0 32px;">
    <a href="${acceptUrl}" style="display:inline-block; background:#111; color:#fff; padding:10px 16px; border-radius:6px; text-decoration:none; font-weight:500;">Accept invite</a>
  </p>
  <p style="font-size: 12px; color: #666; line-height: 1.5; margin: 0 0 8px;">Or paste this URL into your browser:</p>
  <p style="font-size: 12px; color: #666; word-break: break-all; margin: 0 0 24px;">${acceptUrl}</p>
  <p style="font-size: 12px; color: #999; margin: 0;">This invite expires in 7 days.</p>
</body></html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
