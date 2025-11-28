import { steps } from "../../constants/steps";

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16 space-y-4">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
            Get Started in{" "}
            <span className="bg-linear-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              4 Simple Steps
            </span>
          </h2>
          <p className="text-lg text-muted-foreground">
            From signup to your first conversation in less than 5 minutes.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {steps.map((step, index) => {
              const IconComponent = step.icon;
              const delay = index * 0.15;
              return (
                <div
                  key={index}
                  className="relative group animate-fade-in-up"
                  style={{ animationDelay: `${delay}s` }}
                >
                  <div className="flex gap-6 p-6 rounded-2xl bg-gradient-card border border-border/50 hover:shadow-soft transition-all duration-300">
                    <div className="shrink-0">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-hero opacity-20 blur-xl rounded-full" />
                        <div className="relative w-16 h-16 rounded-full bg-gradient-hero flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                          <span className="text-2xl font-bold text-primary-foreground">
                            {step.step}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3">
                      <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center">
                        <IconComponent className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">
                        {step.title}
                      </h3>
                      <p className="text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-linear-to-r from-primary to-transparent" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
