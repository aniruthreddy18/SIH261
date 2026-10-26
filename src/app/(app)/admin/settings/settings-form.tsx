"use client";
import { Loader2, Save } from "lucide-react";
import { updateSettingsAction } from "@/app/actions/admin";
import { useAction } from "@/components/use-action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export interface SettingRow { key: string; label: string; help: string; type: "number" | "boolean"; value: number | boolean; min?: number; max?: number }

export function SettingsForm({ rows }: { rows: SettingRow[] }) {
  const { pending, run } = useAction();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const values: Record<string, string> = {};
        for (const r of rows) values[r.key] = r.type === "boolean" ? (fd.get(r.key) === "on" ? "true" : "false") : String(fd.get(r.key));
        run(() => updateSettingsAction(values));
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) =>
          r.type === "boolean" ? (
            <label key={r.key} className="flex items-start gap-2 rounded-md border border-border p-3 text-[13px]">
              <input type="checkbox" name={r.key} defaultChecked={Boolean(r.value)} className="mt-1" />
              <span><span className="font-medium text-ink">{r.label}</span><span className="block text-[11px] text-muted">{r.help}</span></span>
            </label>
          ) : (
            <Field key={r.key} label={r.label} htmlFor={`s-${r.key}`} hint={`${r.help} (${r.min}–${r.max})`}>
              <Input id={`s-${r.key}`} name={r.key} type="number" step="any" min={r.min} max={r.max} defaultValue={String(r.value)} required />
            </Field>
          ),
        )}
      </div>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Save settings</Button>
    </form>
  );
}
