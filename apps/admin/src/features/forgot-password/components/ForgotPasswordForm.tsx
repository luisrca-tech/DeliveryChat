import { Link } from "@tanstack/react-router";
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
  AlertCircle,
  Loader2,
  ArrowLeft,
  Mail,
  CheckCircle2,
} from "lucide-react";
import { useForgotPassword } from "../hooks/useForgotPassword";

export function ForgotPasswordForm() {
  const { register, onSubmit, formState } = useForgotPassword();
  const { errors, isSubmitting, isSubmitSuccessful } = formState;

  if (isSubmitSuccessful) {
    return (
      <Card className="border-border/50 shadow-xl w-full backdrop-blur-sm bg-card/95">
        <CardHeader className="space-y-3 px-6 pt-8 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-2xl font-bold">
                Check Your Email
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground mt-1">
                We&apos;ve sent a password reset link to your email address
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-6 pb-8">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border/50">
            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              If an account exists with that email, you&apos;ll receive
              instructions to reset your password shortly.
            </p>
          </div>
          <Link
            to="/login"
            search={{
              error: undefined,
              message: undefined,
              redirect: undefined,
            }}
            className="block"
          >
            <Button
              variant="outline"
              className="w-full h-12 font-semibold cursor-pointer hover:bg-accent hover:text-accent-foreground hover:shadow-md transition-all text-base"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-xl w-full backdrop-blur-sm bg-card/95">
      <CardHeader className="space-y-3 px-6 pt-8 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-2xl font-bold">
              Forgot Password
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              Enter your email address and we&apos;ll send you a reset link
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-8">
        <form onSubmit={onSubmit} className="space-y-6">
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
              className={`h-12 ${
                errors.email
                  ? "border-destructive focus-visible:ring-destructive/20"
                  : ""
              }`}
              disabled={isSubmitting}
            />
            {errors.email && (
              <p className="text-sm text-destructive flex items-center gap-1.5 mt-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {errors.email.message}
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
                Sending...
              </>
            ) : (
              "Send Reset Link"
            )}
          </Button>

          <div className="text-center pt-2">
            <Link
              to="/login"
              search={{
                error: undefined,
                message: undefined,
                redirect: undefined,
              }}
              className="text-sm text-primary hover:text-primary/80 hover:underline font-medium cursor-pointer transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
