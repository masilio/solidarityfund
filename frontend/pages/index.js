import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import FormModal from "../components/FormModal";
import api from "../lib/api";

// Mirrors the Contributor form on the Contributions page — because that's what registering
// here actually creates: a Contributor record (the org/individual giving) linked to a new
// login, not just a bare user account. Password is the one addition, since this form also
// has to set up how they'll sign back in.
const REGISTER_FIELDS = [
  { name: "contributor_name", label: "Contributor Name", required: true },
  { name: "contributor_type", label: "Type", required: true, type: "select",
    options: ["Government", "NGO", "Company", "Individual"].map((v) => ({ value: v, label: v })) },
  { name: "phone_number", label: "Phone Number" },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "address", label: "Address", type: "textarea" },
  { name: "password", label: "Password", type: "password", required: true },
];

export default function Home() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const { notifySuccess, notifyError } = useToast();
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace("/dashboard");
  }, [ready, user]);

  async function submitRegistration(values) {
    try {
      await api.post("/auth/register", values);
      notifySuccess("Account created — sign in to continue");
      setShowRegister(false);
      router.push("/login");
    } catch (err) {
      notifyError(err, "Could not create your account");
    }
  }

  if (!ready || user) return null;

  return (
    <div className="sf-landing">
      <header className="sf-landing-hero">
        <div className="sf-landing-hero-inner">
          <div className="sf-landing-brand">Social Solidarity Fund</div>
          <h1>Community support, organized and accountable.</h1>
          <p>
            A platform that connects contributors, disaster-response teams, and resource
            managers so assistance reaches affected households quickly, transparently, and
            with a full record of who gave, who verified, and who received.
          </p>
          <div className="sf-landing-actions">
            <button className="btn btn-sf-accent btn-lg" onClick={() => setShowRegister(true)}>Donate</button>
            <button className="btn btn-lg sf-landing-checkin" onClick={() => router.push("/login")}>Check In</button>
          </div>
        </div>
      </header>

      <main className="sf-landing-body">
        <section className="sf-landing-section">
          <h2>About the Fund</h2>
          <p>
            The Social Solidarity Fund is a community-driven safety net for households affected
            by disasters and hardship — floods, fires, displacement, and other emergencies.
            Contributions from government partners, organizations, and individuals are pooled
            into one fund and distributed as cash or essential items to households whose needs
            have been assessed and verified.
          </p>
        </section>

        <section className="sf-landing-section sf-landing-section-alt">
          <h2>Our Purpose</h2>
          <p>
            Every contribution is tracked from the moment it's received to the moment it reaches
            a household — with independent verification at each step: an assessment records what
            a household actually needs, resource management staff confirm what's available to
            give, an authorized approver signs off, and the handover itself is recorded against
            the exact amount approved. Nothing moves without a record of who did what and when.
          </p>
        </section>

        <section className="sf-landing-section">
          <h2>Who We Serve</h2>
          <div className="row g-3 mt-1">
            <div className="col-md-4">
              <div className="sf-landing-card">
                <h3>Affected Households</h3>
                <p>Families and individuals impacted by disasters who need cash or material assistance, assessed and supported through a transparent process.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="sf-landing-card">
                <h3>Contributors</h3>
                <p>Government bodies, NGOs, companies, and individuals who want their donation tracked from receipt to distribution.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="sf-landing-card">
                <h3>Response Teams</h3>
                <p>Response and resource management staff who register, assess, verify, and distribute assistance with full accountability.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="sf-landing-footer">
        <span>&copy; {new Date().getFullYear()} Social Solidarity Fund Management System</span>
      </footer>

      {showRegister && (
        <FormModal title="Register as a Contributor" fields={REGISTER_FIELDS} initialValues={{}}
                   submitLabel="Create Account" onSubmit={submitRegistration} onClose={() => setShowRegister(false)} />
      )}
    </div>
  );
}
