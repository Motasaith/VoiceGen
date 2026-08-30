/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep development artifacts separate from production builds. On Windows,
  // reusing one directory across both modes can leave stale compiler state.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

  // These ship native .node binaries or Emscripten bundles whose dynamic
  // requires webpack cannot resolve statically. Keeping them external means
  // Node loads them at runtime instead of trying to bundle them.
  serverExternalPackages: [
    "onnxruntime-node",
    "@huggingface/transformers",
    "phonemizer",
    "espeak-ng",
    "@breezystack/lamejs",
  ],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/onnxruntime-node/bin/**/*"],
  },
};

export default nextConfig;
