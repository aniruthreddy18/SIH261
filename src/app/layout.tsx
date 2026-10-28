import type { Metadata } from "next";
import { Toaster } from "sonner";
import { getActor } from "@/server/session";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Pravah AI — Application Validation & Compliance Intelligence", template: "%s · Pravah AI" },
  description: "Decision-support prototype for validating institutional applications, documents and regulatory compliance (SIH 2026 PS 26261).",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The signed-in role selects the colour theme (see globals.css → "Role themes").
  const actor = await getActor();
  return (
    <html lang="en" data-role={actor?.role ?? "GUEST"}>
      <body>
        {children}
        <Toaster position="bottom-right" theme="dark" richColors closeButton toastOptions={{ style: { fontSize: 13 } }} />
      </body>
    </html>
  );
}
