import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone output bundles only the files needed to run the server,
  // which keeps the docker image small and the runtime layer simple.
  output: "standalone",
};

export default nextConfig;
