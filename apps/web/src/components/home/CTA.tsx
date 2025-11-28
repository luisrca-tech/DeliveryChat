import { Button } from "@repo/ui/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

export default function CTA() {
  return (
    <section className="py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-primary/10 via-background to-primary-glow/10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl bg-gradient-card border border-border/50 shadow-glow p-8 sm:p-12 lg:p-16 text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/50 border border-primary/20 backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-primary animate-glow" />
              <span className="text-sm font-medium">
                Start Your 14-Day Free Trial
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
              Ready to Transform Your{" "}
              <span className="bg-linear-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                Customer Support?
              </span>
            </h2>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Join hundreds of companies delivering exceptional customer
              experiences with Delivery Chat. No credit card required.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <a href="/register">
                <Button
                  size="lg"
                  className="bg-gradient-hero hover:shadow-glow transition-all duration-300 text-base px-8 h-12"
                >
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <Button
                size="lg"
                variant="outline"
                className="text-base px-8 h-12"
              >
                Schedule a Demo
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 pt-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-glow" />
                <span>14-day free trial</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-glow" />
                <span>No credit card</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-glow" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
