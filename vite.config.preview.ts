// Preview-only build config for the Computer app preview (deploy_website).
// The Computer preview serves the bundle from a nested path prefix, so assets
// must be referenced with relative paths ("./assets/...") instead of the
// absolute "/assets/..." paths required for the real production domain
// (Railway) where deep-linking to nested routes needs absolute asset URLs.
// This file is NOT used by the production build/Railway — vite.config.ts
// (base: "/") remains the source of truth for that. Not intended to be
// committed as part of the production build pipeline.
import base from "./vite.config"

export default {
  ...base,
  base: "./",
}
