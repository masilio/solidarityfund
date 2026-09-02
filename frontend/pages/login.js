import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

export default function Login() {
  const { login } = useAuth();
  const { notifySuccess, notifyError } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      notifySuccess("Signed in successfully");
    } catch (err) {
      notifyError(err, "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h2 className="mb-1" style={{ color: "var(--sf-navy)", fontWeight: 800 }}>Solidarity Fund</h2>
        <p className="text-muted mb-4">Sign in to continue</p>
        <div className="mb-3">
          <label className="form-label fw-bold">Email</label>
          <input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="mb-4">
          <label className="form-label fw-bold">Password</label>
          <input className="form-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-sf-primary w-100" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
