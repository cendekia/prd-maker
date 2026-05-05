import { requireWorkspace } from "@/lib/workspace";

import { SettingsTabs } from "./settings-tabs";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}

export default async function SettingsLayout({ children, params }: LayoutProps) {
  const { workspaceSlug } = await params;
  await requireWorkspace(workspaceSlug);

  const base = `/${workspaceSlug}/settings`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your workspace, members, and pending invites.
      </p>
      <div className="mt-6">
        <SettingsTabs
          tabs={[
            { href: base, label: "General", exact: true },
            { href: `${base}/members`, label: "Members" },
            { href: `${base}/invites`, label: "Invites" },
          ]}
        />
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
