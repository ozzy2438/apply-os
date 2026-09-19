import { APIFY_NOT_ENABLED } from "./contract";
import type { DiscoveryProvider } from "../types";

/** Extension point only. Not registered in V1. */
export function createApifyProvider(): DiscoveryProvider {
  return {
    id: "apify",
    async discover() {
      throw new Error(APIFY_NOT_ENABLED);
    },
  };
}
