import Link from "next/link";
import {
  Scale,
  User,
  GraduationCap,
  BookOpen,
  FileText,
  Mic,
  ArrowRight,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MODES, MODE_ORDER, DISCLAIMER } from "@/lib/modes";

const MODE_ICONS = { citizen: User, student: GraduationCap, lawyer: Scale } as const;

const FEATURES = [
  {
    icon: BookOpen,
    title: "Cited answers",
    description: "Every claim points to the exact statute and section it comes from.",
  },
  {
    icon: FileText,
    title: "Document analysis",
    description: "Upload contracts and agreements — ask questions about what they say.",
  },
  {
    icon: Sparkles,
    title: "Three modes",
    description: "Answers tuned for citizens, law students, and practicing lawyers.",
  },
  {
    icon: Mic,
    title: "Voice (soon)",
    description: "Speak your question and hear ADVO's answer read back to you.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4 gap-1.5">
            <Scale className="size-3" />
            Pakistani law · Contract Act 1872 and more
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Legal answers you can{" "}
            <span className="text-primary">actually verify</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground text-pretty sm:text-lg">
            ADVO explains Pakistani law in your words — from everyday contracts to
            exam-ready analysis — always citing the exact sections behind every
            answer.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/chat">
                Start asking
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/documents">Analyze a document</Link>
            </Button>
          </div>
        </div>

        {/* Mode selection */}
        <div className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
          {MODE_ORDER.map((key) => {
            const mode = MODES[key];
            const Icon = MODE_ICONS[key];
            return (
              <Link key={key} href={`/chat?mode=${key}`} className="group">
                <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:ring-primary/40">
                  <CardHeader>
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <CardTitle className="mt-2">{mode.label}</CardTitle>
                    <CardDescription>{mode.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-end">
                    <p className="text-sm text-muted-foreground">
                      {mode.longDescription}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Continue as {mode.shortLabel}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-4.5" />
              </span>
              <div>
                <h3 className="text-sm font-medium">{feature.title}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl items-start gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <p>{DISCLAIMER}</p>
        </div>
      </footer>
    </div>
  );
}
