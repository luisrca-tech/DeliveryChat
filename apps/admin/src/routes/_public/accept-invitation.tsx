import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { authClient } from "@/lib/authClient";
import { getApiBaseUrl } from "@/lib/urls";
import { setBearerToken } from "@/lib/bearerToken";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

type InvitationData = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  expiresAt: string;
  organizationName: string;
  organizationSlug: string;
};

export const Route = createFileRoute("/_public/accept-invitation")({
  validateSearch: (search: Record<string, unknown>) => ({
    invitationId: (search.invitationId as string) ?? "",
  }),
  component: AcceptInvitationPage,
});

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  operator: "Operator",
};

function AcceptInvitationPage() {
  const { invitationId } = useSearch({ from: "/_public/accept-invitation" });
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"form" | "success" | "error">("form");
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!invitationId) {
      setError("No invitation ID provided");
      setLoading(false);
      return;
    }

    fetch(`${getApiBaseUrl()}/invitations/${invitationId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            (body as { message?: string })?.message ?? "Invitation not found",
          );
        }
        return res.json() as Promise<{
          invitation: InvitationData;
          existingUser: { name: string } | null;
        }>;
      })
      .then((data) => {
        const inv = data.invitation;
        if (inv.status !== "pending") {
          setError(
            inv.status === "accepted"
              ? "This invitation has already been accepted"
              : `This invitation has been ${inv.status}`,
          );
        } else if (new Date(inv.expiresAt) < new Date()) {
          setError("This invitation has expired");
        } else {
          setInvitation(inv);
          if (data.existingUser) {
            setIsReturningUser(true);
            setName(data.existingUser.name);
          } else if (inv.name) {
            setName(inv.name);
          }
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [invitationId]);

  const handleSubmit = async () => {
    if (!invitation) return;
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters");
      return;
    }
    if (!isReturningUser) {
      if (!name.trim()) {
        setSubmitError("Name is required");
        return;
      }
      if (password !== confirmPassword) {
        setSubmitError("Passwords do not match");
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      if (isReturningUser) {
        // Returning user — sign in with existing account
        const signInResult = await authClient.signIn.email({
          email: invitation.email,
          password,
        });
        if (signInResult.error) {
          setSubmitError("Incorrect password. Please try again.");
          setIsSubmitting(false);
          return;
        }
        const token = signInResult.response?.headers?.get("set-auth-token");
        if (token) setBearerToken(token);
      } else {
        // New user — create account
        const signUpResult = await authClient.signUp.email({
          name: name.trim(),
          email: invitation.email,
          password,
        });

        if (signUpResult.error) {
          if (
            signUpResult.error.code === "USER_ALREADY_EXISTS" ||
            signUpResult.error.message?.includes("already")
          ) {
            // Race condition: user created between page load and submit
            const signInResult = await authClient.signIn.email({
              email: invitation.email,
              password,
            });
            if (signInResult.error) {
              setSubmitError(
                "An account with this email already exists. Please use the correct password.",
              );
              setIsSubmitting(false);
              return;
            }
            const token =
              signInResult.response?.headers?.get("set-auth-token");
            if (token) setBearerToken(token);
          } else {
            setSubmitError(
              signUpResult.error.message ?? "Failed to create account",
            );
            setIsSubmitting(false);
            return;
          }
        } else {
          const token =
            signUpResult.response?.headers?.get("set-auth-token");
          if (token) setBearerToken(token);
        }
      }

      // Accept the invitation
      const acceptResult = await authClient.organization.acceptInvitation({
        invitationId: invitation.id,
      });

      if (acceptResult.error) {
        setSubmitError(
          acceptResult.error.message ?? "Failed to accept invitation",
        );
        setIsSubmitting(false);
        return;
      }

      setStep("success");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading invitation...</p>
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center gap-3 py-8">
          <XCircle className="h-12 w-12 text-red-500" />
          <p className="text-lg font-medium">Invalid Invitation</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </PageWrapper>
    );
  }

  if (step === "success") {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center gap-3 py-8">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <p className="text-lg font-medium">
            Welcome to {invitation?.organizationName}!
          </p>
          <p className="text-sm text-muted-foreground">
            {isReturningUser
              ? "You have rejoined the organization."
              : "Your account has been created and you have joined the organization."}
          </p>
          <Button onClick={() => (window.location.href = "/")}>
            Go to Dashboard
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <CardHeader className="text-center pb-2">
        <CardTitle>Join {invitation?.organizationName}</CardTitle>
        <CardDescription>
          {isReturningUser ? (
            <>
              Welcome back! Sign in to rejoin as{" "}
              <span className="font-medium">
                {roleLabels[invitation?.role ?? ""] ?? invitation?.role}
              </span>
              .
            </>
          ) : (
            <>
              You have been invited as{" "}
              <span className="font-medium">
                {roleLabels[invitation?.role ?? ""] ?? invitation?.role}
              </span>
              . Create your account to get started.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={invitation?.email ?? ""} disabled className="bg-muted" />
        </div>

        {!isReturningUser && (
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              autoFocus
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Password</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isReturningUser ? "Your existing password" : "At least 8 characters"}
            autoFocus={isReturningUser}
          />
        </div>

        {!isReturningUser && (
          <div className="space-y-2">
            <Label>Confirm Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>
        )}

        {isReturningUser && (
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => (window.location.href = "/forgot-password")}
          >
            Forgot your password?
          </button>
        )}

        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isReturningUser ? "Signing in..." : "Creating account..."}
            </>
          ) : isReturningUser ? (
            "Sign In & Rejoin"
          ) : (
            "Create Account & Join"
          )}
        </Button>
      </CardContent>
    </PageWrapper>
  );
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}
