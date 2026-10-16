import { db } from "./db";

export const getMaterial = async (id) => (await db.prepare(`
  SELECT m.*, c.name AS course_name FROM materials m JOIN courses c ON c.id = m.course_id WHERE m.id = ?`).get(id)) || null;

/** All materials of a course, newest first; published-only for students. */
export const courseMaterials = async (courseId, { publishedOnly = false } = {}) => await db.prepare(`
  SELECT m.*, u.full_name AS teacher_name FROM materials m JOIN users u ON u.id = m.teacher_id
  WHERE m.course_id = ? ${publishedOnly ? "AND m.published = 1" : ""}
  ORDER BY (m.module IS NULL) DESC, m.module ASC, m.created_at DESC`).all(courseId);

/** Group material rows into [{ module, items }] keeping query order. */
export function groupByModule(rows) {
  const groups = [];
  const map = new Map();
  for (const m of rows) {
    const key = m.module || "General";
    if (!map.has(key)) { const g = { module: key, items: [] }; map.set(key, g); groups.push(g); }
    map.get(key).items.push(m);
  }
  return groups;
}
