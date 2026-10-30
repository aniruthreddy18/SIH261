"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useAction } from "@/components/use-action";
import type { ActionResult } from "@/server/actions-util";

export interface DialogField {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select" | "date" | "number";
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
  defaultValue?: string;
}

/** Generic confirmation dialog for reasoned actions. `action` is a bound server action. */
export function ActionDialog({
  label,
  icon,
  variant = "outline",
  size = "sm",
  title,
  description,
  fields,
  submitLabel,
  action,
  notice,
  disabled,
}: {
  label: string;
  icon?: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  title: string;
  description?: React.ReactNode;
  fields: DialogField[];
  submitLabel?: string;
  action: (values: Record<string, string>) => Promise<ActionResult<unknown>>;
  notice?: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values: Record<string, string> = {};
    for (const f of fields) values[f.name] = String(fd.get(f.name) ?? "");
    run(() => action(values), { onSuccess: () => setOpen(false) });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled}>
          {icon}
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <form onSubmit={onSubmit} className="space-y-3">
          {notice}
          {fields.map((f) => (
            <Field key={f.name} label={f.label} htmlFor={`f-${f.name}`} hint={f.hint}>
              {f.type === "textarea" ? (
                <Textarea id={`f-${f.name}`} name={f.name} required={f.required !== false} minLength={f.minLength ?? 5} placeholder={f.placeholder} defaultValue={f.defaultValue} />
              ) : f.type === "select" ? (
                <Select id={`f-${f.name}`} name={f.name} required={f.required !== false} defaultValue={f.defaultValue}>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : (
                <Input id={`f-${f.name}`} name={f.name} type={f.type === "date" || f.type === "number" ? f.type : "text"} required={f.required !== false} minLength={f.type === "date" || f.type === "number" ? undefined : f.minLength} placeholder={f.placeholder} defaultValue={f.defaultValue} />
              )}
            </Field>
          ))}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending} variant={variant === "destructive" ? "destructive" : "default"}>
              {pending && <Loader2 className="animate-spin" />}
              {submitLabel ?? label}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Button for an action that needs no input; optional confirmation text. */
export function ActionButton({ label, icon, variant = "default", size = "sm", action, confirm, pendingLabel, disabled }: { label: string; icon?: React.ReactNode; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; action: () => Promise<ActionResult<unknown>>; confirm?: string; pendingLabel?: string; disabled?: boolean }) {
  const { pending, run } = useAction();
  return (
    <Button
      variant={variant}
      size={size}
      disabled={pending || disabled}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        run(() => action());
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : icon}
      {pending ? pendingLabel ?? label : label}
    </Button>
  );
}
