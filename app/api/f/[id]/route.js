import fs from "fs";
import { getUser } from "@/lib/auth";
import { getFile, uploadPath, canAccessFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const user = getUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const row = getFile(Number(params.id));
  if (!row || !canAccessFile(user, row)) return new Response("Not found", { status: 404 });
  const p = uploadPath(row.stored_name);
  if (!fs.existsSync(p)) return new Response("File missing", { status: 410 });
  const buf = fs.readFileSync(p);
  return new Response(buf, {
    headers: {
      "content-type": row.mime || "application/octet-stream",
      "content-disposition": `inline; filename="${row.original_name.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=60",
    },
  });
}
