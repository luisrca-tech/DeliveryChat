import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryState, parseAsString } from "nuqs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { AlertCircle, Loader2, Mail } from "lucide-react";
import { getApiUrl } from "../lib/urls";
import { getAdminUrl } from "../lib/urls";
import type { VerifyEmailFormData } from "../types/verifyEmailForm.type";
import { verifyEmailSchema } from "../schemas/verifyEmail.schema";
import { NuqsProvider } from "./providers/NuqsProvider";
import {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Card,
} from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

interface VerifyEmailFormProps {
  email?: string;
}

const RESEND_COOLDOWN_SECONDS = 60;

function VerifyEmailFormContent({ email: initialEmail }: VerifyEmailFormProps) {
  const [isResending, setIsResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const id = setInterval(() => setCooldownSeconds((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [cooldownSeconds]);

  const [emailFromUrl] = useQueryState(
    "email",
    parseAsString.withDefault(initialEmail || ""),
  );

  const formEmail = emailFromUrl || initialEmail || "";

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<VerifyEmailFormData>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: {
      email: formEmail,
      otp: "",
    },
  });

  const otp = watch("otp");
  const currentEmail = watch("email");

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setValue("email", newEmail, { shouldValidate: true });
  };

  const onSubmit = async (data: VerifyEmailFormData) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/v1/verify-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: formEmail || currentEmail || data.email,
          otp: data.otp,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error("Verification Failed", {
          description:
            result.message || result.error || "Invalid verification code",
        });
        return;
      }

      toast.success("Email Verified!", {
        description: "Your email has been verified successfully.",
      });

      if (result.organizationSlug) {
        const adminUrl = getAdminUrl(result.organizationSlug);
        const loginUrl = new URL(`${adminUrl}/login`);
        loginUrl.searchParams.set("redirect", "/onboarding/plans");
        loginUrl.searchParams.set(
          "message",
          "Email verified. Please sign in to continue.",
        );
        setTimeout(() => {
          window.location.href = loginUrl.toString();
        }, 1500);
      } else {
        toast.error("Redirect Failed", {
          description: "Organization slug not found",
        });
      }
    } catch (error) {
      console.error("Verification error:", error);
      toast.error("Verification Failed", {
        description:
          error instanceof Error
            ? error.message
            : "An error occurred during verification. Please try again.",
      });
    }
  };

  const handleResend = async () => {
    const emailToUse = formEmail || currentEmail;
    if (!emailToUse) {
      toast.error("Email Required", {
        description: "Please enter your email address",
      });
      return;
    }

    setIsResending(true);
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/v1/resend-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: emailToUse,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error("Resend Failed", {
          description:
            result.message ||
            result.error ||
            "Failed to resend verification code",
        });
        return;
      }

      toast.success("Verification Code Resent", {
        description: "Please check your email for the new verification code.",
      });
      setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      console.error("Resend error:", error);
      toast.error("Resend Failed", {
        description:
          "An error occurred while resending the code. Please try again.",
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="w-full max-w-md space-y-8 animate-fade-in-up">
          <div className="text-center space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold">
              Verify Your{" "}
              <span className="bg-linear-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                Email
              </span>
            </h1>
            <p className="text-muted-foreground">
              Enter the verification code sent to your email address
            </p>
          </div>

          <Card className="border-border/50 shadow-soft">
            <CardHeader>
              <CardTitle>Email Verification</CardTitle>
              <CardDescription>
                We've sent a 6-digit code to your email address
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
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    Email Address <span className="text-destructive">*</span>
                  </Label>
                  <input
                    id="email"
                    type="email"
                    {...register("email", {
                      value: formEmail,
                      onChange: handleEmailChange,
                    })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSubmitting || !!formEmail}
                    readOnly={!!formEmail}
                  />
                  {formEmail && (
                    <p className="text-xs text-muted-foreground">
                      This email was used during registration
                    </p>
                  )}
                  {errors.email && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="otp">
                    Verification Code{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex w-full">
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      onChange={(value) =>
                        setValue("otp", value, { shouldValidate: true })
                      }
                      disabled={isSubmitting}
                      containerClassName="w-full justify-center"
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {errors.otp && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.otp.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-hero transition-all duration-300 py-2 cursor-pointer bg-white text-primary hover:text-white border-primary border"
                  disabled={
                    !(formEmail || currentEmail) ||
                    !otp ||
                    otp.length !== 6 ||
                    isSubmitting
                  }
                  size="lg"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify Email"
                  )}
                </Button>

                <div className="text-center flex items-center justify-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={
                      !formEmail ||
                      !currentEmail ||
                      isResending ||
                      cooldownSeconds > 0
                    }
                    className="text-sm text-primary hover:text-primary/80 hover:underline font-medium cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isResending ? (
                      <>
                        <Loader2 className="inline mr-2 h-3 w-3 animate-spin" />
                        Resending...
                      </>
                    ) : (
                      "Resend Verification Code"
                    )}
                  </button>
                  {cooldownSeconds > 0 && (
                    <span className="text-sm text-muted-foreground">
                      Resend in {cooldownSeconds}s
                    </span>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function VerifyEmailForm(props: VerifyEmailFormProps) {
  return (
    <NuqsProvider>
      <VerifyEmailFormContent {...props} />
    </NuqsProvider>
  );
}
