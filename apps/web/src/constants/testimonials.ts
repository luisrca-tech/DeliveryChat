export interface Testimonial {
  name: string;
  role: string;
  content: string;
  rating: number;
  company: string;
}

export const testimonials: Testimonial[] = [
  {
    name: "Sarah Johnson",
    role: "CEO at TechFlow",
    content:
      "Delivery Chat transformed how we interact with customers. The customization options are incredible, and our response times improved by 60%.",
    rating: 5,
    company: "TechFlow",
  },
  {
    name: "Michael Chen",
    role: "Support Manager at CloudBase",
    content:
      "The multi-tenant architecture is exactly what we needed. Easy setup, powerful features, and the admin dashboard is a joy to use.",
    rating: 5,
    company: "CloudBase",
  },
  {
    name: "Emily Rodriguez",
    role: "Founder of Startup Hub",
    content:
      "We went from idea to implementation in just 10 minutes. The embeddable widget looks professional and our customers love it.",
    rating: 5,
    company: "Startup Hub",
  },
];
