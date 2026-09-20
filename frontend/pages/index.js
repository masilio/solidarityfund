import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import FormModal from "../components/FormModal";
import api from "../lib/api";


const REGISTER_FIELDS = [
  { name: "contributor_name", label: "Contributor Name", required: true },
  { name: "contributor_type", label: "Type", required: true, type: "select",
    options: ["Government", "NGO", "Company", "Individual"].map((v) => ({ value: v, label: v })) },
  { name: "phone_number", label: "Phone Number" },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "address", label: "Address", type: "textarea" },
  { name: "password", label: "Password", type: "password", required: true },
];

const LOGIN_FIELDS = [
  { name: "email", label: "Email", type: "email", required: true },
  { name: "password", label: "Password", type: "password", required: true },
];

export default function Home() {
  const router = useRouter();
  const { user, ready,login } = useAuth();
  const { notifySuccess, notifyError } = useToast();
  const [showRegister, setShowRegister] = useState(false);
  const [showLogin,setShowLogin] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace("/dashboard");
  }, [ready, user]);

  async function submitRegistration(values) {
    try {
      await api.post("/auth/register", values);
      notifySuccess("Account created — sign in to continue");
      setShowRegister(false);
       setShowLogin(true);
    } catch (err) {
      notifyError(err, "Could not create your account");
    }
  }

  async function checkIn(values) {
    try {
      await login(values.email, values.password);
      notifySuccess("Signed in successfully");
      setShowLogin(false)
    } catch (err) {
      notifyError(err, "Login failed");
    } 
  }

  if (!ready || user) return null;

  return (
    <div className="sf-landing">
      <header className="sf-landing-hero">
        <div className="sf-landing-hero-inner">
          <div className="sf-landing-brand">Social Solidarity Fund</div>
          <h1>Supporting Disaster-Affected Communities. Building Better Lives.</h1>
          <p>
          Connecting contributors and emergency support people to deliver assistance
           quickly, transparently.
          </p>
          <div className="sf-landing-actions">
            <button className="btn btn-sf-accent btn-lg" onClick={() => setShowRegister(true)}>Donate</button>
            <button className="btn btn-lg sf-landing-checkin" onClick={() => setShowLogin(true)}>Check In</button>
          </div>
        </div>
      </header>

     <main className="sf-landing-body">
  <section className="sf-landing-section">
    <h2>About the Fund</h2>
    <p>
      The Social Solidarity Fund supports households affected by disasters and
      emergencies through cash and essential items.
    </p>
  </section>

  <section className="sf-landing-section sf-landing-section-alt">
    <h2>Our Purpose</h2>
    <p>
      We ensure assistance is delivered quickly, transparently, and
      accountably, with every contribution and handover recorded.
    </p>
  </section>

  <section className="sf-landing-section">
    <h2>Who We Serve</h2>
    <div className="row g-3 mt-1">
      <div className="col-md-4">
        <div className="sf-landing-card">
          <h3>Affected Households</h3>
          <p>Receive verified cash or essential item support.</p>
        </div>
      </div>

      <div className="col-md-4">
        <div className="sf-landing-card">
          <h3>Contributors</h3>
          <p>Government, organizations, and individuals provide support.</p>
        </div>
      </div>

      <div className="col-md-4">
        <div className="sf-landing-card">
          <h3>Response Teams</h3>
          <p>Assess needs, manage resources, and deliver assistance.</p>
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

      {showLogin && (
        <FormModal title="Check In " fields={LOGIN_FIELDS} initialValues={{}}
                   submitLabel="Sign In" onSubmit={checkIn} onClose={() => setShowLogin(false)} />
      )}
    </div>
  );
}
