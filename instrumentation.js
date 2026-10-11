// Runs when the Next.js server boots: creates the admin account from env vars (Node runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const nodeRequire = eval("require");
    nodeRequire(process.cwd() + "/lib/seed-once.cjs").startAdminBootstrap();
  } catch (e) {
    console.error("Admin bootstrap unavailable:", e.message);
  }
}
