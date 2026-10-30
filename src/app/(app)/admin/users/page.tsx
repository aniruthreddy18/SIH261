import { ROLE_LABELS, type Role } from "@/lib/domain";
import { listUsers } from "@/server/admin";
import { prisma } from "@/server/db";
import { pageGuard } from "@/server/session";
import { PageHeader } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { CreateUserDialog, UserRowControls } from "./controls";

export const metadata = { title: "User Management" };

export default async function UsersPage() {
  const { actor, denied } = await pageGuard("users.manage");
  const crumbs = [{ label: "Administration" }, { label: "User Management" }];
  if (denied) return (<><PageHeader title="User Management" crumbs={crumbs} /><AccessDenied /></>);
  const [users, institutions, regions] = await Promise.all([listUsers(actor), prisma.institution.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }), prisma.region.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } })]);
  return (
    <>
      <PageHeader title="User Management" crumbs={crumbs} description="Accounts and roles. Permissions are enforced on the server for every page, action, download and export." actions={<CreateUserDialog institutions={institutions} regions={regions} />} />
      <Card>
        <Table>
          <THead><tr><TH>User</TH><TH>Role</TH><TH className="hidden md:table-cell">Institution / Region</TH><TH className="hidden lg:table-cell">Last sign-in</TH><TH>Status</TH><TH className="text-right">Manage</TH></tr></THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD><p className="font-medium text-ink">{u.name}</p><p className="text-xs text-muted">{u.email}{u.designation ? ` · ${u.designation}` : ""}</p></TD>
                <TD className="text-xs">{ROLE_LABELS[u.role as Role]}</TD>
                <TD className="hidden md:table-cell text-xs">{u.institution?.name ?? u.region?.name ?? (u.role === "SCRUTINY_OFFICER" ? "All Regions" : "—")}</TD>
                <TD className="hidden lg:table-cell text-xs">{formatDateTime(u.lastLoginAt)}</TD>
                <TD>{u.active ? <Badge tone="ok">Active</Badge> : <Badge tone="bad">Disabled</Badge>}</TD>
                <TD className="text-right"><UserRowControls userId={u.id} role={u.role as Role} active={u.active} self={u.id === actor.userId} regionId={u.regionId} regions={regions} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
