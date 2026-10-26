"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions-util";

/** Run a server action with pending state, toast feedback and a router refresh on success. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, opts: { onSuccess?: (r: ActionResult<T> & { ok: true }) => void } = {}) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Done");
        router.refresh();
        opts.onSuccess?.(r);
      } else {
        toast.error(r.error);
      }
    });
  return { pending, run };
}
