import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Sidebar from "./Sidebar";
import UserMenu from "./UserMenu";
import { useAuth } from "../lib/auth";

export default function Layout({ title, children }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user]);

  // Close the mobile drawer automatically on every navigation.
  useEffect(() => {
    const close = () => setSidebarOpen(false);
    router.events.on("routeChangeStart", close);
    return () => router.events.off("routeChangeStart", close);
  }, [router.events]);

  if (!ready || !user) return null;

  return (
    <div className="sf-app">
      <div className="sf-mobile-topbar">
        <button aria-label="Open menu" onClick={() => setSidebarOpen(true)}>&#9776;</button>
        <span>{title}</span>
        <UserMenu />
      </div>
      <div className={`sf-sidebar-backdrop ${sidebarOpen ? "sf-sidebar-open" : ""}`} onClick={() => setSidebarOpen(false)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="sf-main">
        <div className="sf-topbar d-none d-md-flex"><h1>{title}</h1><UserMenu /></div>
        {children}
      </main>
    </div>
  );
}
