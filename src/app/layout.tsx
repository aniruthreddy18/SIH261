import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Aegis — Application Validation & Compliance Intelligence", template: "%s · Aegis" },
  description: "Decision-support prototype for validating institutional applications, documents and regulatory compliance (SIH 2026 PS 26261).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ style: { fontSize: 13 } }} />
      </body>
    </html>
  );
}
