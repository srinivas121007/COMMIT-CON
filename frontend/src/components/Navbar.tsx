"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";
import { 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  GitCommit, 
  History, 
  ShieldCheck, 
  Layers
} from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [storageBackend, setStorageBackend] = useState<string>("local");

  useEffect(() => {
    fetchHealth()
      .then((data) => {
        setBackendStatus("online");
        setStorageBackend(data.storage_backend);
      })
      .catch(() => {
        setBackendStatus("offline");
      });
  }, []);

  const navItems = [
    { label: "Dashboard", href: "/", icon: Layers },
    { label: "Review Queue", href: "/review", icon: ShieldCheck },
    { label: "Audit Log", href: "/audit", icon: History },
    { label: "Entity Lineage", href: "/lineage", icon: GitCommit },
  ];

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-xl text-slate-900 tracking-tight">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Database className="h-5 w-5" />
            </div>
            <span>Knowledge Repair Tool</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 bg-slate-50">
            <span
              className={`h-2 w-2 rounded-full ${
                backendStatus === "online"
                  ? "bg-emerald-500 animate-pulse"
                  : backendStatus === "checking"
                  ? "bg-amber-400"
                  : "bg-rose-500"
              }`}
            />
            <span className="text-slate-700 capitalize font-medium">
              {backendStatus === "online" ? `Backend: ${storageBackend}` : backendStatus}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
