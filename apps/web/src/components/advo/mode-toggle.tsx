"use client";

import { User, GraduationCap, Scale, type LucideIcon } from "lucide-react";

import type { UserMode } from "@/lib/api";
import { MODES, MODE_ORDER } from "@/lib/modes";
import { cn } from "@/lib/utils";

const MODE_ICONS: Record<UserMode, LucideIcon> = {
  citizen: User,
  student: GraduationCap,
  lawyer: Scale,
};

/** Segmented Citizen / Student / Lawyer toggle. */
export function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: UserMode;
  onChange: (mode: UserMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Answer mode"
      className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {MODE_ORDER.map((key) => {
        const Icon = MODE_ICONS[key];
        const active = mode === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(key)}
            title={MODES[key].description}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {MODES[key].shortLabel}
          </button>
        );
      })}
    </div>
  );
}
