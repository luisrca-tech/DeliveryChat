import { Card, CardContent } from "@repo/ui/components/ui/card";
import { features } from "../../constants/features";

export default function Features() {
  return (
    <section id="features" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16 space-y-4">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
            Everything You Need to{" "}
            <span className="bg-linear-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Scale Support
            </span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Powerful features designed to help you deliver exceptional customer
            experiences.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const IconComponent = feature.icon;
            const delay = index * 0.1;
            return (
              <Card
                key={index}
                className={`group hover:shadow-glow transition-all duration-300 border-border/50 bg-gradient-card animate-fade-in`}
                style={{ animationDelay: `${delay}s` }}
              >
                <CardContent className="p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-hero flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <IconComponent className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
