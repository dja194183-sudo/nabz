import { createServerFn } from "@tanstack/react-start";
import { getSql } from "../db";

function cleanId(raw: unknown) {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 24);
}

export const saveVault = createServerFn({ method: "POST" })
  .validator((input: { id?: string; payload?: string }) => {
    const id = cleanId(input?.id);
    const payload = String(input?.payload ?? "");
    if (id.length < 8) throw new Error("کد بازیابی نامعتبر است");
    if (!payload || payload.length > 400_000) throw new Error("داده زیاد است");
    return { id, payload };
  })
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql.query(
      `insert into nabz_vault (id, payload, updated_at)
       values ($1, $2, now())
       on conflict (id) do update set payload = excluded.payload, updated_at = now()`,
      [data.id, data.payload],
    );
    return { ok: true as const };
  });

export const loadVault = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => {
    const id = cleanId(input?.id);
    if (id.length < 8) throw new Error("کد بازیابی نامعتبر است");
    return { id };
  })
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql.query<{ payload: string }>(
      "select payload from nabz_vault where id = $1",
      [data.id],
    );
    const payload = rows[0]?.payload;
    if (!payload) return { ok: false as const, error: "روی سرور چیزی با این کد نیست" };
    return { ok: true as const, payload };
  });
