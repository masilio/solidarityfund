import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import api from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]); // "ALL" for administrators, else an array of codes
  const [contributor, setContributor] = useState(null); // {id, name} if this account is a self-service contributor, else null
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = typeof window !== "undefined" && localStorage.getItem("sf_user");
    if (stored) {
      const parsed = JSON.parse(stored);
      setUser(parsed.user);
      setRoles(parsed.roles);
      setPermissions(parsed.permissions || []);
      setContributor(parsed.contributor || null);
    }
    setReady(true);
  }, []);

  async function login(email, password) {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    const { data } = await api.post("/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    localStorage.setItem("sf_token", data.access_token);
    localStorage.setItem("sf_user", JSON.stringify({ user: data.user, roles: data.roles, permissions: data.permissions, contributor: data.contributor }));
    setUser(data.user);
    setRoles(data.roles);
    setPermissions(data.permissions);
    setContributor(data.contributor || null);
    router.push("/dashboard");
  }

  function logout() {
    localStorage.removeItem("sf_token");
    localStorage.removeItem("sf_user");
    setUser(null);
    setRoles([]);
    setPermissions([]);
    setContributor(null);
    router.push("/");
  }

  function hasRole(...allowed) {
    return roles.includes("ADMINISTRATOR") || allowed.some((r) => roles.includes(r));
  }

  
  function hasPermission(...codes) {
    if (permissions === "ALL" || roles.includes("ADMINISTRATOR")) return true;
    return codes.some((c) => permissions.includes(c));
  }

  return (
    <AuthContext.Provider value={{ user, roles, permissions, contributor, ready, login, logout, hasRole, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
