import {
  Code,
  type LucideIcon,
  MessageSquare,
  Paintbrush,
  UserPlus,
} from "lucide-react";

export interface Step {
  icon: LucideIcon;
  title: string;
  description: string;
  step: string;
}

export const steps: Step[] = [
  {
    icon: UserPlus,
    title: "Sign Up & Create Account",
    description:
      "Register your company and get your unique subdomain in seconds.",
    step: "01",
  },
  {
    icon: Paintbrush,
    title: "Customize Your Widget",
    description:
      "Design your chat widget with colors, logos, and positioning that match your brand.",
    step: "02",
  },
  {
    icon: Code,
    title: "Embed on Your Website",
    description:
      "Copy a simple code snippet and paste it into your website. No complex setup required.",
    step: "03",
  },
  {
    icon: MessageSquare,
    title: "Start Chatting with Customers",
    description:
      "Engage with visitors in real-time through your admin dashboard. That's it!",
    step: "04",
  },
];
