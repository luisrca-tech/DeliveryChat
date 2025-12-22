import { Link } from "@tanstack/react-router";
import { useState } from "react";
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
import { Eye, EyeOff, AlertCircle, Loader2, Mail, Lock } from "lucide-react";
import { useLogin } from "../hooks/useLogin";

interface LoginFormProps {
  redirectPath?: string;
}

export function LoginForm({ redirectPath = "/" }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const { register, onSubmit, formState } = useLogin({ redirectPath });
  const { errors, isSubmitting } = formState;

  return (
    <Card className="border-border/50 shadow-xl w-full backdrop-blur-sm bg-card/95">
      <CardHeader className="space-y-3 px-6 pt-8 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl font-bold">
                Sign in to Delivery Chat
              </CardTitle>
              <div className="p-2 rounded-lg bg-primary/10">
                <Lock className="w-5 h-5 text-primary" />
              </div>
            </div>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              After submission you gonna be redirect to your organization
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(e);
          }}
          method="post"
          className="space-y-6"
          autoComplete="on"
        >
          <div className="space-y-2.5">
            <Label
              htmlFor="email"
              className="text-sm font-medium flex items-center gap-2"
            >
              <Mail className="w-4 h-4 text-muted-foreground" />
              Email Address <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@company.com"
              {...register("email")}
              className={`h-12 ${errors.email ? "border-destructive focus-visible:ring-destructive/20" : ""}`}
              disabled={isSubmitting}
              autoComplete="email"
            />
            {errors.email && (
              <p className="text-sm text-destructive flex items-center gap-1.5 mt-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                {...register("password")}
                className={`h-12 pr-12 ${
                  errors.password
                    ? "border-destructive focus-visible:ring-destructive/20"
                    : ""
                }`}
                disabled={isSubmitting}
                autoComplete="current-password"
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

          <div className="flex items-center justify-end pt-2">
            <Link
              to="/forgot-password"
              className="text-sm text-primary hover:text-primary/80 hover:underline font-medium cursor-pointer transition-colors"
            >
              Forgot password?
            </Link>
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
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
