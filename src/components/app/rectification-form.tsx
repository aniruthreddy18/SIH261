"use client";
import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { requestRectificationAction } from "@/app/actions/workflow";
import { useAction } from "@/components/use-action";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";

export function RectificationRequestForm({ applicationId, findings }: { applicationId: string; findings: { id: string; title: string; severity: string }[] }) {
  const [selected, setSelected] = useState<string[]>(findings.map((f) => f.id));
  const [message, setMessage] = useState("");
  const { pending, run } = useAction();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => requestRectificationAction(applicationId, selected, message));
      }}
    >
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-ink-2">Deficiencies the institution must correct</legend>
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          {findings.map((f) => (
            <li key={f.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-[13px] hover:bg-subtle">
                <input type="checkbox" className="mt-0.5" checked={selected.includes(f.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, f.id] : selected.filter((x) => x !== f.id))} />
                <span className="text-ink-2"><span className="mr-1 text-[10.5px] font-semibold uppercase text-muted">{f.severity}</span>{f.title}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Field label="Instructions to the institution" htmlFor="rect-msg" hint="Minimum 10 characters. The institution is notified in-app.">
        <Textarea id="rect-msg" value={message} onChange={(e) => setMessage(e.target.value)} minLength={10} required />
      </Field>
      <Button type="submit" disabled={pending || selected.length === 0 || message.trim().length < 10}>{pending ? <Loader2 className="animate-spin" /> : <Undo2 />} Return for rectification</Button>
    </form>
  );
}
