"use client";
import { useActionState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function LoginForm({ next, portal, defaultEmail, defaultPassword }: { next: string; portal: "INSTITUTION" | "OFFICIAL"; defaultEmail?: string; defaultPassword?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="portal" value={portal} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={defaultEmail} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required defaultValue={defaultPassword} />
      </Field>
      {state?.error && <p role="alert" className="rounded-md border border-bad-line bg-bad-soft px-3 py-2 text-xs text-bad">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />} Sign in
      </Button>
    </form>
  );
}
