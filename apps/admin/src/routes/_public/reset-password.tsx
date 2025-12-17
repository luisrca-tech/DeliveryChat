import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
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
import {
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Lock,
  KeyRound,
} from "lucide-react";
import { authClient } from "@/lib/authClient";
import { useState } from "react";
import { resetPasswordSchema, resetPasswordSearchSchema } from "@/schemas/auth";
import type {
  ResetPasswordFormData,
  ResetPasswordSearchParams,
} from "@/types/auth";

export const Route = createFileRoute("/_public/reset-password")({
  component: ResetPasswordPage,
  validateSearch: (search: Record<string, unknown>) => {
    return resetPasswordSearchSchema.parse(search);
  },
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const search = useSearch({
    from: "/_public/reset-password",
  }) as ResetPasswordSearchParams;
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const passwordsMatch =
    password && confirmPassword && password === confirmPassword;

  if (!search.token) {
    return (
      <Card className="border-border/50 shadow-xl w-full backdrop-blur-sm bg-card/95">
        <CardHeader className="space-y-3 px-6 pt-8 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertCircle className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-2xl font-bold">
                Invalid Reset Link
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground mt-1">
                This password reset link is invalid or has expired
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-8">
          <Button
            onClick={() => navigate({ to: "/forgot-password" })}
            className="w-full h-12 font-semibold cursor-pointer hover:bg-primary/90 hover:shadow-lg transition-all text-base"
          >
            Request New Reset Link
          </Button>
        </CardContent>
      </Card>
    );
  }

  const onSubmit = async (data: ResetPasswordFormData) => {
    try {
      const result = await authClient.resetPassword({
        token: search.token!,
        newPassword: data.password,
      });

      if (!result.data) {
        throw new Error(result.error?.message || "Failed to reset password");
      }

      toast.success("Password reset successfully!", {
        description: "You can now sign in with your new password.",
      });

      setTimeout(() => {
        navigate({
          to: "/login",
          search: {
            error: undefined,
            message: undefined,
            redirect: undefined,
          },
        });
      }, 2000);
    } catch (error) {
      console.error("Reset password error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "This link may be invalid or expired. Please request a new one.";

      setError("password", { type: "server", message });

      toast.error("Failed to reset password", {
        description: message,
      });
    }
  };

  if (isSubmitSuccessful) {
    return (
      <Card className="border-border/50 shadow-lg w-full">
        <CardHeader className="space-y-1 pb-6">
          <CardTitle className="text-2xl font-bold">
            Password Reset Successful
          </CardTitle>
          <CardDescription className="text-base">
            Your password has been reset successfully
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-2.5 text-primary">
            <CheckCircle2 className="h-5 w-5" />
            <p className="text-sm font-medium">Redirecting to sign in...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-xl w-full backdrop-blur-sm bg-card/95">
      <CardHeader className="space-y-3 px-6 pt-8 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              Enter your new password below
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2.5">
            <Label
              htmlFor="password"
              className="text-sm font-medium flex items-center gap-2"
            >
              <Lock className="w-4 h-4 text-muted-foreground" />
              New Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your new password"
                {...register("password")}
                className={`h-12 pr-12 ${
                  errors.password
                    ? "border-destructive focus-visible:ring-destructive/20"
                    : ""
                }`}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors cursor-pointer disabled:cursor-not-allowed p-1 rounded-md hover:bg-muted/50"
                disabled={isSubmitting}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive flex items-center gap-1.5 mt-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2.5">
            <Label
              htmlFor="confirmPassword"
              className="text-sm font-medium flex items-center gap-2"
            >
              <Lock className="w-4 h-4 text-muted-foreground" />
              Confirm Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your new password"
                {...register("confirmPassword")}
                className={`h-12 pr-12 ${
                  errors.confirmPassword
                    ? "border-destructive focus-visible:ring-destructive/20"
                    : ""
                }`}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors cursor-pointer disabled:cursor-not-allowed p-1 rounded-md hover:bg-muted/50"
                disabled={isSubmitting}
                aria-label={
                  showConfirmPassword ? "Hide password" : "Show password"
                }
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-destructive flex items-center gap-1.5 mt-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {errors.confirmPassword.message}
              </p>
            )}
            {passwordsMatch && !errors.confirmPassword && (
              <p className="text-sm text-primary flex items-center gap-1.5 mt-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Passwords match
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-12 font-semibold cursor-pointer hover:bg-primary/90 hover:shadow-lg transition-all text-base"
            disabled={isSubmitting}
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              "Reset Password"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
