import { AppShell } from "@/components/app-shell/app-shell";
import { countPendingSuggestions } from "@/lib/agent/features";
import { getPageTree } from "@/lib/pages";
import {
  listUserWorkspaces,
  requireUser,
  requireWorkspace,
} from "@/lib/workspace";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceLayout({ children, params }: LayoutProps) {
  const { workspaceSlug } = await params;
  const { workspace } = await requireWorkspace(workspaceSlug);
  const user = await requireUser();

  const [initialTree, allWorkspaces, suggestionCount] = await Promise.all([
    getPageTree(workspace.id),
    listUserWorkspaces(user.id),
    countPendingSuggestions(workspace.id),
  ]);

  const workspacesSummary = allWorkspaces.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role,
  }));

  return (
    <AppShell
      workspace={workspace}
      workspaces={workspacesSummary}
      initialTree={initialTree}
      user={{ email: user.email, name: user.name ?? null }}
      suggestionCount={suggestionCount}
    >
      {children}
    </AppShell>
  );
}
