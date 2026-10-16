import crypto from "crypto";
import { db } from "./db";

// Unambiguous alphabet (no 0/O/1/I/L)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function prefixFor(name) {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  return (letters.slice(0, 2) || "CR").padEnd(2, "X");
}

/** Generates a unique code like PY-7K4M9 using a CSPRNG. */
export async function generateCourseCode(courseName) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.randomBytes(5);
    let suffix = "";
    for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
    const code = `${prefixFor(courseName)}-${suffix}`;
    const taken = await db.prepare("SELECT 1 FROM course_codes WHERE code = ?").get(code);
    if (!taken) return code;
  }
  throw new Error("Could not generate a unique course code");
}

export const normalizeCode = (raw) => String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
