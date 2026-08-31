import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      nav("/app/looks");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-10">
          <p className="eyebrow text-deep-red mb-3">Fashionare</p>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-raisin/60 mt-2 text-sm">Sign in to your studio.</p>
        </div>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@studio.com"
              required
              className="input-base"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="input-base"
            />
          </Field>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-raisin text-white text-[12px] font-semibold tracking-[0.18em] uppercase py-3 hover:bg-deep-red transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-sm text-raisin/60">
          No account?{" "}
          <Link to="/onboarding" className="text-deep-red underline">
            Get early access
          </Link>
        </p>
      </div>

      <style>{`.input-base{width:100%;background:transparent;border-bottom:1px solid rgba(26,26,26,0.2);padding:0.75rem 0;font-size:15px;outline:none;transition:border-color 0.2s}.input-base:focus{border-color:#a93533}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="eyebrow text-raisin/55">{label}</span>
      {children}
    </label>
  );
}
