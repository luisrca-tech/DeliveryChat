import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Star } from "lucide-react";
import { testimonials } from "../../constants/testimonials";

export default function Testimonials() {
  return (
    <section id="testimonials" className="py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16 space-y-4">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
            Loved by{" "}
            <span className="bg-linear-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Teams Worldwide
            </span>
          </h2>
          <p className="text-lg text-muted-foreground">
            See what our customers have to say about their experience.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => {
            const delay = index * 0.1;
            return (
              <Card
                key={index}
                className={`group hover:shadow-glow transition-all duration-300 border-border/50 bg-gradient-card animate-fade-in-up`}
                style={{ animationDelay: `${delay}s` }}
              >
                <CardContent className="p-6 space-y-4">
                  <div className="flex gap-1">
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star
                        key={i}
                        className="h-5 w-5 fill-primary text-primary"
                      />
                    ))}
                  </div>

                  <p className="text-muted-foreground leading-relaxed">
                    "{testimonial.content}"
                  </p>

                  <div className="pt-4 border-t border-border/50">
                    <p className="font-semibold group-hover:text-primary transition-colors">
                      {testimonial.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {testimonial.role}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
