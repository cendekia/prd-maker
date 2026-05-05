import { requireUser } from "@/lib/workspace";

/**
 * The (authed) layout is the placeholder app shell. It only ensures a session
 * exists; per-workspace authorization happens in [workspaceSlug]/layout.
 * Step 9 replaces this with the three-pane shell.
 */
export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}
