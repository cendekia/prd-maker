import { Role } from "@prisma/client";

import { requireWorkspace } from "@/lib/workspace";

import { SettingsTabs } from "./settings-tabs";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}

export default async function SettingsLayout({ children, params }: LayoutProps) {
  const { workspaceSlug } = await params;
  const { member } = await requireWorkspace(workspaceSlug);

  const base = `/${workspaceSlug}/settings`;
  const tabs: { href: string; label: string; exact?: boolean }[] = [
    { href: base, label: "General", exact: true },
    { href: `${base}/members`, label: "Members" },
    { href: `${base}/invites`, label: "Invites" },
    { href: `${base}/stacks`, label: "Stacks" },
  ];
  if (member.role === Role.OWNER) {
    tabs.push({ href: `${base}/templates`, label: "Templates" });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <span className="t-label">Settings</span>
      <h1 className="t-h2 mt-2">Workspace</h1>
      <p className="mt-1 text-[13px] text-fg-3">
        Manage your workspace, members, and pending invites.
      </p>
      <div className="mt-6">
        <SettingsTabs tabs={tabs} />
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
