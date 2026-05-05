import type { Role } from "@prisma/client";

/** Page tree node as served to the client (sidebar/page tree). */
export interface PageTreeNode {
  id: string;
  parentId: string | null;
  title: string;
  position: number;
  isPublished: boolean;
  archivedAt: string | null;
  hasChildren: boolean;
  children: PageTreeNode[];
}

/** Comment anchor in the ProseMirror doc. Null = page-level comment. */
export interface CommentAnchor {
  from: number;
  to: number;
}

/** Workspace summary for the workspace switcher. */
export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

/** Member listing as served to settings/members. */
export interface MemberSummary {
  id: string;
  role: Role;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}
