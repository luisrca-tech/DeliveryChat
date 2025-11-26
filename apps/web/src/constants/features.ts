import {
  Clock,
  Globe,
  type LucideIcon,
  Palette,
  Settings,
  Shield,
  Zap,
} from "lucide-react";

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const features: Feature[] = [
  {
    icon: Palette,
    title: "Fully Customizable",
    description:
      "Customize colors, logos, position, and style to match your brand perfectly. Make it yours.",
  },
  {
    icon: Shield,
    title: "Multi-Tenant Architecture",
    description:
      "Isolated data per company with secure, scalable infrastructure. Your data stays private.",
  },
  {
    icon: Zap,
    title: "Real-Time Chat",
    description:
      "Instant messaging with WebSocket support. Connect with customers the moment they need help.",
  },
  {
    icon: Globe,
    title: "Custom Domain Support",
    description:
      "Use your own domain or our subdomain. Professional URLs that build trust.",
  },
  {
    icon: Clock,
    title: "Business Hours & Auto-Responses",
    description:
      "Set availability hours and automated replies. Never miss a conversation, even offline.",
  },
  {
    icon: Settings,
    title: "Admin Dashboard",
    description:
      "Powerful dashboard to manage conversations, visitors, and settings. Everything in one place.",
  },
];
