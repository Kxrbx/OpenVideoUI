"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Mode = "image" | "video" | "text";

type ModelOption = {
  id: string;
  name: string;
  description: string;
  providerType: string;
};

const LOCAL_STORAGE_KEY = "openvideoui.local-settings";
const FREE_TEXT_MODEL_ID = "openrouter/free";

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Local Creator");
  const [apiKey, setApiKey] = useState("");
  const [mode, setMode] = useState<Mode>("video");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedModels, setSelectedModels] = useState<Partial<Record<Mode, string>>>({});
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);

    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<{
        displayName: string;
        apiKey: string;
        defaultMode: Mode;
        defaultModel: string;
        selectedModels: Partial<Record<Mode, string>>;
      }>;

      if (parsed.displayName) {
        setName(parsed.displayName);
      }

      if (parsed.apiKey) {
        setApiKey(parsed.apiKey);
      }

      if (parsed.defaultMode) {
        setMode(parsed.defaultMode);
      }

      if (parsed.defaultModel) {
        setSelectedModel(parsed.defaultModel);
      }

      if (parsed.selectedModels) {
        setSelectedModels(parsed.selectedModels);
      }
    } catch {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (step !== 3 || !apiKey) {
      return;
    }

    let cancelled = false;

    async function loadModels() {
      setError("");

      const response = await fetch("/api/onboarding/models", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          apiKey,
          type: mode
        })
      });

      const payload = (await response.json()) as {
        data?: ModelOption[];
        error?: string;
      };

      if (cancelled) {
        return;
      }

      if (!response.ok || !payload.data) {
        setModels([]);
        setSelectedModel("");
        setError(payload.error || "Unable to load models.");
        return;
      }

      const nextModels = payload.data;
      setModels(nextModels);
      const preferredModel =
        selectedModels[mode] ||
        (mode === "text" && nextModels.some((model) => model.id === FREE_TEXT_MODEL_ID)
          ? FREE_TEXT_MODEL_ID
          : "");

      const nextSelectedModel = nextModels.some((model) => model.id === preferredModel)
        ? preferredModel
        : nextModels[0]?.id || "";

      setSelectedModel(nextSelectedModel);
      setSelectedModels((current) => ({
        ...current,
        [mode]: nextSelectedModel
      }));
    }

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [apiKey, mode, step]);

  const canContinueFromName = useMemo(() => name.trim().length > 0, [name]);
  const canContinueFromKey = useMemo(() => apiKey.trim().length > 0, [apiKey]);
  const canFinish = Boolean(apiKey.trim() && selectedModel);

  async function completeOnboarding() {
    if (!canFinish) {
      return;
    }

    setError("");

    const sessionResponse = await fetch("/api/session/local", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name
      })
    });

    if (!sessionResponse.ok) {
      setError("Unable to start the local session.");
      return;
    }

    const syncResponse = await fetch("/api/models/sync", {
      method: "POST",
      headers: {
        "x-openrouter-key": apiKey
      }
    });

    if (!syncResponse.ok) {
      const payload = (await syncResponse.json().catch(() => ({}))) as { error?: string };
      setError(payload.error || "Unable to sync OpenRouter models.");
      return;
    }

    window.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        displayName: name.trim(),
        apiKey,
        defaultMode: mode,
        defaultModel: selectedModel,
        selectedModels
      })
    );

    router.push("/");
    router.refresh();
  }

  return (
    <main className="setup-shell">
      <div className="setup-backdrop" />
      <section className="setup-stage">
        <div className="setup-progress">
          <span className={step >= 0 ? "setup-progress-step active" : "setup-progress-step"} />
          <span className={step >= 1 ? "setup-progress-step active" : "setup-progress-step"} />
          <span className={step >= 2 ? "setup-progress-step active" : "setup-progress-step"} />
          <span className={step >= 3 ? "setup-progress-step active" : "setup-progress-step"} />
        </div>

        <div className="setup-panel">
          {step === 0 ? (
            <div className="setup-question">
              <h1>Hello</h1>
              <p>
                This local app connects directly to OpenRouter and keeps the
                surface focused on generation, not chat.
              </p>
              <button className="button" onClick={() => setStep(1)} type="button">
                <span>Continue</span>
                <ArrowRight aria-hidden="true" size={15} strokeWidth={2} />
              </button>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="setup-question">
              <h1>Your name</h1>
              <p>
                Choose the name this local studio should use for you. You can
                change it later in settings.
              </p>
              <div className="setup-field">
                <label htmlFor="display-name">Display name</label>
                <input
                  id="display-name"
                  placeholder="Local Creator"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="setup-actions">
                <button className="button-secondary" onClick={() => setStep(0)} type="button">
                  <ArrowLeft aria-hidden="true" size={15} strokeWidth={2} />
                  <span>Back</span>
                </button>
                <button
                  className="button"
                  disabled={!canContinueFromName}
                  onClick={() => setStep(2)}
                  type="button"
                >
                  <span>Continue</span>
                  <ArrowRight aria-hidden="true" size={15} strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="setup-question">
              <h1>OpenRouter key</h1>
              <p>
                Paste your OpenRouter API key. It stays local to this app
                session flow and powers model discovery and generation.
              </p>
              <div className="setup-field">
                <label htmlFor="openrouter-key">API key</label>
                <input
                  id="openrouter-key"
                  placeholder="sk-or-v1-..."
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </div>
              <div className="setup-actions">
                <button className="button-secondary" onClick={() => setStep(1)} type="button">
                  <ArrowLeft aria-hidden="true" size={15} strokeWidth={2} />
                  <span>Back</span>
                </button>
                <button
                  className="button"
                  disabled={!canContinueFromKey}
                  onClick={() => setStep(3)}
                  type="button"
                >
                  <span>Continue</span>
                  <ArrowRight aria-hidden="true" size={15} strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="setup-question">
              <h1>Default model</h1>
              <p>
                Choose the mode first, then pick the default model for your
                first run.
              </p>

              <div className="setup-mode-switch">
                {(["image", "video", "text"] as Mode[]).map((value) => (
                  <button
                    key={value}
                    className={mode === value ? "mode-chip active" : "mode-chip"}
                    onClick={() => setMode(value)}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>

              <div className="setup-field">
                <label htmlFor="default-model">Model</label>
                <select
                  id="default-model"
                  value={selectedModel}
                  onChange={(event) => {
                    const nextSelectedModel = event.target.value;
                    setSelectedModel(nextSelectedModel);
                    setSelectedModels((current) => ({
                      ...current,
                      [mode]: nextSelectedModel
                    }));
                  }}
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="setup-model-note">
                {models.find((model) => model.id === selectedModel)?.description ||
                  "Loading model information..."}
              </div>

              <div className="setup-actions">
                <button className="button-secondary" onClick={() => setStep(2)} type="button">
                  <ArrowLeft aria-hidden="true" size={15} strokeWidth={2} />
                  <span>Back</span>
                </button>
                <button
                  className="button"
                  disabled={!canFinish || isPending}
                  onClick={() =>
                    startTransition(() => {
                      void completeOnboarding();
                    })
                  }
                  type="button"
                >
                  <span>Enter app</span>
                  <ArrowRight aria-hidden="true" size={15} strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : null}

          {error ? <div className="setup-error">{error}</div> : null}
        </div>
      </section>
    </main>
  );
}
