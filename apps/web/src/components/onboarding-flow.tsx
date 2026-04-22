"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Image,
  KeyRound,
  Type as TypeIcon,
  User,
  Video,
  WandSparkles
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
const SETUP_STEPS = [
  {
    label: "Welcome",
    eyebrow: "Local setup",
    title: "Set up OpenVideoUI",
    summary: "Set your profile, connect OpenRouter, and choose how OpenVideoUI should start."
  },
  {
    label: "Profile",
    eyebrow: "Your workspace",
    title: "Name this local studio",
    summary: "This is only used for the greeting and local session in this browser."
  },
  {
    label: "OpenRouter",
    eyebrow: "Model access",
    title: "Add your OpenRouter key",
    summary: "The key powers model discovery and generation from your local OpenVideoUI setup."
  },
  {
    label: "Default",
    eyebrow: "First run",
    title: "Choose your starting model",
    summary: "Pick the mode and model the studio should use when you enter for the first time."
  }
] as const;
const MODE_OPTIONS: { id: Mode; label: string; description: string }[] = [
  {
    id: "video",
    label: "Video",
    description: "Motion prompts and image-guided clips."
  },
  {
    id: "image",
    label: "Image",
    description: "Still frames, references, and concept work."
  },
  {
    id: "text",
    label: "Text",
    description: "A lightweight assistant thread for drafts."
  }
];

function SetupModeIcon({ mode }: { mode: Mode }) {
  if (mode === "image") {
    return <Image aria-hidden="true" size={18} strokeWidth={1.9} />;
  }

  if (mode === "video") {
    return <Video aria-hidden="true" size={18} strokeWidth={1.9} />;
  }

  return <TypeIcon aria-hidden="true" size={18} strokeWidth={1.9} />;
}

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
  const [isSubmitting, setIsSubmitting] = useState(false);

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

      let response: Response;

      try {
        response = await fetch("/api/onboarding/models", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            apiKey,
            type: mode
          })
        });
      } catch {
        if (!cancelled) {
          setModels([]);
          setSelectedModel("");
          setError("Unable to reach OpenRouter model discovery.");
        }

        return;
      }

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
  const activeStep = SETUP_STEPS[step];
  const selectedModelOption = useMemo(
    () => models.find((model) => model.id === selectedModel) || null,
    [models, selectedModel]
  );
  const isLoadingModels = step === 3 && Boolean(apiKey.trim()) && models.length === 0 && !error;

  async function completeOnboarding() {
    if (!canFinish || isSubmitting) {
      return;
    }

    setError("");
    setIsSubmitting(true);
    const trimmedName = name.trim();
    const finalSelectedModels = {
      ...selectedModels,
      [mode]: selectedModel
    };

    try {
      const sessionResponse = await fetch("/api/session/local", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: trimmedName
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
          displayName: trimmedName,
          apiKey,
          defaultMode: mode,
          defaultModel: selectedModel,
          selectedModels: finalSelectedModels
        })
      );

      router.push("/");
      router.refresh();
    } catch {
      setError("Setup could not finish. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="setup-shell">
      <div className="setup-backdrop" />
      <section className="setup-stage" aria-labelledby="setup-title">
        <aside className="setup-rail" aria-label="Setup progress">
          <div className="setup-brand-lockup">
            <div className="setup-brand-mark">
              <WandSparkles aria-hidden="true" size={17} strokeWidth={1.9} />
            </div>
            <div>
              <div className="setup-brand-name">OpenVideoUI</div>
              <div className="setup-brand-subtitle">Local generation studio</div>
            </div>
          </div>

          <div className="setup-rail-copy">
            <span>{activeStep.eyebrow}</span>
            <h2>{activeStep.title}</h2>
            <p>{activeStep.summary}</p>
          </div>

          <ol className="setup-step-list">
            {SETUP_STEPS.map((setupStep, index) => (
              <li
                aria-current={index === step ? "step" : undefined}
                className={[
                  "setup-step-item",
                  index === step ? "active" : "",
                  index < step ? "complete" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={setupStep.label}
              >
                <span className="setup-step-index">
                  {index < step ? <Check aria-hidden="true" size={14} strokeWidth={2.2} /> : index + 1}
                </span>
                <span>
                  <strong>{setupStep.label}</strong>
                  <small>{setupStep.eyebrow}</small>
                </span>
              </li>
            ))}
          </ol>

          <div className="setup-privacy-card">
            <KeyRound aria-hidden="true" size={17} strokeWidth={1.9} />
            <span>Your key is saved in this browser's local OpenVideoUI settings.</span>
          </div>
        </aside>

        <section className="setup-panel">
          <div className="setup-panel-head">
            <span>{activeStep.eyebrow}</span>
            <span>
              {step + 1} / {SETUP_STEPS.length}
            </span>
          </div>

          <div className="setup-progress" aria-hidden="true">
            {SETUP_STEPS.map((setupStep, index) => (
              <span
                className={index <= step ? "setup-progress-step active" : "setup-progress-step"}
                key={setupStep.label}
              />
            ))}
          </div>

          {step === 0 ? (
            <div className="setup-question setup-question-welcome">
              <div className="setup-icon-badge">
                <WandSparkles aria-hidden="true" size={22} strokeWidth={1.8} />
              </div>
              <h1 id="setup-title">Set up OpenVideoUI</h1>
              <p>
                This quick setup connects OpenRouter, saves your defaults, and opens OpenVideoUI.
              </p>
              <div className="setup-preview-grid" aria-label="Setup overview">
                <div>
                  <strong>Private by default</strong>
                  <span>Local settings stay in this browser.</span>
                </div>
                <div>
                  <strong>Mode-aware</strong>
                  <span>Image, video, and text models stay separate.</span>
                </div>
                <div>
                  <strong>Ready fast</strong>
                  <span>Sync models once, then start creating.</span>
                </div>
              </div>
              <button className="button" onClick={() => setStep(1)} type="button">
                <span>Start setup</span>
                <ArrowRight aria-hidden="true" size={15} strokeWidth={2} />
              </button>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="setup-question">
              <div className="setup-icon-badge">
                <User aria-hidden="true" size={21} strokeWidth={1.8} />
              </div>
              <h1 id="setup-title">What should we call you?</h1>
              <p>
                Pick a display name for the greeting and your local session. You can change it
                later in settings.
              </p>
              <div className="setup-field">
                <label htmlFor="display-name">Display name</label>
                <input
                  autoComplete="name"
                  id="display-name"
                  placeholder="Local Creator"
                  onChange={(event) => setName(event.target.value)}
                  value={name}
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
              <div className="setup-icon-badge">
                <KeyRound aria-hidden="true" size={21} strokeWidth={1.8} />
              </div>
              <h1 id="setup-title">Connect OpenRouter</h1>
              <p>
                Paste an API key so OpenVideoUI can load models and submit generations from this
                machine.
              </p>
              <div className="setup-field">
                <label htmlFor="openrouter-key">API key</label>
                <input
                  autoComplete="off"
                  id="openrouter-key"
                  inputMode="text"
                  placeholder="sk-or-v1-..."
                  onChange={(event) => setApiKey(event.target.value)}
                  spellCheck={false}
                  type="password"
                  value={apiKey}
                />
              </div>
              <div className="setup-note-card">
                <KeyRound aria-hidden="true" size={16} strokeWidth={1.9} />
                <span>Stored locally after setup so the studio can sync and generate.</span>
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
              <div className="setup-icon-badge">
                <Video aria-hidden="true" size={21} strokeWidth={1.8} />
              </div>
              <h1 id="setup-title">Choose a default model</h1>
              <p>Set the mode and model the studio should open with first.</p>

              <div className="setup-mode-switch" role="radiogroup" aria-label="Default mode">
                {MODE_OPTIONS.map((option) => (
                  <button
                    aria-checked={mode === option.id}
                    className={mode === option.id ? "setup-mode-card active" : "setup-mode-card"}
                    key={option.id}
                    onClick={() => setMode(option.id)}
                    role="radio"
                    type="button"
                  >
                    <span className="setup-mode-icon">
                      <SetupModeIcon mode={option.id} />
                    </span>
                    <span className="setup-mode-copy">
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                    <span className="setup-mode-check">
                      <Check aria-hidden="true" size={13} strokeWidth={2.2} />
                    </span>
                  </button>
                ))}
              </div>

              <div className="setup-field">
                <label htmlFor="default-model">Model</label>
                <select
                  disabled={!models.length}
                  id="default-model"
                  onChange={(event) => {
                    const nextSelectedModel = event.target.value;
                    setSelectedModel(nextSelectedModel);
                    setSelectedModels((current) => ({
                      ...current,
                      [mode]: nextSelectedModel
                    }));
                  }}
                  value={selectedModel}
                >
                  {!models.length ? (
                    <option value="">
                      {isLoadingModels ? "Loading models..." : "No models available"}
                    </option>
                  ) : null}
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={isLoadingModels ? "setup-model-card loading" : "setup-model-card"}>
                {isLoadingModels ? (
                  <>
                    <span className="setup-skeleton wide" />
                    <span className="setup-skeleton" />
                  </>
                ) : selectedModelOption ? (
                  <>
                    <strong>{selectedModelOption.name}</strong>
                    <span>{selectedModelOption.description}</span>
                  </>
                ) : (
                  <span>Model choices will appear here once OpenRouter responds.</span>
                )}
              </div>

              <div className="setup-actions">
                <button className="button-secondary" onClick={() => setStep(2)} type="button">
                  <ArrowLeft aria-hidden="true" size={15} strokeWidth={2} />
                  <span>Back</span>
                </button>
                <button
                  className="button"
                  disabled={!canFinish || isSubmitting}
                  onClick={() => void completeOnboarding()}
                  type="button"
                >
                  <span>{isSubmitting ? "Entering..." : "Enter app"}</span>
                  <ArrowRight aria-hidden="true" size={15} strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="setup-error" role="alert">
              {error}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
