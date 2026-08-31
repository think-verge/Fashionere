import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";

type Role = "designer" | "retail_chain";

const RUNWAY_SOURCES = ["vogue", "balenciaga", "prada", "burberry", "dior"];
const RETAIL_SOURCES = ["hm", "zara", "mango", "uniqlo", "cos"];
const GARMENT_TYPES = ["jacket", "dress", "trousers", "shirt", "coat", "skirt", "knitwear", "accessories"];

type Step = "role" | "sources" | "garments" | "account";

export default function OnboardingPage() {
  const { signup } = useAuth();
  const nav = useNavigate();

  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<Role | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedGarments, setSelectedGarments] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sourceOptions = role === "retail_chain" ? RETAIL_SOURCES : RUNWAY_SOURCES;

  const toggleSource = (s: string) =>
    setSelectedSources((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const toggleGarment = (g: string) =>
    setSelectedGarments((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password) {
      setError("All fields are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signup({
        name: form.name,
        email: form.email,
        password: form.password,
        role: role!,
        sources: selectedSources,
        garment_interests: selectedGarments,
      });
      nav("/app/looks");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[520px]">

        {/* Progress */}
        <div className="flex gap-1 mb-10">
          {(["role", "sources", "garments", "account"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-[2px] flex-1 transition-colors ${
                ["role", "sources", "garments", "account"].indexOf(step) >= i
                  ? "bg-deep-red"
                  : "bg-raisin/15"
              }`}
            />
          ))}
        </div>

        {/* Step 1 — Role */}
        {step === "role" && (
          <div>
            <p className="eyebrow text-deep-red mb-4">Step 1 of 4</p>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Who are you?</h1>
            <p className="text-raisin/60 text-sm mb-8">This shapes the sources and looks we curate for you.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(["designer", "retail_chain"] as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`border p-6 text-left transition-all ${
                    role === r ? "border-deep-red bg-deep-red/5" : "border-raisin/15 hover:border-raisin/40"
                  }`}
                >
                  <p className="font-semibold text-[15px] mb-1">
                    {r === "designer" ? "Fashion Designer" : "Retail Chain Buyer"}
                  </p>
                  <p className="text-sm text-raisin/60">
                    {r === "designer"
                      ? "Build collections from runway sources. Curate runway looks and generate moodboards."
                      : "Track retail sources like H&M and Zara. Plan range decisions with verified looks."}
                  </p>
                </button>
              ))}
            </div>

            <button
              onClick={() => role && setStep("sources")}
              disabled={!role}
              className="mt-8 w-full bg-raisin text-white text-[12px] font-semibold tracking-[0.18em] uppercase py-3 hover:bg-deep-red transition-colors disabled:opacity-40"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2 — Sources */}
        {step === "sources" && (
          <div>
            <p className="eyebrow text-deep-red mb-4">Step 2 of 4</p>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Pick your sources</h1>
            <p className="text-raisin/60 text-sm mb-8">
              {role === "retail_chain"
                ? "Which retail brands do you want to track?"
                : "Which runway houses do you follow?"}
            </p>

            <div className="flex flex-wrap gap-3">
              {sourceOptions.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSource(s)}
                  className={`px-4 py-2 border text-sm font-medium transition-all ${
                    selectedSources.includes(s)
                      ? "border-deep-red bg-deep-red text-white"
                      : "border-raisin/20 hover:border-raisin/50"
                  }`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setStep("role")} className="px-6 py-3 border border-raisin/20 text-sm hover:border-raisin/50 transition-colors">← Back</button>
              <button
                onClick={() => setStep("garments")}
                className="flex-1 bg-raisin text-white text-[12px] font-semibold tracking-[0.18em] uppercase py-3 hover:bg-deep-red transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Garments */}
        {step === "garments" && (
          <div>
            <p className="eyebrow text-deep-red mb-4">Step 3 of 4</p>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Garment interests</h1>
            <p className="text-raisin/60 text-sm mb-8">Which garment types are you focused on?</p>

            <div className="flex flex-wrap gap-3">
              {GARMENT_TYPES.map((g) => (
                <button
                  key={g}
                  onClick={() => toggleGarment(g)}
                  className={`px-4 py-2 border text-sm font-medium capitalize transition-all ${
                    selectedGarments.includes(g)
                      ? "border-deep-red bg-deep-red text-white"
                      : "border-raisin/20 hover:border-raisin/50"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setStep("sources")} className="px-6 py-3 border border-raisin/20 text-sm hover:border-raisin/50 transition-colors">← Back</button>
              <button
                onClick={() => setStep("account")}
                className="flex-1 bg-raisin text-white text-[12px] font-semibold tracking-[0.18em] uppercase py-3 hover:bg-deep-red transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Account */}
        {step === "account" && (
          <div>
            <p className="eyebrow text-deep-red mb-4">Step 4 of 4</p>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Create your account</h1>
            <p className="text-raisin/60 text-sm mb-8">Your studio is almost ready.</p>

            {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

            <div className="flex flex-col gap-5">
              {(["name", "email", "password"] as const).map((field) => (
                <label key={field} className="flex flex-col gap-2">
                  <span className="eyebrow text-raisin/55">
                    {field === "name" ? "Full name" : field === "email" ? "Email" : "Password"}
                  </span>
                  <input
                    type={field === "email" ? "email" : field === "password" ? "password" : "text"}
                    value={form[field]}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    placeholder={field === "name" ? "Anika Mehra" : field === "email" ? "anika@studio.com" : "Min. 8 characters"}
                    className="w-full bg-transparent border-b border-raisin/20 py-3 text-[15px] outline-none focus:border-deep-red transition-colors placeholder:text-raisin/35"
                  />
                </label>
              ))}
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setStep("garments")} className="px-6 py-3 border border-raisin/20 text-sm hover:border-raisin/50 transition-colors">← Back</button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-raisin text-white text-[12px] font-semibold tracking-[0.18em] uppercase py-3 hover:bg-deep-red transition-colors disabled:opacity-50"
              >
                {loading ? "Creating studio…" : "Launch studio →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
