/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    // The data layer talks to MySQL over plain TCP and keeps a pool on the Node
    // process; bundling it through webpack breaks the driver, so both database
    // packages stay external to the server bundle. better-sqlite3 is only used by
    // the one-off import script that moves an existing install onto MySQL.
    serverComponentsExternalPackages: ["mysql2", "better-sqlite3"],
    instrumentationHook: true,
  },
};
