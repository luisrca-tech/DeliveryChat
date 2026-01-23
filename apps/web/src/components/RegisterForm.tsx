import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { Label } from "@repo/ui/components/ui/label";
import { Input } from "@repo/ui/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { registrationSchema, type RegistrationFormData } from "@repo/types";
import { registerUser } from "../lib/registration";
import { getAdminUrl } from "../lib/urls";
import { env } from "../env";

export default function RegisterForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      companyName: "",
      subdomain: "",
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const passwordsMatch =
    password && confirmPassword && password === confirmPassword;

  const handleSubdomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setValue("subdomain", formatted, { shouldValidate: true });
  };

  const onSubmit = async (data: RegistrationFormData) => {
    const result = await registerUser(data);

    if (!result.success) {
      toast.error("Registration Failed", {
        description:
          result.error ||
          "An error occurred while creating your account. Please try again.",
      });
      return;
    }

    if (result.status === "PENDING_VERIFICATION_EXISTS") {
      const params = new URLSearchParams({ email: data.email });
      window.location.href = `/verify-email?${params.toString()}`;
      return;
    }

    if (result.status === "OTP_SENT") {
      toast.success("Verification Code Sent!", {
        description: "Please check your email for the verification code.",
      });
      const params = new URLSearchParams({ email: data.email });
      window.location.href = `/verify-email?${params.toString()}`;
      return;
    }

    toast.success("Account Created Successfully!", {
      description: "Welcome to Delivery Chat. Redirecting to your dashboard...",
    });

    const adminUrl = getAdminUrl(data.subdomain);
    setTimeout(() => {
      window.location.href = `${adminUrl}/onboarding/plans`;
    }, 1500);
  };

  const isFormValid =
    Object.keys(errors).length === 0 &&
    watch("companyName") &&
    watch("subdomain") &&
    watch("fullName") &&
    watch("email") &&
    watch("password") &&
    watch("confirmPassword");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="w-full max-w-2xl space-y-8 animate-fade-in-up">
          <div className="text-center space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold">
              Create Your{" "}
              <span className="bg-linear-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                Account
              </span>
            </h1>
            <p className="text-muted-foreground">
              Start delivering exceptional customer support in minutes
            </p>
          </div>

          <Card className="border-border/50 shadow-soft">
            <CardHeader>
              <CardTitle>Registration Details</CardTitle>
              <CardDescription>
                Fill in your company and account information below
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit(onSubmit)(e);
                }}
                method="post"
                className="space-y-6"
                autoComplete="off"
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-border">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h3 className="font-semibold">Company Information</h3>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyName">
                      Company Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="companyName"
                      placeholder="e.g., Acme Inc."
                      {...register("companyName")}
                      className={errors.companyName ? "border-destructive" : ""}
                    />
                    {errors.companyName && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.companyName.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subdomain">
                      Subdomain <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="subdomain"
                        placeholder="your-company"
                        {...register("subdomain")}
                        onChange={handleSubdomainChange}
                        className={errors.subdomain ? "border-destructive" : ""}
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {env.PUBLIC_TENANT_DOMAIN
                          ? `.${env.PUBLIC_TENANT_DOMAIN}`
                          : ".your-domain.com"}
                      </span>
                    </div>
                    {errors.subdomain ? (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.subdomain.message}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        This will be your unique identifier
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-border">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h3 className="font-semibold">Admin User Information</h3>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fullName">
                      Your Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="fullName"
                      placeholder="John Doe"
                      {...register("fullName")}
                      className={errors.fullName ? "border-destructive" : ""}
                    />
                    {errors.fullName && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.fullName.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@company.com"
                      {...register("email")}
                      className={errors.email ? "border-destructive" : ""}
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">
                      Password <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        {...register("password")}
                        className={
                          errors.password ? "border-destructive pr-10" : "pr-10"
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">
                      Confirm Password{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        {...register("confirmPassword")}
                        className={
                          errors.confirmPassword
                            ? "border-destructive pr-10"
                            : "pr-10"
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        aria-label={
                          showConfirmPassword
                            ? "Hide confirm password"
                            : "Show confirm password"
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.confirmPassword.message}
                      </p>
                    )}
                    {passwordsMatch && !errors.confirmPassword && (
                      <p className="text-sm text-primary flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Passwords match
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-hero transition-all duration-300 py-2 cursor-pointer bg-white text-primary hover:text-white border-primary border"
                  disabled={!isFormValid || isSubmitting}
                  size="lg"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>14-day free trial</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>Cancel anytime</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
