import { db } from "@/lib/db";
import Tabs from "./Tabs";

const TABS = [
  ["", "Overview"],
  ["accounts", "Accounts"],
  ["courses", "Courses"],
  ["audit", "Activity log"],
];

/**
 * The approval-queue count travels with the bar itself, so every admin page
 * shows the same queue number without each one repeating the query.
 */
export default async function AdminTabs({ active = "" }) {
  const pending = Number(
    (await db.prepare("SELECT COUNT(*) c FROM users WHERE role IN ('student','teacher') AND status = 'pending' AND email_verified = 1").get()).c
  );
  return <Tabs
    active={`/admin${active ? `/${active}` : ""}`}
    tabs={TABS.map(([seg, label]) => ({
      href: `/admin${seg ? `/${seg}` : ""}`,
      label,
      badge: seg === "" ? pending : undefined,
    }))}
  />;
}
