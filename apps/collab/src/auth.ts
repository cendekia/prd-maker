import jwt from "jsonwebtoken";

export type Role = "OWNER" | "EDITOR" | "VIEWER";

export interface CollabClaims {
  pageId: string;
  userId: string;
  role: Role;
  name: string;
  color: string;
}

/**
 * Verify a collab JWT issued by the Next.js app at /api/collab/token.
 * Throws if the token is invalid, expired, or has the wrong shape.
 */
export function verifyCollabToken(token: string, secret: string): CollabClaims {
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Token payload is not an object");
  }
  const { pageId, userId, role, name, color } = decoded as Record<string, unknown>;
  if (typeof pageId !== "string" || pageId.length === 0) {
    throw new Error("Token missing pageId");
  }
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("Token missing userId");
  }
  if (role !== "OWNER" && role !== "EDITOR" && role !== "VIEWER") {
    throw new Error("Token has invalid role");
  }
  return {
    pageId,
    userId,
    role,
    name: typeof name === "string" ? name : "Anonymous",
    color: typeof color === "string" ? color : "#888888",
  };
}
