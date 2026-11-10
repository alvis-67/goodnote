import { defineConfig } from "@neon/config/v1";

// Auth and the private request-files bucket already exist on the goodnote
// project. This file records that policy. It does not enable the Data API
// or the AI Gateway. Apply it with `neon deploy` only when you intend to
// reconcile the linked branch; that command also pulls secrets into a local
// env file.
export default defineConfig({
  auth: true,
  buckets: {
    "request-files": {
      access: "private",
    },
  },
});
