import { Resend } from "resend";

import { env } from "@/env";
import { APP_URL, isDev } from "@/lib/config";
import type { NotificationData, NotificationType } from "@/lib/notifications";

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

export async function sendNotificationEmail({
  to,
  type,
  payload,
}: {
  to: string;
  type: NotificationType;
  payload: NotificationData;
}) {
  const msg = notificationMessage(type, payload);
  const ctaUrl = buildCtaUrl(payload.url);
  const text = [msg.heading, "", msg.body, "", ctaUrl].join("\n");
  const html = notificationTemplate({
    heading: msg.heading,
    body: msg.body,
    ctaLabel: msg.ctaLabel,
    ctaUrl,
  });
  await sendEmail({ to, subject: msg.subject, html, text });
}

/**
 * Resolve a notification's app-relative `url` to an absolute link, accepting
 * only same-origin http(s) targets. Anything else (off-origin, javascript:,
 * malformed) falls back to the app root — so a crafted payload can never
 * inject a scheme or a different host into the email link.
 */
function buildCtaUrl(path: string | undefined): string {
  if (!path) return APP_URL;
  try {
    const url = new URL(path, APP_URL);
    const base = new URL(APP_URL);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin === base.origin
    ) {
      return url.toString();
    }
  } catch {
    /* malformed — fall through to the safe default */
  }
  return APP_URL;
}

function notificationMessage(type: NotificationType, payload: NotificationData) {
  const actor = payload.actorName ?? "Someone";
  const page = payload.pageTitle ?? "a page";
  switch (type) {
    case "comment.mention":
      return {
        subject: `${actor} mentioned you in ${page}`,
        heading: `${actor} mentioned you`,
        body: `${actor} mentioned you in a comment on “${page}”.`,
        ctaLabel: "View comment",
      };
    case "comment.reply":
      return {
        subject: `${actor} replied in ${page}`,
        heading: `${actor} replied to your comment`,
        body: `${actor} replied to a thread in “${page}”.`,
        ctaLabel: "View thread",
      };
    case "page.share":
      return {
        subject: `${actor} shared “${page}” with you`,
        heading: `${actor} shared a page with you`,
        body: `${actor} gave you access to “${page}”.`,
        ctaLabel: "Open page",
      };
    case "workspace.invite":
      return {
        subject: "You have a new invitation",
        heading: "You've been invited",
        body: "You have a new workspace invitation on PRDMaker.",
        ctaLabel: "View invite",
      };
  }
}

function notificationTemplate({
  heading,
  body,
  ctaLabel,
  ctaUrl,
}: {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}) {
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111;">
  <h1 style="font-size: 18px; margin: 0 0 12px;">${escapeHtml(heading)}</h1>
  <p style="line-height: 1.5; margin: 0 0 24px; color: #333;">${escapeHtml(body)}</p>
  <p style="margin: 0 0 32px;">
    <a href="${escapeHtml(ctaUrl)}" style="display:inline-block; background:#111; color:#fff; padding:10px 16px; border-radius:6px; text-decoration:none; font-weight:500;">${escapeHtml(ctaLabel)}</a>
  </p>
  <p style="font-size: 12px; color: #999; line-height: 1.5; margin: 0;">You're receiving this because of your PRDMaker notification settings. Manage them in your account settings.</p>
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
