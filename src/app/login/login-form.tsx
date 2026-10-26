"use client";
import { useActionState, useEffect, useRef } from "react";
import { Loader2, LogIn } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".demo-fill");
      if (!btn || !email.current || !password.current) return;
      email.current.value = btn.dataset.demoEmail ?? "";
      password.current.value = "Aegis@Demo2026";
      password.current.focus();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input ref={email} id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input ref={password} id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state?.error && <p role="alert" className="rounded-md border border-red-200 bg-bad-soft px-3 py-2 text-xs text-bad">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />} Sign in
      </Button>
    </form>
  );
}
