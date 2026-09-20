import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../lib/auth";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!user) return null;
  const initial = (user.name || "?").trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="sf-user-menu-trigger" aria-label="Account menu">
        <span className="sf-user-avatar">{initial}</span>
        <span className="d-none d-md-inline">{user.name}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="sf-user-menu-dropdown">
          <div className="sf-user-menu-name">{user.name}</div>
          <div className="sf-user-menu-email">{user.email}</div>
          <Link href="/profile" onClick={() => setOpen(false)}>My Profile</Link>
          <button onClick={logout}>Log Out</button>
        </div>
      )}
    </div>
  );
}
