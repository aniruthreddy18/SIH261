"use client";
import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { createUserAction, updateUserAction } from "@/app/actions/admin";
import { useAction } from "@/components/use-action";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/domain";

export function UserRowControls({ userId, role, active, self }: { userId: string; role: Role; active: boolean; self: boolean }) {
  const { pending, run } = useAction();
  if (self) return <span className="text-xs text-muted">Your account</span>;
  return (
    <div className="flex items-center justify-end gap-2">
      {role !== "APPLICANT" && (
        <Select aria-label="Role" className="h-8 w-56 text-xs" defaultValue={role} disabled={pending} onChange={(e) => run(() => updateUserAction(userId, { role: e.target.value }))}>
          {ROLES.filter((r) => r !== "APPLICANT").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Select>
      )}
      <Button size="xs" variant={active ? "outline" : "default"} disabled={pending} onClick={() => run(() => updateUserAction(userId, { active: !active }))}>
        {pending && <Loader2 className="animate-spin" />}
        {active ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}

export function CreateUserDialog({ institutions }: { institutions: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("SCRUTINY_OFFICER");
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><UserPlus /> Create user</Button></DialogTrigger>
      <DialogContent title="Create user" description="Passwords are stored as scrypt hashes. Share the initial password through a secure channel.">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => createUserAction({ email: String(fd.get("email")), name: String(fd.get("name")), designation: String(fd.get("designation")), role, institutionId: String(fd.get("institutionId") ?? ""), password: String(fd.get("password")) }), { onSuccess: () => setOpen(false) });
          }}
        >
          <Field label="Full name" htmlFor="u-name"><Input id="u-name" name="name" required minLength={2} /></Field>
          <Field label="Email" htmlFor="u-email"><Input id="u-email" name="email" type="email" required /></Field>
          <Field label="Designation" htmlFor="u-des"><Input id="u-des" name="designation" /></Field>
          <Field label="Role" htmlFor="u-role"><Select id="u-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
          {role === "APPLICANT" && <Field label="Institution" htmlFor="u-inst"><Select id="u-inst" name="institutionId" required>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>}
          <Field label="Initial password" htmlFor="u-pw" hint="At least 10 characters with letters and digits."><Input id="u-pw" name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
          <div className="flex justify-end gap-2 border-t border-border pt-3"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Create user</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
