import { defineConfig } from "@neon/config/v1";

// The private request-files bucket already exists on the goodnote project.
// `auth: true` only records that Neon Auth is still enabled on the branch.
// The app does not use Neon Auth to sign in. Do not run `neon deploy` just
// to change login. This file does not enable the Data API or the AI Gateway.
// Apply it with `neon deploy` only when you intend to reconcile the linked
// branch; that command also pulls secrets into a local env file.
export default defineConfig({
  auth: true,
  buckets: {
    "request-files": {
      access: "private",
    },
  },
});
