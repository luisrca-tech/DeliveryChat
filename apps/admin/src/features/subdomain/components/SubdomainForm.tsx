import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

import { Input } from "@repo/ui/components/ui/input";
import { Button } from "@repo/ui/components/ui/button";
import { Label } from "@repo/ui/components/ui/label";
import { useSubdomain } from "../hooks/useSubdomain";

export function SubdomainForm() {
  const {
    form,
    isValidating,
    tenantExists,
    handleSubdomainChange,
    onSubmit,
    canSubmit,
  } = useSubdomain();

  const { register, formState } = form;
  const { errors, isSubmitting } = formState;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">Subdomain Required</h1>
            <p className="text-sm text-muted-foreground">
              Enter your tenant subdomain to continue
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subdomain">
                Subdomain <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="subdomain"
                  type="text"
                  placeholder="tenant"
                  {...register("subdomain")}
                  onChange={handleSubdomainChange}
                  disabled={isSubmitting}
                  className={
                    errors.subdomain
                      ? "border-destructive pr-10"
                      : tenantExists === true
                        ? "border-primary pr-10"
                        : "pr-10"
                  }
                />
                {isValidating && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {!isValidating &&
                  tenantExists === true &&
                  !errors.subdomain && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                  )}
                {!isValidating && tenantExists === false && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                )}
              </div>
              {errors.subdomain ? (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.subdomain.message}
                </p>
              ) : tenantExists === true ? (
                <p className="text-sm text-primary flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Tenant found
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Example: tenant.localhost:3000
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {isSubmitting ? "Redirecting..." : "Continue"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
