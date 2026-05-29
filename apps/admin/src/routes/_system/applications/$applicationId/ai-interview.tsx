import { createFileRoute } from "@tanstack/react-router";
import { InterviewPage } from "@/features/aiInterview/components/InterviewPage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute(
  "/_system/applications/$applicationId/ai-interview",
)({
  head: createAdminPageHead(
    "AI Interview",
    "Guided interview to configure the AI assistant for this application.",
  ),
  component: AiInterviewRoute,
});

function AiInterviewRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);
  const { applicationId } = Route.useParams();

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <InterviewPage applicationId={applicationId} />;
}
