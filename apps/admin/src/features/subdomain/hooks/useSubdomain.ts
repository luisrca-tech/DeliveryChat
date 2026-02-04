import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { subdomainSchema } from "../schemas/subdomain";
import type { SubdomainFormData } from "../types/subdomain";
import { checkTenantExists } from "../lib/subdomain.client";

export function useSubdomain() {
  const [isValidating, setIsValidating] = useState(false);
  const [tenantExists, setTenantExists] = useState<boolean | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const form = useForm<SubdomainFormData>({
    resolver: zodResolver(subdomainSchema),
    defaultValues: { subdomain: "" },
    mode: "onChange",
  });

  const { setValue, setError, clearErrors, formState } = form;

  const validateTenant = async (subdomain: string) => {
    if (!subdomain) {
      setTenantExists(null);
      return;
    }

    const result = subdomainSchema.safeParse({ subdomain });
    if (!result.success) {
      setTenantExists(null);
      return;
    }

    setIsValidating(true);
    const exists = await checkTenantExists(subdomain);
    setTenantExists(exists);
    setIsValidating(false);

    if (!exists) {
      setError("subdomain", {
        type: "manual",
        message: "Tenant not found. Please check the subdomain and try again.",
      });
    } else {
      clearErrors("subdomain");
    }
  };

  const handleSubdomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setValue("subdomain", formatted, { shouldValidate: true });
    setTenantExists(null);

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      void validateTenant(formatted);
    }, 500);
  };

  const onSubmit = (data: SubdomainFormData) => {
    if (!tenantExists) return;

    const currentHost = window.location.host;
    const protocol = window.location.protocol;
    const port = currentHost.includes(":") ? currentHost.split(":")[1] : "";

    let baseDomain: string;
    if (currentHost.includes("localhost")) {
      baseDomain = `localhost${port ? `:${port}` : ""}`;
    } else {
      const parts = currentHost.split(".");
      baseDomain = parts.slice(-2).join(".");
      if (port) baseDomain += `:${port}`;
    }

    const newUrl = `${protocol}//${data.subdomain}.${baseDomain}${window.location.pathname}${window.location.search}`;
    window.location.href = newUrl;
  };

  const canSubmit =
    tenantExists === true &&
    !formState.errors.subdomain &&
    !formState.isSubmitting &&
    !isValidating;

  return {
    form,
    isValidating,
    tenantExists,
    handleSubdomainChange,
    onSubmit: form.handleSubmit(onSubmit),
    canSubmit,
  };
}
