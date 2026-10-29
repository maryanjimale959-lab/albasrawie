/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    // The data layer talks to MySQL over plain TCP and keeps a pool on the Node
    // process; bundling it through webpack breaks the driver, so both database
    // packages stay external to the server bundle. better-sqlite3 is only used by
    // the one-off import script that moves an existing install onto MySQL.
    serverComponentsExternalPackages: ["mysql2", "better-sqlite3", "nodemailer"],
    instrumentationHook: true,
    // Uploads go through server actions; the app allows 20 MB files, so lift Next's 1 MB default.
    serverActions: { bodySizeLimit: "25mb" },
  },
};
