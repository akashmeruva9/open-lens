import type { Context, Next } from "hono";

// AUTH_MODE=firebase verifies Firebase ID tokens (studio editors); AUTH_MODE=dev accepts x-dev-user (local only).
const MODE = process.env.AUTH_MODE ?? (process.env.K_SERVICE ? "firebase" : "dev");
const EDITORS = new Set((process.env.EDITOR_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

export async function requireEditor(c: Context, next: Next) {
  if (MODE === "dev") {
    c.set("user" as never, (c.req.header("x-dev-user") ?? "editor@dev") as never);
    return next();
  }
  const token = c.req.header("authorization")?.replace(/^Bearer /, "");
  if (!token) return c.json({ error: "missing bearer token" }, 401);
  try {
    const { getAuth } = await import("firebase-admin/auth");
    const decoded = await getAuth().verifyIdToken(token);
    const email = (decoded.email ?? "").toLowerCase();
    if (decoded.role !== "editor" && !EDITORS.has(email)) return c.json({ error: "editor role required" }, 403);
    c.set("user" as never, (email || decoded.uid) as never);
    return next();
  } catch {
    return c.json({ error: "invalid token" }, 401);
  }
}

export const authMode = MODE;
