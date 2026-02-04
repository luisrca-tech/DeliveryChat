import type { z } from "zod";
import { subdomainSchema } from "../schemas/subdomain";

export type SubdomainFormData = z.infer<typeof subdomainSchema>;
