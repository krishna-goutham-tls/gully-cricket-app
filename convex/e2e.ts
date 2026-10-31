import { internalQuery } from "./_generated/server";

/**
 * Test scripts ask this first. Only Convex dev has E2E_ALLOWED set, so the
 * seed stops on any other deployment.
 */
export const guard = internalQuery({
  args: {},
  handler: async () => {
    if (process.env.E2E_ALLOWED !== "1") {
      throw new Error("Test scripts do not run on this deployment");
    }
    return { allowed: true };
  },
});
