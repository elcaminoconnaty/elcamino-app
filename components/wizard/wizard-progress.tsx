"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS } from "@/lib/data/wizard-steps";
import { Check } from "lucide-react";

export function WizardProgress({ departureId, completion }: { departureId: string; completion: Record<string, boolean> }) {
  const params = useSearchParams();
  const current = params.get("step") ?? "basicos";
  const idx = WIZARD_STEPS.findIndex((s) => s.key === current);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <ol className="flex gap-1 min-w-max">
          {WIZARD_STEPS.map((s, i) => {
            const active = current === s.key;
            const done = completion[s.key];
            return (
              <li key={s.key} className="flex-1 min-w-[110px]">
                <Link
                  href={`/caminos/${departureId}/wizard?step=${s.key}`}
                  className={cn(
                    "block rounded-md px-3 py-2 text-xs transition-colors",
                    active && "bg-camino-yellow text-camino-ink font-medium",
                    !active && done && "bg-green-100 text-green-900 hover:bg-green-200",
                    !active && !done && "bg-cream-100 text-muted-foreground hover:bg-cream-200"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {done ? (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <span className={cn(
                        "h-4 w-4 rounded-full flex items-center justify-center text-[10px] shrink-0",
                        active ? "bg-camino-ink text-camino-yellow" : "bg-background"
                      )}>
                        {i + 1}
                      </span>
                    )}
                    <span className="truncate">{s.shortLabel}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="text-xs text-muted-foreground">
        {idx >= 0 && (
          <>
            <strong className="text-foreground">{WIZARD_STEPS[idx].label}.</strong> {WIZARD_STEPS[idx].description}
          </>
        )}
      </div>
    </div>
  );
}

export function WizardNav({ departureId, currentKey }: { departureId: string; currentKey: string }) {
  const idx = WIZARD_STEPS.findIndex((s) => s.key === currentKey);
  const prev = idx > 0 ? WIZARD_STEPS[idx - 1] : null;
  const next = idx < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[idx + 1] : null;

  return (
    <div className="flex items-center justify-between pt-4 border-t mt-6">
      <div>
        {prev && (
          <Link href={`/caminos/${departureId}/wizard?step=${prev.key}`} className="text-sm text-muted-foreground hover:underline">
            ← {prev.shortLabel}
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Link href={`/caminos/${departureId}`} className="text-sm text-muted-foreground hover:underline">
          Salir
        </Link>
        {next ? (
          <Link
            href={`/caminos/${departureId}/wizard?step=${next.key}`}
            className="inline-flex items-center gap-1 bg-camino-yellow text-camino-ink rounded-md px-4 py-2 text-sm font-medium hover:bg-camino-deepYellow"
          >
            Siguiente · {next.shortLabel} →
          </Link>
        ) : (
          <Link
            href={`/caminos/${departureId}`}
            className="inline-flex items-center gap-1 bg-camino-yellow text-camino-ink rounded-md px-4 py-2 text-sm font-medium hover:bg-camino-deepYellow"
          >
            Finalizar wizard ✓
          </Link>
        )}
      </div>
    </div>
  );
}
