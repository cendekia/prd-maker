import { handlers } from "@/auth";

export const { GET, POST } = handlers;

// Auth.js needs Node.js (Prisma adapter, Resend SDK).
export const runtime = "nodejs";
