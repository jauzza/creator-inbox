import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'" +
      (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") +
      "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
];

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "pg", "@electric-sql/pglite"],
  // Pages consolidated in the redesign: Home / Inbox / Customers / Settings. Old links keep working.
  async redirects() {
    return [
      { source: "/handoffs", destination: "/inbox?filter=needs_you", permanent: false },
      { source: "/automation", destination: "/settings/automation", permanent: false },
      { source: "/style", destination: "/settings/ai", permanent: false },
      { source: "/integrations", destination: "/settings/accounts", permanent: false },
      { source: "/analytics", destination: "/insights", permanent: false },
      { source: "/simulator", destination: "/settings/advanced?tab=demo", permanent: false },
      { source: "/activity", destination: "/settings/advanced", permanent: false },
      { source: "/help", destination: "/settings/preferences", permanent: false },
      { source: "/customers", destination: "/inbox", permanent: false },
      { source: "/setup", destination: "/settings/accounts", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
