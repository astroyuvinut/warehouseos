import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Emits a self-contained server bundle so the container image stays small
  // and does not need node_modules at runtime.
  output: "standalone",
};

export default nextConfig;
