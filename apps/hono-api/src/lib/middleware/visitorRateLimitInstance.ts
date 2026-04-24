import { createVisitorWsRateLimiter } from "./visitorRateLimit.js";
import { VISITOR_RATE_LIMITS } from "../planLimits.js";

export const sharedVisitorRateLimiter =
  createVisitorWsRateLimiter(VISITOR_RATE_LIMITS);
