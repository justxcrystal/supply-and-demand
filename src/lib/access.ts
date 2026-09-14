import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

export type AccessStatus = "none" | "pending" | "approved" | "denied";

export async function requireApproved(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ status: string }>`
    select status from desk_access where user_id = ${userId} limit 1
  `;
  const status = rows[0]?.status;
  if (!status || status === "none") throw new Error("Submit an access ticket first");
  if (status === "pending") throw new Error("Access ticket pending");
  if (status !== "approved") throw new Error("Access denied");
}

export const getAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const mine = await sql<{ status: string; name: string; note: string }>`
      select status, name, note from desk_access where user_id = ${context.userId} limit 1
    `;
    const row = mine[0];
    return {
      status: (row?.status ?? "none") as AccessStatus,
      name: row?.name ?? "",
      note: row?.note ?? "",
      canReview: row?.status === "approved",
    };
  });

export const submitTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => {
    const o = d as { name?: string; note?: string };
    return {
      name: String(o?.name ?? "").trim().slice(0, 80),
      note: String(o?.note ?? "").trim().slice(0, 500),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const existing = await sql<{ status: string }>`
      select status from desk_access where user_id = ${context.userId} limit 1
    `;
    if (existing[0]) return { status: existing[0].status as AccessStatus };
    const owners = await sql<{ n: number }>`
      select count(*)::int as n from desk_access where status = 'approved'
    `;
    const status: AccessStatus = (owners[0]?.n ?? 0) === 0 ? "approved" : "pending";
    const name = data.name || "desk user";
    await sql`
      insert into desk_access (user_id, name, note, status)
      values (${context.userId}, ${name}, ${data.note}, ${status})
    `;
    return { status };
  });

export const listTickets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireApproved(context.userId);
    const sql = await getSql();
    return sql<{ user_id: string; name: string; note: string; status: string; created_at: string }>`
      select user_id, name, note, status, created_at::text
      from desk_access
      order by created_at desc
    `;
  });

export const decideTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => {
    const o = d as { userId?: string; status?: string };
    const status = o?.status === "approved" || o?.status === "denied" ? o.status : null;
    const userId = String(o?.userId ?? "").trim();
    if (!userId || !status) throw new Error("Pick a ticket");
    return { userId, status };
  })
  .handler(async ({ context, data }) => {
    await requireApproved(context.userId);
    const sql = await getSql();
    await sql`
      update desk_access set status = ${data.status} where user_id = ${data.userId}
    `;
    return { ok: true as const };
  });
