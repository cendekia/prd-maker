import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Packages that must be loaded via native Node `require` instead of being
   * bundled into the server build.
   *
   * `@react-pdf/renderer` pulls in `fontkit`/`restructure` and reads its
   * built-in AFM font metrics off disk at runtime. When Next bundles it the
   * PDF export route throws "Cannot find module" / font errors *on Vercel*
   * (it works locally because node_modules is present). Marking it external
   * keeps the package resolvable from node_modules in the serverless bundle.
   */
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
