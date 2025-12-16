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
import { authClient } from "../lib/authClient";

export default function RegisterForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
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
    setIsLoading(true);

    try {
      const signUpResult = await authClient.signUp.email({
        email: data.email,
        password: data.password,
        name: data.fullName,
      });

      if (!signUpResult.data) {
        throw new Error(
          signUpResult.error?.message || "Failed to create account"
        );
      }

      const orgResult = await authClient.organization.create({
        name: data.companyName,
        slug: data.subdomain,
      });

      if (!orgResult.data) {
        throw new Error(
          orgResult.error?.message || "Failed to create organization"
        );
      }

      toast.success("Account Created Successfully!", {
        description:
          "Welcome to Delivery Chat. Redirecting to your dashboard...",
      });

      const isDevelopment = window.location.hostname === "localhost";
      const adminUrl = isDevelopment
        ? `http://${data.subdomain}.localhost:3000`
        : `https://${data.subdomain}.deliverychat.com`;

      setTimeout(() => {
        window.location.href = adminUrl;
      }, 1500);
    } catch (error) {
      console.error("Registration error:", error);
      toast.error("Registration Failed", {
        description:
          error instanceof Error
            ? error.message
            : "An error occurred while creating your account. Please try again.",
      });
      setIsLoading(false);
    }
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
          {/* Header */}
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

          {/* Form Card */}
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
                {/* Company Information */}
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
                        .deliverychat.com
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

                {/* Admin User Information */}
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="w-full bg-gradient-hero transition-all duration-300 py-2 cursor-pointer bg-white text-primary hover:text-white border-primary border"
                  disabled={!isFormValid || isLoading}
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>

                {/* Sign in link */}
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <a
                    href="/"
                    className="text-primary hover:underline font-medium"
                  >
                    Sign in
                  </a>
                </p>
              </form>
            </CardContent>
          </Card>

          {/* Trust indicators */}
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
