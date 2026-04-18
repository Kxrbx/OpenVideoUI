"use client";

import dynamic from "next/dynamic";
import {
  Bot,
  Check,
  ChevronDown,
  Folder,
  History,
  House,
  Image,
  KeyRound,
  Link as LinkIcon,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  SendHorizontal,
  Settings2,
  WandSparkles,
  Type as TypeIcon,
  Upload,
  User,
  Video,
  X
} from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

type Mode = "image" | "video" | "text";
type SurfaceState = "idle" | "generating" | "result" | "failed";
type VideoWorkflow = "text-to-video" | "image-to-video";

type Project = {
  id: string;
  title: string;
  description: string | null;
  renderCount: number;
};

type RenderRecord = {
  id: string;
  projectId: string;
  projectTitle?: string;
  modelId: string;
  mediaType: "image" | "video";
  workflowType: "text-to-image" | "text-to-video" | "image-to-video";
  status: "queued" | "submitting" | "processing" | "completed" | "failed" | "canceled";
  prompt: string;
  settings?: Record<string, unknown> | null;
  providerRequest?: Record<string, unknown> | null;
  outputUrls: string[];
  failureMessage: string | null;
  providerJobId: string | null;
};

type ModelOption = {
  id: string;
  modelId?: string;
  name?: string;
  description?: string | null;
  providerType?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  supportedAspectRatios?: string[];
  supportedDurations?: number[];
  supportedResolutions?: string[];
  supportedFrameImages?: string[];
  allowedPassthroughParameters?: string[];
  generateAudio?: boolean | null;
  supportsImageToVideo?: boolean;
  supportsReferenceImages?: boolean;
};

type CurrentResult =
  | {
      kind: "image";
      prompt: string;
      modelId: string;
      src: string;
    }
  | {
      kind: "video";
      prompt: string;
      modelId: string;
      src: string;
    }
  | {
      kind: "text";
      prompt: string;
      modelId: string;
      text: string;
    };

type LocalSettings = {
  apiKey?: string;
  accentPalette?: AccentPaletteId;
  defaultMode?: Mode;
  defaultModel?: string;
  selectedModels?: Partial<Record<Mode, string>>;
  backgroundUrl?: string;
  sidebarCollapsed?: boolean;
  selectedProjectId?: string;
  selectedChatId?: string;
  activeRenderId?: string;
};

type BackgroundSource = {
  origin: "default" | "url" | "file";
  renderAs: "embed" | "video";
  src: string;
  label: string;
};

type GenerationSnapshot = {
  mode: Mode;
  prompt: string;
  projectId: string;
  projectTitle: string;
  modelId: string;
  videoWorkflow: VideoWorkflow;
  aspectRatio: string;
  resolution: string;
  duration: number | null;
  generateAudio: boolean;
  referenceDataUrl: string;
  referenceFileName: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatSession = {
  id: string;
  projectId: string;
  projectTitle?: string;
  title: string;
  modelId: string;
  messages: ChatMessage[];
  updatedAt: string;
};

type AccentPaletteId = "jade" | "dusty-teal" | "muted-sage" | "smoky-lavender" | "warm-sand";

const LOCAL_STORAGE_KEY = "openvideoui.local-settings";
const DEFAULT_BACKGROUND_PAGE_URL = "https://streamable.com/kgv4oa";
const DEFAULT_BACKGROUND_STREAMABLE_EMBED_URL =
  "https://streamable.com/e/kgv4oa?autoplay=1&muted=1&loop=1&nocontrols=1";
const FREE_TEXT_MODEL_ID = "openrouter/free";
const VIDEO_LOADING_LINES = [
  "Shaping the next frames...",
  "Settling motion and timing...",
  "Holding the scene together..."
];
const IMAGE_LOADING_LINES = [
  "Composing the frame...",
  "Balancing light and detail...",
  "Resolving the final look..."
];
const TEXT_LOADING_LINES = [
  "Following the thread...",
  "Composing the next reply...",
  "Refining the response..."
];
const IDLE_TITLES: Record<Mode, string> = {
  image: "Frame something striking.",
  video: "Set a scene in motion.",
  text: "Start a line of thought."
};
const ACCENT_PALETTES: Record<
  AccentPaletteId,
  {
    label: string;
    accent: string;
    accentStrong: string;
    accentRgb: string;
    accentSoftRgb: string;
    focusStrongRgb: string;
    focusSoftRgb: string;
  }
> = {
  jade: {
    label: "Jade",
    accent: "#7fae9a",
    accentStrong: "#679682",
    accentRgb: "127, 174, 154",
    accentSoftRgb: "127, 174, 154",
    focusStrongRgb: "127, 174, 154",
    focusSoftRgb: "127, 174, 154"
  },
  "dusty-teal": {
    label: "Dusty Teal",
    accent: "#6f9fa1",
    accentStrong: "#5a888a",
    accentRgb: "111, 159, 161",
    accentSoftRgb: "111, 159, 161",
    focusStrongRgb: "111, 159, 161",
    focusSoftRgb: "111, 159, 161"
  },
  "muted-sage": {
    label: "Muted Sage",
    accent: "#90a486",
    accentStrong: "#788b6f",
    accentRgb: "144, 164, 134",
    accentSoftRgb: "144, 164, 134",
    focusStrongRgb: "144, 164, 134",
    focusSoftRgb: "144, 164, 134"
  },
  "smoky-lavender": {
    label: "Smoky Lavender",
    accent: "#8d84a6",
    accentStrong: "#746b8d",
    accentRgb: "141, 132, 166",
    accentSoftRgb: "141, 132, 166",
    focusStrongRgb: "141, 132, 166",
    focusSoftRgb: "141, 132, 166"
  },
  "warm-sand": {
    label: "Warm Sand",
    accent: "#b89b6a",
    accentStrong: "#987d4f",
    accentRgb: "184, 155, 106",
    accentSoftRgb: "184, 155, 106",
    focusStrongRgb: "184, 155, 106",
    focusSoftRgb: "184, 155, 106"
  }
};
const DEFAULT_ACCENT_PALETTE: AccentPaletteId = "jade";
const MarkdownMessage = dynamic(
  () => import("./markdown-message").then((module) => module.MarkdownMessage),
  {
    loading: () => <div className="chat-markdown-loading">Rendering response...</div>
  }
);

function inferModeFromRender(render: RenderRecord): Mode {
  if (render.mediaType === "image") {
    return "image";
  }

  return "video";
}

function getDefaultBackgroundSource(): BackgroundSource {
  return {
    origin: "default",
    renderAs: "embed",
    src: DEFAULT_BACKGROUND_STREAMABLE_EMBED_URL,
    label: "Default Streamable background"
  };
}

function resolveBackgroundUrl(value: string): BackgroundSource | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = trimmed.startsWith("/")
      ? new URL(trimmed, window.location.origin)
      : new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname.startsWith("/api/assets/")) {
      return {
        origin: "file",
        renderAs: "video",
        src: trimmed,
        label: "Saved local background"
      };
    }

    if (url.hostname.includes("streamable.com")) {
      const shortcode = parts[0] === "e" ? parts[1] : parts[0];

      if (!shortcode) {
        return null;
      }

      return {
        origin: "url",
        renderAs: "embed",
        src: `https://streamable.com/e/${shortcode}?autoplay=1&muted=1&loop=1&nocontrols=1`,
        label: `Streamable ${shortcode}`
      };
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
      return {
        origin: "url",
        renderAs: "video",
        src: trimmed,
        label: url.hostname
      };
    }
  } catch {
    return null;
  }

  return null;
}

function getSessionGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}

function pickInitialString(options: string[] | undefined, current: string) {
  if (!options?.length) {
    return "";
  }

  return options.includes(current) ? current : options[0];
}

function pickInitialNumber(options: number[] | undefined, current: number | null) {
  if (!options?.length) {
    return null;
  }

  return current !== null && options.includes(current) ? current : options[0];
}

function buildCurrentResultFromRender(render: RenderRecord): CurrentResult | null {
  if (render.status !== "completed" || render.outputUrls.length === 0) {
    return null;
  }

  if (render.mediaType === "image") {
    return {
      kind: "image",
      prompt: render.prompt,
      modelId: render.modelId,
      src: render.outputUrls[0]
    };
  }

  return {
    kind: "video",
    prompt: render.prompt,
    modelId: render.modelId,
    src: render.outputUrls[0]
  };
}

function ModeGlyph({ mode }: { mode: Mode }) {
  if (mode === "image") {
    return <Image aria-hidden="true" size={14} strokeWidth={1.9} />;
  }

  if (mode === "video") {
    return <Video aria-hidden="true" size={14} strokeWidth={1.9} />;
  }

  return <TypeIcon aria-hidden="true" size={14} strokeWidth={1.9} />;
}

function readStringSetting(
  settings: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = settings?.[key];
  return typeof value === "string" ? value : "";
}

function readNumberSetting(
  settings: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = settings?.[key];
  return typeof value === "number" ? value : null;
}

function readBooleanSetting(
  settings: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = settings?.[key];
  return value === true;
}

function readReferenceDataUrl(
  providerRequest: Record<string, unknown> | null | undefined
) {
  const frameImages = providerRequest?.frame_images;

  if (Array.isArray(frameImages)) {
    const firstFrame = frameImages[0];

    if (
      firstFrame &&
      typeof firstFrame === "object" &&
      "image_url" in firstFrame &&
      firstFrame.image_url &&
      typeof firstFrame.image_url === "object" &&
      "url" in firstFrame.image_url &&
      typeof firstFrame.image_url.url === "string"
    ) {
      return firstFrame.image_url.url;
    }
  }

  const inputReferences = providerRequest?.input_references;

  if (Array.isArray(inputReferences)) {
    const firstReference = inputReferences[0];

    if (
      firstReference &&
      typeof firstReference === "object" &&
      "image_url" in firstReference &&
      firstReference.image_url &&
      typeof firstReference.image_url === "object" &&
      "url" in firstReference.image_url &&
      typeof firstReference.image_url.url === "string"
    ) {
      return firstReference.image_url.url;
    }
  }

  return "";
}

export function StudioApp({
  initialChatSessions,
  projects,
  recentRenders,
  sessionName
}: {
  initialChatSessions: ChatSession[];
  projects: Project[];
  recentRenders: RenderRecord[];
  sessionName: string;
}) {
  const [projectList, setProjectList] = useState(projects);
  const [renderHistory, setRenderHistory] = useState(recentRenders);
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || "");
  const [mode, setMode] = useState<Mode>("video");
  const [videoWorkflow, setVideoWorkflow] = useState<VideoWorkflow>("text-to-video");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedModelsByMode, setSelectedModelsByMode] = useState<
    Partial<Record<Mode, string>>
  >({});
  const [prompt, setPrompt] = useState("");
  const [surfaceState, setSurfaceState] = useState<SurfaceState>(
    recentRenders[0]?.status === "completed" ? "result" : "idle"
  );
  const [apiKey, setApiKey] = useState("");
  const [statusLabel, setStatusLabel] = useState("Ready");
  const [aspectRatio, setAspectRatio] = useState("");
  const [resolution, setResolution] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [generateAudio, setGenerateAudio] = useState(false);
  const [referenceDataUrl, setReferenceDataUrl] = useState("");
  const [referenceFileName, setReferenceFileName] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [displayName, setDisplayName] = useState(sessionName);
  const [settingsApiKey, setSettingsApiKey] = useState("");
  const [settingsDisplayName, setSettingsDisplayName] = useState(sessionName);
  const [accentPalette, setAccentPalette] = useState<AccentPaletteId>(DEFAULT_ACCENT_PALETTE);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [loadingLineIndex, setLoadingLineIndex] = useState(0);
  const [sessionGreeting, setSessionGreeting] = useState("");
  const [backgroundSourceMode, setBackgroundSourceMode] = useState<"link" | "file">("link");
  const [backgroundUrlInput, setBackgroundUrlInput] = useState(DEFAULT_BACKGROUND_PAGE_URL);
  const [backgroundSource, setBackgroundSource] = useState<BackgroundSource>(() =>
    getDefaultBackgroundSource()
  );
  const [activeRender, setActiveRender] = useState<RenderRecord | null>(recentRenders[0] || null);
  const [chatSessions, setChatSessions] = useState(initialChatSessions);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [isTextResponding, setIsTextResponding] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [currentResult, setCurrentResult] = useState<CurrentResult | null>(() => {
    const latest = recentRenders.find(
      (render) => render.status === "completed" && render.outputUrls.length > 0
    );

    return latest ? buildCurrentResultFromRender(latest) : null;
  });
  const [error, setError] = useState("");
  const localFileUrlRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textChatViewportRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const deferredPrompt = useDeferredValue(prompt);
  const settingsTitleId = "studio-settings-title";

  useEffect(() => {
    setProjectList(projects);
  }, [projects]);

  useEffect(() => {
    setRenderHistory(recentRenders);
  }, [recentRenders]);

  useEffect(() => {
    setActiveRender(recentRenders[0] || null);
  }, [recentRenders]);

  useEffect(() => {
    setChatSessions(initialChatSessions);
  }, [initialChatSessions]);

  useEffect(() => {
    if (!projectList.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projectList[0]?.id || "");
    }
  }, [projectList, selectedProjectId]);

  useEffect(() => {
    setSessionGreeting(getSessionGreeting());
  }, []);

  useEffect(() => {
    if (surfaceState !== "generating") {
      setLoadingLineIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingLineIndex((current) => current + 1);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [mode, surfaceState]);

  useEffect(() => {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);

    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as LocalSettings;

      if (parsed.apiKey) {
        setApiKey(parsed.apiKey);
      }

      if (parsed.accentPalette && parsed.accentPalette in ACCENT_PALETTES) {
        setAccentPalette(parsed.accentPalette);
      }

      if (parsed.defaultMode) {
        setMode(parsed.defaultMode);
      } else if (recentRenders[0]) {
        setMode(inferModeFromRender(recentRenders[0]));
      }

      if (parsed.defaultModel) {
        setSelectedModel(parsed.defaultModel);
      }

      if (parsed.selectedModels) {
        setSelectedModelsByMode(parsed.selectedModels);
      }

      if (parsed.backgroundUrl) {
        const nextBackgroundSource = resolveBackgroundUrl(parsed.backgroundUrl);

        if (nextBackgroundSource) {
          setBackgroundSource(nextBackgroundSource);
          setBackgroundUrlInput(parsed.backgroundUrl);
        }
      }

      if (typeof parsed.sidebarCollapsed === "boolean") {
        setIsSidebarCollapsed(parsed.sidebarCollapsed);
      }

      if (parsed.selectedProjectId) {
        setSelectedProjectId(parsed.selectedProjectId);
      }

      const persistedChat = parsed.selectedChatId
        ? initialChatSessions.find((chat) => chat.id === parsed.selectedChatId)
        : null;

      if (persistedChat) {
        setSelectedChatId(persistedChat.id);
        setSelectedProjectId(persistedChat.projectId);
        setMode("text");
        setSelectedModel(persistedChat.modelId);
        setSelectedModelsByMode((current) => ({
          ...current,
          text: persistedChat.modelId
        }));
        setSurfaceState(persistedChat.messages.length > 0 ? "result" : "idle");
      } else if (parsed.activeRenderId) {
        const persistedRender = recentRenders.find((render) => render.id === parsed.activeRenderId);

        if (persistedRender) {
          setActiveRender(persistedRender);
          setSelectedProjectId(persistedRender.projectId);
          setMode(inferModeFromRender(persistedRender));
          setSelectedModel(persistedRender.modelId);
          setSelectedModelsByMode((current) => ({
            ...current,
            [inferModeFromRender(persistedRender)]: persistedRender.modelId
          }));

          const restoredResult = buildCurrentResultFromRender(persistedRender);

          if (restoredResult) {
            setCurrentResult(restoredResult);
            setSurfaceState("result");
            setStatusLabel(
              persistedRender.mediaType === "image" ? "Image ready" : "Video ready"
            );
          } else if (persistedRender.status === "failed") {
            setCurrentResult(null);
            setSurfaceState("failed");
            setStatusLabel("Generation failed");
          } else {
            setCurrentResult(null);
            setSurfaceState("generating");
            setStatusLabel(
              persistedRender.status === "submitting" ? "Submitting" : "Generating video"
            );
          }
        }
      }
    } catch {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, [initialChatSessions, recentRenders]);

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      setError("");

      if (mode === "text") {
        if (!apiKey) {
          setModels([]);
          setSelectedModel("");
          return;
        }

        const response = await fetch("/api/onboarding/models", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            apiKey,
            type: "text"
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
          selectedModelsByMode.text ||
          (nextModels.some((model) => model.id === FREE_TEXT_MODEL_ID) ? FREE_TEXT_MODEL_ID : "");
        const nextSelectedModel = nextModels.some((model) => model.id === preferredModel)
          ? preferredModel
          : nextModels[0]?.id || "";
        setSelectedModel(nextSelectedModel);
        setSelectedModelsByMode((current) =>
          current.text === nextSelectedModel ? current : { ...current, text: nextSelectedModel }
        );
        return;
      }

      const response = await fetch(`/api/models?type=${mode}`);
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
      const preferredModel = selectedModelsByMode[mode] || "";
      const nextSelectedModel = nextModels.some((model) => model.id === preferredModel)
        ? preferredModel
        : nextModels[0]?.id || "";
      setSelectedModel(nextSelectedModel);
      setSelectedModelsByMode((current) =>
        current[mode] === nextSelectedModel ? current : { ...current, [mode]: nextSelectedModel }
      );
    }

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [apiKey, mode]);

  useEffect(() => {
    return () => {
      if (localFileUrlRef.current) {
        URL.revokeObjectURL(localFileUrlRef.current);
      }

      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    setSettingsApiKey(apiKey);
    setSettingsDisplayName(displayName);
    setSettingsNotice("");

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [apiKey, displayName, isSettingsOpen]);

  useEffect(() => {
    if (!textChatViewportRef.current) {
      return;
    }

    textChatViewportRef.current.scrollTop = textChatViewportRef.current.scrollHeight;
  }, [chatSessions, selectedChatId, isTextResponding]);

  useEffect(() => {
    if (!isModelMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsModelMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModelMenuOpen]);

  const selectedProject = useMemo(
    () => projectList.find((project) => project.id === selectedProjectId) || projectList[0] || null,
    [projectList, selectedProjectId]
  );

  const selectedModelOption = useMemo(
    () => models.find((model) => model.id === selectedModel) || null,
    [models, selectedModel]
  );
  const canCreateProject = newProjectTitle.trim().length > 0;
  const canSaveSettingsKey = settingsApiKey.trim().length > 0 && !isSavingSettings;
  const canSaveDisplayName = settingsDisplayName.trim().length > 0 && !isSavingSettings;
  const canApplyBackgroundLink = backgroundUrlInput.trim().length > 0;

  const visibleHistory = useMemo(
    () => renderHistory.filter((render) => render.projectId === selectedProjectId).slice(0, 8),
    [renderHistory, selectedProjectId]
  );
  const visibleChatSessions = useMemo(
    () =>
      chatSessions
        .filter((chat) => chat.projectId === selectedProjectId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 12),
    [chatSessions, selectedProjectId]
  );
  const selectedChat = useMemo(
    () => chatSessions.find((chat) => chat.id === selectedChatId) || null,
    [chatSessions, selectedChatId]
  );

  const canUseImageGuidance = Boolean(
    mode === "video" &&
      selectedModelOption &&
      (selectedModelOption.supportsImageToVideo || selectedModelOption.supportsReferenceImages)
  );

  const imageGuidanceMode =
    canUseImageGuidance && videoWorkflow === "image-to-video" ? "image-to-video" : "text-to-video";
  const hasTextConversation = Boolean(
    mode === "text" && ((selectedChat?.messages.length ?? 0) > 0 || isTextResponding)
  );
  const keepTextBackgroundVisible = hasTextConversation;
  const loadingLines =
    mode === "text"
      ? TEXT_LOADING_LINES
      : mode === "image"
        ? IMAGE_LOADING_LINES
        : VIDEO_LOADING_LINES;
  const activeLoadingLine = loadingLines[loadingLineIndex % loadingLines.length];
  const idleTitle = IDLE_TITLES[mode];
  const canSubmit =
    Boolean(selectedProject && selectedModel && prompt.trim()) &&
    (mode !== "text" || !isTextResponding);

  useEffect(() => {
    if (mode !== "video") {
      return;
    }

    if (!canUseImageGuidance && videoWorkflow === "image-to-video") {
      setVideoWorkflow("text-to-video");
      setReferenceDataUrl("");
      setReferenceFileName("");
    }
  }, [canUseImageGuidance, mode, videoWorkflow]);

  useEffect(() => {
    if (mode !== "video" || !selectedModelOption) {
      setAspectRatio("");
      setResolution("");
      setDuration(null);
      setGenerateAudio(false);
      return;
    }

    setAspectRatio((current) =>
      pickInitialString(selectedModelOption.supportedAspectRatios, current)
    );
    setResolution((current) =>
      pickInitialString(selectedModelOption.supportedResolutions, current)
    );
    setDuration((current) =>
      pickInitialNumber(selectedModelOption.supportedDurations, current)
    );
    setGenerateAudio(selectedModelOption.generateAudio === true);
  }, [mode, selectedModelOption]);

  function clearPollTimer() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function buildSnapshotFromComposer(): GenerationSnapshot | null {
    if (!selectedProject) {
      return null;
    }

    return {
      mode,
      prompt,
      projectId: selectedProject.id,
      projectTitle: selectedProject.title,
      modelId: selectedModel,
      videoWorkflow,
      aspectRatio,
      resolution,
      duration,
      generateAudio,
      referenceDataUrl,
      referenceFileName
    };
  }

  function buildSnapshotFromRender(render: RenderRecord): GenerationSnapshot {
    const projectTitle =
      projectList.find((project) => project.id === render.projectId)?.title ||
      render.projectTitle ||
      "Project";

    return {
      mode: inferModeFromRender(render),
      prompt: render.prompt,
      projectId: render.projectId,
      projectTitle,
      modelId: render.modelId,
      videoWorkflow:
        render.workflowType === "image-to-video" ? "image-to-video" : "text-to-video",
      aspectRatio: readStringSetting(render.settings, "aspectRatio"),
      resolution: readStringSetting(render.settings, "resolution"),
      duration: readNumberSetting(render.settings, "duration"),
      generateAudio: readBooleanSetting(render.settings, "generateAudio"),
      referenceDataUrl: readReferenceDataUrl(render.providerRequest),
      referenceFileName:
        render.workflowType === "image-to-video" ? "Saved reference image" : ""
    };
  }

  function applySnapshotToComposer(snapshot: GenerationSnapshot) {
    setMode(snapshot.mode);
    setPrompt(snapshot.prompt);
    setSelectedProjectId(snapshot.projectId);
    setSelectedModel(snapshot.modelId);
    setSelectedModelsByMode((current) => ({
      ...current,
      [snapshot.mode]: snapshot.modelId
    }));
    setVideoWorkflow(snapshot.videoWorkflow);
    setAspectRatio(snapshot.aspectRatio);
    setResolution(snapshot.resolution);
    setDuration(snapshot.duration);
    setGenerateAudio(snapshot.generateAudio);
    setReferenceDataUrl(snapshot.referenceDataUrl);
    setReferenceFileName(snapshot.referenceFileName);
  }

  function writeLocalSettings(update: (current: LocalSettings) => LocalSettings) {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);

    try {
      const current = raw ? (JSON.parse(raw) as LocalSettings) : {};
      const next = update(current);
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
    } catch {
      const next = update({});
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
    }
  }

  useEffect(() => {
    if (Object.keys(selectedModelsByMode).length === 0) {
      return;
    }

    writeLocalSettings((current) => ({
      ...current,
      selectedModels: selectedModelsByMode
    }));
  }, [selectedModelsByMode]);

  useEffect(() => {
    writeLocalSettings((current) => ({
      ...current,
      accentPalette,
      defaultMode: mode,
      selectedProjectId: selectedProjectId || undefined,
      selectedChatId: selectedChatId || undefined,
      activeRenderId: activeRender?.id || undefined
    }));
  }, [accentPalette, activeRender?.id, mode, selectedChatId, selectedProjectId]);

  useEffect(() => {
    const palette = ACCENT_PALETTES[accentPalette];
    const root = document.documentElement;

    root.style.setProperty("--accent", palette.accent);
    root.style.setProperty("--accent-strong", palette.accentStrong);
    root.style.setProperty("--accent-rgb", palette.accentRgb);
    root.style.setProperty("--accent-soft", `rgba(${palette.accentSoftRgb}, 0.18)`);
    root.style.setProperty(
      "--focus-ring",
      `0 0 0 1px rgba(${palette.focusStrongRgb}, 0.38), 0 0 0 4px rgba(${palette.focusSoftRgb}, 0.16)`
    );
  }, [accentPalette]);

  function clearLocalFileUrl() {
    if (localFileUrlRef.current) {
      URL.revokeObjectURL(localFileUrlRef.current);
      localFileUrlRef.current = null;
    }
  }

  function applyBackgroundUrl() {
    setSettingsNotice("");
    const nextBackgroundSource = resolveBackgroundUrl(backgroundUrlInput);

    if (!nextBackgroundSource) {
      setError("Use a valid Streamable link or a direct video URL.");
      return;
    }

    clearLocalFileUrl();
    setError("");
    setBackgroundSource(nextBackgroundSource);
    setSettingsNotice("Backdrop updated.");
    writeLocalSettings((current) => ({
      ...current,
      backgroundUrl: backgroundUrlInput.trim()
    }));
  }

  function resetBackgroundSource() {
    clearLocalFileUrl();
    setBackgroundSource(getDefaultBackgroundSource());
    setBackgroundSourceMode("link");
    setBackgroundUrlInput(DEFAULT_BACKGROUND_PAGE_URL);
    setError("");
    writeLocalSettings((current) => {
      const next = { ...current };
      delete next.backgroundUrl;
      return next;
    });
    setSettingsNotice("Default backdrop restored.");
  }

  function handleBackgroundFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      if (typeof reader.result !== "string") {
        setError("Unable to read the background video.");
        return;
      }

      setIsSavingSettings(true);
      setSettingsNotice("");
      setError("");

      const response = await fetch("/api/backgrounds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fileName: file.name,
          source: reader.result
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        data?: {
          publicUrl: string;
          fileName: string;
        };
        error?: string;
      };

      if (!response.ok || !payload.data) {
        setError(payload.error || "Unable to save the background video.");
        setIsSavingSettings(false);
        return;
      }

      clearLocalFileUrl();
      setBackgroundSourceMode("file");
      setBackgroundSource({
        origin: "file",
        renderAs: "video",
        src: payload.data.publicUrl,
        label: payload.data.fileName
      });
      writeLocalSettings((current) => ({
        ...current,
        backgroundUrl: payload.data!.publicUrl
      }));
      setSettingsNotice("Local backdrop saved on this machine.");
      setIsSavingSettings(false);
    };

    reader.onerror = () => {
      setError("Unable to read the background video.");
    };

    reader.readAsDataURL(file);
  }

  async function saveOpenRouterKey() {
    const trimmedKey = settingsApiKey.trim();

    if (!trimmedKey) {
      setError("OpenRouter API key is required.");
      setSettingsNotice("");
      return;
    }

    setIsSavingSettings(true);
    setError("");
    setSettingsNotice("");

    const response = await fetch("/api/models/sync", {
      method: "POST",
      headers: {
        "x-openrouter-key": trimmedKey
      }
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      imageModelsSynced?: number;
      videoModelsSynced?: number;
    };

    if (!response.ok) {
      setError(payload.error || "Unable to sync OpenRouter models.");
      setIsSavingSettings(false);
      return;
    }

    writeLocalSettings((current) => ({
      ...current,
      apiKey: trimmedKey,
      selectedModels: selectedModelsByMode
    }));
    setApiKey(trimmedKey);
    setSettingsNotice(
      `Studio keyed in. Synced ${payload.imageModelsSynced ?? 0} image models and ${
        payload.videoModelsSynced ?? 0
      } video models.`
    );
    setIsSavingSettings(false);
  }

  async function saveDisplayName() {
    const trimmedName = settingsDisplayName.trim();

    if (!trimmedName) {
      setError("Name is required.");
      setSettingsNotice("");
      return;
    }

    setIsSavingSettings(true);
    setError("");
    setSettingsNotice("");

    const response = await fetch("/api/session/local/name", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: trimmedName
      })
    });

    const payload = (await response.json().catch(() => ({}))) as {
      data?: {
        name: string;
      };
      error?: string;
    };

    if (!response.ok || !payload.data) {
      setError(payload.error || "Unable to update the name.");
      setIsSavingSettings(false);
      return;
    }

    setDisplayName(payload.data.name);
    setSettingsDisplayName(payload.data.name);
    setSettingsNotice("Name updated.");
    setIsSavingSettings(false);
  }

  function handleReferenceFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError("Unable to read the reference image.");
        return;
      }

      setReferenceDataUrl(reader.result);
      setReferenceFileName(file.name);
      setError("");
    };

    reader.onerror = () => {
      setError("Unable to read the reference image.");
    };

    reader.readAsDataURL(file);
  }

  function updateProjectRenderCount(projectId: string, delta: number) {
    setProjectList((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              renderCount: Math.max(0, project.renderCount + delta)
            }
          : project
      )
    );
  }

  function buildChatTitle(promptValue: string) {
    const trimmed = promptValue.trim();
    if (!trimmed) {
      return "Untitled chat";
    }

    return trimmed.length > 48 ? `${trimmed.slice(0, 48)}...` : trimmed;
  }

  async function createChatOnServer(input: {
    projectId: string;
    modelId: string;
    title?: string;
    messages?: ChatMessage[];
  }) {
    const response = await fetch("/api/text-chats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    const payload = (await response.json().catch(() => ({}))) as {
      data?: ChatSession;
      error?: string;
    };

    if (!response.ok || !payload.data) {
      throw new Error(payload.error || "Unable to create the chat.");
    }

    return payload.data;
  }

  async function saveChatOnServer(chat: ChatSession) {
    const response = await fetch(`/api/text-chats/${chat.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        modelId: chat.modelId,
        title: chat.title,
        messages: chat.messages
      })
    });

    const payload = (await response.json().catch(() => ({}))) as {
      data?: ChatSession;
      error?: string;
    };

    if (!response.ok || !payload.data) {
      throw new Error(payload.error || "Unable to save the chat.");
    }

    return payload.data;
  }

  async function ensureSelectedChatSession(snapshot: GenerationSnapshot) {
    const existingChat =
      selectedChat && selectedChat.projectId === snapshot.projectId ? selectedChat : null;

    if (existingChat) {
      return existingChat;
    }

    const nextChat = await createChatOnServer({
      projectId: snapshot.projectId,
      modelId: snapshot.modelId,
      title: "Untitled chat",
      messages: []
    });
    upsertChatSession(nextChat);
    setSelectedChatId(nextChat.id);
    return nextChat;
  }

  function upsertChatSession(nextChat: ChatSession) {
    setChatSessions((current) => {
      const index = current.findIndex((chat) => chat.id === nextChat.id);

      if (index >= 0) {
        const next = [...current];
        next[index] = nextChat;
        return next;
      }

      return [nextChat, ...current];
    });
  }

  async function handleCreateChat() {
    if (!selectedProject) {
      setError("Select a project before creating a chat.");
      return;
    }

    let nextChat: ChatSession;

    try {
      nextChat = await createChatOnServer({
        projectId: selectedProject.id,
        modelId: selectedModel || FREE_TEXT_MODEL_ID,
        title: "Untitled chat",
        messages: []
      });
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Unable to create the chat.");
      return;
    }

    upsertChatSession(nextChat);
    setSelectedChatId(nextChat.id);
    setPrompt("");
    setCurrentResult(null);
    setActiveRender(null);
    setSurfaceState("idle");
    setError("");
  }

  function handleGoHome() {
    clearPollTimer();
    setPrompt("");
    setCurrentResult(null);
    setActiveRender(null);
    setSelectedChatId("");
    setSurfaceState("idle");
    setStatusLabel("Ready");
    setError("");
    setIsModelMenuOpen(false);
  }

  function handleModeChange(nextMode: Mode) {
    setMode(nextMode);
    setIsModelMenuOpen(false);

    if (nextMode === "text") {
      setCurrentResult(null);
      setActiveRender(null);
      setSurfaceState(selectedChat?.messages.length ? "result" : "idle");
      setError("");
      return;
    }

    if (mode === "text") {
      clearPollTimer();
      setCurrentResult(null);
      setActiveRender(null);
      setSurfaceState("idle");
      setStatusLabel("Ready");
      setError("");
    }
  }

  function handleToggleSidebar() {
    setIsSidebarCollapsed((current) => {
      const next = !current;

      writeLocalSettings((settings) => ({
        ...settings,
        sidebarCollapsed: next
      }));

      return next;
    });
  }

  function handleSelectChat(chatId: string) {
    const chat = chatSessions.find((entry) => entry.id === chatId);

    if (!chat) {
      return;
    }

    setSelectedChatId(chat.id);
    setSelectedProjectId(chat.projectId);
    setMode("text");
    setSelectedModel(chat.modelId);
    setSelectedModelsByMode((current) => ({
      ...current,
      text: chat.modelId
    }));
    setPrompt("");
    setCurrentResult(null);
    setActiveRender(null);
    setSurfaceState(chat.messages.length > 0 ? "result" : "idle");
    setStatusLabel("Ready");
    setError("");
  }

  function upsertHistoryRender(render: RenderRecord, options?: { incrementProjectCount?: boolean }) {
    setRenderHistory((current) => {
      const existingIndex = current.findIndex((item) => item.id === render.id);

      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = {
          ...next[existingIndex],
          ...render
        };
        return next;
      }

      if (options?.incrementProjectCount) {
        updateProjectRenderCount(render.projectId, 1);
      }

      return [render, ...current].slice(0, 8);
    });
  }

  async function handleSelectRender(renderId: string) {
    clearPollTimer();
    setError("");

    const response = await fetch(`/api/renders/${renderId}`);
    const payload = (await response.json()) as {
      data?: RenderRecord;
      error?: string;
    };

    if (!response.ok || !payload.data) {
      setError(payload.error || "Unable to load the selected render.");
      return;
    }

    const render = payload.data;
    setActiveRender(render);
    upsertHistoryRender(render);
    applySnapshotToComposer(buildSnapshotFromRender(render));

    const result = buildCurrentResultFromRender(render);

    if (result) {
      setCurrentResult(result);
      setSurfaceState("result");
      setStatusLabel(render.mediaType === "image" ? "Image ready" : "Video ready");
      return;
    }

    if (render.status === "failed") {
      setCurrentResult(null);
      setSurfaceState("failed");
      setStatusLabel("Generation failed");
      setError(render.failureMessage || "This render failed.");
      return;
    }

    setCurrentResult(null);
    setSurfaceState("generating");
    setStatusLabel(render.status === "submitting" ? "Submitting" : "Generating video");

    if (render.mediaType === "video" && apiKey) {
      void pollRender(render.id);
    }
  }

  async function createProject() {
    const title = newProjectTitle.trim();

    if (!title) {
      setError("Project title is required.");
      return;
    }

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        description: newProjectDescription.trim() || undefined
      })
    });

    const payload = (await response.json()) as {
      data?: Project;
      error?: string;
    };

    if (!response.ok || !payload.data) {
      setError(payload.error || "Unable to create the project.");
      return;
    }

    setProjectList((current) => [payload.data!, ...current]);
    setSelectedProjectId(payload.data.id);
    setIsCreatingProject(false);
    setNewProjectTitle("");
    setNewProjectDescription("");
    setError("");
    setStatusLabel("Project ready");
  }

  function buildVideoGuidancePayload() {
    if (imageGuidanceMode !== "image-to-video" || !referenceDataUrl || !selectedModelOption) {
      return {};
    }

    if (selectedModelOption.supportsImageToVideo) {
      const supportedFrameType =
        selectedModelOption.supportedFrameImages?.includes("first_frame")
          ? "first_frame"
          : selectedModelOption.supportedFrameImages?.[0] || "first_frame";

      return {
        frameImages: [
          {
            type: "image_url",
            imageUrl: referenceDataUrl,
            frameType: supportedFrameType
          }
        ]
      };
    }

    if (selectedModelOption.supportsReferenceImages) {
      return {
        inputReferences: [
          {
            type: "image_url",
            imageUrl: referenceDataUrl
          }
        ]
      };
    }

    return {};
  }

  async function generateWithSnapshot(snapshot: GenerationSnapshot) {
    if (!snapshot.projectId || !snapshot.modelId || !snapshot.prompt.trim() || !apiKey) {
      setError("Prompt, model, project, and local OpenRouter key are required.");
      return;
    }

    if (
      snapshot.mode === "video" &&
      snapshot.videoWorkflow === "image-to-video" &&
      !snapshot.referenceDataUrl
    ) {
      setError("Add a reference image before using image-guided video.");
      return;
    }

    clearPollTimer();
    setError("");
    setSurfaceState("generating");
    setStatusLabel(snapshot.mode === "video" ? "Submitting video render" : "Generating");
    setCurrentResult(null);

    if (snapshot.mode === "image") {
      const response = await fetch("/api/renders/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openrouter-key": apiKey
        },
        body: JSON.stringify({
          modelId: snapshot.modelId,
          projectId: snapshot.projectId,
          prompt: snapshot.prompt
        })
      });

      const payload = (await response.json()) as {
        data?: RenderRecord;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        setError(payload.error || "Image generation failed.");
        setStatusLabel("Generation failed");
        return;
      }

      const localRender: RenderRecord = {
        ...payload.data,
        projectTitle: payload.data.projectTitle || snapshot.projectTitle
      };

      setActiveRender(localRender);
      upsertHistoryRender(localRender, { incrementProjectCount: true });
      setCurrentResult({
        kind: "image",
        prompt: localRender.prompt,
        modelId: localRender.modelId,
        src: localRender.outputUrls[0]
      });
      setSurfaceState("result");
      setStatusLabel("Image ready");
      return;
    }

    if (snapshot.mode === "text") {
      let baseChat: ChatSession;

      try {
        baseChat = await ensureSelectedChatSession(snapshot);
      } catch (chatError) {
        setError(chatError instanceof Error ? chatError.message : "Unable to prepare the chat.");
        setStatusLabel("Generation failed");
        setSurfaceState("failed");
        return;
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: snapshot.prompt
      };
      const pendingChat: ChatSession = {
        ...baseChat,
        title:
          baseChat.messages.length === 0 ? buildChatTitle(snapshot.prompt) : baseChat.title,
        modelId: snapshot.modelId,
        messages: [...baseChat.messages, userMessage],
        updatedAt: new Date().toISOString()
      };

      upsertChatSession(pendingChat);
      setSelectedChatId(pendingChat.id);
      setPrompt("");
      setCurrentResult(null);
      setActiveRender(null);
      setSurfaceState("generating");
      setStatusLabel("Thinking");
      setIsTextResponding(true);

      try {
        const persistedPendingChat = await saveChatOnServer(pendingChat);
        upsertChatSession(persistedPendingChat);
        baseChat = persistedPendingChat;
      } catch (chatError) {
        setIsTextResponding(false);
        setError(chatError instanceof Error ? chatError.message : "Unable to save the chat.");
        setStatusLabel("Generation failed");
        setSurfaceState("failed");
        return;
      }

      const response = await fetch("/api/renders/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openrouter-key": apiKey
        },
        body: JSON.stringify({
          modelId: snapshot.modelId,
          prompt: snapshot.prompt,
          messages: pendingChat.messages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        })
      });

      const payload = (await response.json()) as {
        data?: {
          modelId: string;
          prompt: string;
          text: string;
        };
        error?: string;
      };

      if (!response.ok || !payload.data) {
        setIsTextResponding(false);
        setError(payload.error || "Text generation failed.");
        setStatusLabel("Generation failed");
        setSurfaceState("failed");
        return;
      }

      const textResponse = payload.data;
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: textResponse.text
      };
      const completedChat: ChatSession = {
        ...pendingChat,
        modelId: textResponse.modelId,
        messages: [...pendingChat.messages, assistantMessage],
        updatedAt: new Date().toISOString()
      };

      try {
        const persistedCompletedChat = await saveChatOnServer(completedChat);
        upsertChatSession(persistedCompletedChat);
        setSelectedChatId(persistedCompletedChat.id);
      } catch (chatError) {
        upsertChatSession(completedChat);
        setSelectedChatId(completedChat.id);
        setError(chatError instanceof Error ? chatError.message : "Unable to save the chat.");
      }
      setSelectedModelsByMode((current) => ({
        ...current,
        text: textResponse.modelId
      }));
      setSelectedModel(textResponse.modelId);
      setIsTextResponding(false);
      setActiveRender(null);
      setSurfaceState("result");
      setStatusLabel("Text ready");
      return;
    }

    const response = await fetch("/api/renders/video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openrouter-key": apiKey
      },
      body: JSON.stringify({
        modelId: snapshot.modelId,
        projectId: snapshot.projectId,
        prompt: snapshot.prompt,
        aspectRatio: snapshot.aspectRatio || undefined,
        duration: snapshot.duration ?? undefined,
        resolution: snapshot.resolution || undefined,
        generateAudio:
          selectedModelOption?.generateAudio === true ? snapshot.generateAudio : undefined,
        ...(snapshot.videoWorkflow === "image-to-video" && snapshot.referenceDataUrl
          ? selectedModelOption?.supportsImageToVideo
            ? {
                frameImages: [
                  {
                    type: "image_url",
                    imageUrl: snapshot.referenceDataUrl,
                    frameType:
                      selectedModelOption.supportedFrameImages?.includes("first_frame")
                        ? "first_frame"
                        : selectedModelOption.supportedFrameImages?.[0] || "first_frame"
                  }
                ]
              }
            : {
                inputReferences: [
                  {
                    type: "image_url",
                    imageUrl: snapshot.referenceDataUrl
                  }
                ]
              }
          : {})
      })
    });

    const payload = (await response.json()) as {
      data?: RenderRecord;
      error?: string;
    };

    if (!response.ok || !payload.data) {
      setError(payload.error || "Video submission failed.");
      setStatusLabel("Generation failed");
      return;
    }

    const localRender: RenderRecord = {
      ...payload.data,
      projectTitle: payload.data.projectTitle || snapshot.projectTitle
    };

    setActiveRender(localRender);
    upsertHistoryRender(localRender, { incrementProjectCount: true });
    setStatusLabel(
      snapshot.videoWorkflow === "image-to-video" ? "Generating guided video" : "Generating video"
    );
    void pollRender(localRender.id);
  }

  async function handleGenerate() {
    const snapshot = buildSnapshotFromComposer();

    if (!snapshot) {
      setError("Select a project before generating.");
      return;
    }

    await generateWithSnapshot(snapshot);
  }

  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (mode !== "text") {
      return;
    }

    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleGenerate();
    }
  }

  async function handleRetryActiveRender() {
    if (!activeRender) {
      return;
    }

    const snapshot = buildSnapshotFromRender(activeRender);
    applySnapshotToComposer(snapshot);
    await generateWithSnapshot(snapshot);
  }

  async function pollRender(renderId: string) {
    const response = await fetch(`/api/renders/${renderId}/poll`, {
      method: "POST",
      headers: {
        "x-openrouter-key": apiKey
      }
    });

    const payload = (await response.json()) as {
      data?: RenderRecord;
      error?: string;
    };

    if (!response.ok || !payload.data) {
      setError(payload.error || "Unable to poll the render.");
      setStatusLabel("Generation failed");
      return;
    }

    const nextRender = payload.data;
    setActiveRender(nextRender);
    upsertHistoryRender(nextRender);

    if (nextRender.status === "completed" && nextRender.outputUrls[0]) {
      setCurrentResult({
        kind: "video",
        prompt: nextRender.prompt,
        modelId: nextRender.modelId,
        src: nextRender.outputUrls[0]
      });
      setSurfaceState("result");
      setStatusLabel("Video ready");
      return;
    }

    if (nextRender.status === "failed") {
      setSurfaceState("failed");
      setCurrentResult(null);
      setError(nextRender.failureMessage || "Video generation failed.");
      setStatusLabel("Generation failed");
      return;
    }

    setStatusLabel(nextRender.status === "submitting" ? "Submitting" : "Generating video");

    pollTimerRef.current = setTimeout(() => {
      void pollRender(renderId);
    }, 4000);
  }

  return (
    <div
      className={`studio-shell${isSidebarCollapsed ? " sidebar-collapsed" : ""} state-${surfaceState}${keepTextBackgroundVisible ? " text-result-background" : ""}`}
    >
      <aside className="studio-sidebar">
        <div className="studio-sidebar-header">
          <div className="studio-sidebar-topbar">
            <div className="studio-brand-wrap">
              <div className="studio-brand-mark">
                <WandSparkles aria-hidden="true" size={17} strokeWidth={1.9} />
              </div>
              {!isSidebarCollapsed ? (
                <div>
                  <div className="studio-brand">OpenVideoUI</div>
                </div>
              ) : null}
            </div>
            <button
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="studio-mini-button"
              onClick={handleToggleSidebar}
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              type="button"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen aria-hidden="true" size={16} strokeWidth={1.9} />
              ) : (
                <PanelLeftClose aria-hidden="true" size={16} strokeWidth={1.9} />
              )}
            </button>
          </div>

          <button
            aria-label="Home"
            className={isSidebarCollapsed ? "studio-home-button collapsed" : "studio-home-button"}
            onClick={handleGoHome}
            title="Home"
            type="button"
          >
            <House aria-hidden="true" size={16} strokeWidth={1.9} />
            {!isSidebarCollapsed ? <span>Home</span> : null}
          </button>
        </div>

        {!isSidebarCollapsed ? (
          <>
            <div className="studio-sidebar-group">
          <div className="studio-group-head">
            <div className="studio-group-label">
              <Folder aria-hidden="true" size={14} strokeWidth={1.9} />
              <span>Projects</span>
            </div>
            <button
              aria-label={isCreatingProject ? "Close new project form" : "Create project"}
              className="studio-mini-button"
              onClick={() => setIsCreatingProject((current) => !current)}
              title={isCreatingProject ? "Close new project form" : "Create project"}
              type="button"
            >
              <Plus aria-hidden="true" size={14} strokeWidth={2} />
            </button>
          </div>

          {isCreatingProject ? (
            <div className="studio-project-create">
              <input
                aria-label="Project title"
                className="studio-inline-input"
                onChange={(event) => setNewProjectTitle(event.target.value)}
                placeholder="Project title"
                value={newProjectTitle}
              />
              <textarea
                aria-label="Project description"
                className="studio-inline-textarea"
                onChange={(event) => setNewProjectDescription(event.target.value)}
                placeholder="Optional description"
                value={newProjectDescription}
              />
              <div className="studio-inline-actions">
                <button
                  className="button-secondary"
                  onClick={() => {
                    setIsCreatingProject(false);
                    setNewProjectTitle("");
                    setNewProjectDescription("");
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="button"
                  disabled={!canCreateProject}
                  onClick={() => void createProject()}
                  type="button"
                >
                  Create
                </button>
              </div>
            </div>
          ) : null}

          <div className="studio-project-list">
            {projectList.map((project) => (
              <button
                aria-pressed={project.id === selectedProjectId}
                key={project.id}
                className={
                  project.id === selectedProjectId ? "studio-project active" : "studio-project"
                }
                onClick={() => setSelectedProjectId(project.id)}
                type="button"
              >
                <span>{project.title}</span>
                <span>{project.renderCount}</span>
              </button>
            ))}
          </div>
            </div>

            <div className="studio-sidebar-group">
          <div className="studio-group-head">
            <div className="studio-group-label">
              {mode === "text" ? (
                <MessageSquare aria-hidden="true" size={14} strokeWidth={1.9} />
              ) : (
                <History aria-hidden="true" size={14} strokeWidth={1.9} />
              )}
              <span>{mode === "text" ? "Chats" : "Recent"}</span>
            </div>
            {mode === "text" ? (
              <button
                aria-label="Create chat"
                className="studio-mini-button"
                onClick={() => void handleCreateChat()}
                title="Create chat"
                type="button"
              >
                <Plus aria-hidden="true" size={14} strokeWidth={2} />
              </button>
            ) : null}
          </div>
          <div className="studio-history-list">
            {mode === "text" ? (
              visibleChatSessions.length > 0 ? (
                visibleChatSessions.map((chat) => (
                  <button
                    aria-pressed={chat.id === selectedChatId}
                    className={
                      chat.id === selectedChatId
                        ? "studio-history-item active"
                        : "studio-history-item"
                    }
                    key={chat.id}
                    onClick={() => handleSelectChat(chat.id)}
                    type="button"
                  >
                    <div className="studio-history-title">{chat.title}</div>
                    <div className="studio-history-meta">
                      <span>{chat.modelId}</span>
                      <span>{chat.messages.length} msgs</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="studio-empty-note">
                  No chats here yet. Start a thread and it will stay with this project.
                </div>
              )
            ) : visibleHistory.length > 0 ? (
              visibleHistory.map((render) => (
                <button
                  aria-pressed={render.id === activeRender?.id}
                  className={
                    render.id === activeRender?.id
                      ? "studio-history-item active"
                      : "studio-history-item"
                  }
                  key={render.id}
                  onClick={() => void handleSelectRender(render.id)}
                  type="button"
                >
                  <div className="studio-history-title">{render.prompt}</div>
                  <div className="studio-history-meta">
                    <span>{render.projectTitle || "Project"}</span>
                    <span>{render.status}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="studio-empty-note">
                No renders here yet. Your next image or video will land in this stack.
              </div>
            )}
          </div>
            </div>
          </>
        ) : null}
      </aside>

      <main className="studio-main">
        <div className="studio-background">
          {backgroundSource.renderAs === "embed" ? (
            <iframe
              allow="autoplay; fullscreen"
              className="studio-background-embed"
              src={backgroundSource.src}
              tabIndex={-1}
              title="Ambient studio background"
            />
          ) : (
            <video
              autoPlay
              className="studio-background-video"
              loop
              muted
              playsInline
              src={backgroundSource.src}
            />
          )}
          <div className="studio-background-fallback" />
          <div className="studio-background-shade" />
        </div>

        <div className="studio-toolbar">
          <div className="studio-toolbar-spacer" />
          <button
            aria-label="Options"
            className="studio-icon-button"
            onClick={() => setIsSettingsOpen(true)}
            type="button"
          >
            <Settings2 aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
        </div>

        {surfaceState === "idle" ? (
          <div className="idle-session-banner">
            {sessionGreeting ? `${sessionGreeting}, ${displayName}` : displayName}
          </div>
        ) : null}

        {isSettingsOpen ? (
          <div
            className="settings-backdrop"
            onClick={() => setIsSettingsOpen(false)}
            role="presentation"
          >
            <section
              aria-labelledby={settingsTitleId}
              aria-modal="true"
              className="settings-modal"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="settings-head">
                <div>
                  <h2 id={settingsTitleId}>Settings</h2>
                  <div className="settings-subtle">Local controls</div>
                </div>
                <button
                  aria-label="Close settings"
                  className="studio-icon-button"
                  onClick={() => setIsSettingsOpen(false)}
                  type="button"
                >
                  <X aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              </div>

              <div className="settings-section">
                <div className="settings-label">
                  <User aria-hidden="true" size={14} strokeWidth={1.9} />
                  <span>Display name</span>
                </div>
                <div className="settings-stack">
                  <input
                    aria-label="Display name"
                    className="settings-input"
                    onChange={(event) => setSettingsDisplayName(event.target.value)}
                    placeholder="Local Creator"
                    type="text"
                    value={settingsDisplayName}
                  />
                  <div className="settings-note">
                    This name is shown in the idle banner for the local session.
                  </div>
                  <div className="settings-actions">
                    <div className="settings-key-state">Current: {displayName}</div>
                    <button
                      className="button"
                      disabled={!canSaveDisplayName}
                      onClick={() => void saveDisplayName()}
                      type="button"
                    >
                      {isSavingSettings ? "Saving..." : "Save name"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-label">
                  <WandSparkles aria-hidden="true" size={14} strokeWidth={1.9} />
                  <span>Theme palette</span>
                </div>
                <div className="settings-stack">
                  <select
                    aria-label="Theme palette"
                    className="settings-input"
                    onChange={(event) => setAccentPalette(event.target.value as AccentPaletteId)}
                    value={accentPalette}
                  >
                    {Object.entries(ACCENT_PALETTES).map(([id, palette]) => (
                      <option key={id} value={id}>
                        {palette.label}
                      </option>
                    ))}
                  </select>
                  <div className="settings-note">
                    Changes the accent color across actions, highlights, and focus states.
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-label">
                  <KeyRound aria-hidden="true" size={14} strokeWidth={1.9} />
                  <span>OpenRouter key</span>
                </div>
                <div className="settings-stack">
                  <input
                    aria-label="OpenRouter API key"
                    className="settings-input"
                    onChange={(event) => setSettingsApiKey(event.target.value)}
                    placeholder="sk-or-v1-..."
                    type="password"
                    value={settingsApiKey}
                  />
                  <div className="settings-note">
                    This key is stored locally for this app and used for model sync and
                    generation requests.
                  </div>
                  <div className="settings-actions">
                    <div className="settings-key-state">
                      {apiKey ? "Key present" : "No key saved"}
                    </div>
                    <button
                      className="button"
                      disabled={!canSaveSettingsKey}
                      onClick={() => void saveOpenRouterKey()}
                      type="button"
                    >
                      {isSavingSettings ? "Saving..." : "Save and sync"}
                    </button>
                  </div>
                  {settingsNotice ? <div className="settings-success">{settingsNotice}</div> : null}
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-label">Current background</div>
                <div className="settings-current">
                  <span>{backgroundSource.label}</span>
                  <span>{backgroundSource.origin}</span>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-label">Use a link or a local file</div>
                <div className="settings-source-switch">
                  <button
                    aria-label="Use background link"
                    className={
                      backgroundSourceMode === "link"
                        ? "settings-source-button active"
                        : "settings-source-button"
                    }
                    onClick={() => setBackgroundSourceMode("link")}
                    title="Use background link"
                    type="button"
                  >
                    <LinkIcon aria-hidden="true" size={16} strokeWidth={1.9} />
                  </button>
                  <button
                    aria-label="Use local background file"
                    className={
                      backgroundSourceMode === "file"
                        ? "settings-source-button active"
                        : "settings-source-button"
                    }
                    onClick={() => setBackgroundSourceMode("file")}
                    title="Use local background file"
                    type="button"
                  >
                    <Upload aria-hidden="true" size={16} strokeWidth={1.9} />
                  </button>
                </div>

                {backgroundSourceMode === "link" ? (
                  <div className="settings-stack">
                    <input
                      aria-label="Background video URL"
                      className="settings-input"
                      onChange={(event) => setBackgroundUrlInput(event.target.value)}
                      placeholder="https://streamable.com/... or https://cdn.example.com/video.mp4"
                      value={backgroundUrlInput}
                    />
                    <div className="settings-note">
                      Streamable links are converted to a muted looping embed. Direct video
                      links are played as muted background video.
                    </div>
                    <div className="settings-actions">
                      <button
                        className="button-secondary"
                        onClick={resetBackgroundSource}
                        type="button"
                      >
                        Use default
                      </button>
                      <button
                        className="button"
                        disabled={!canApplyBackgroundLink}
                        onClick={applyBackgroundUrl}
                        type="button"
                      >
                        Apply link
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="settings-stack">
                    <input
                      accept="video/*"
                      aria-label="Local background video file"
                      className="settings-input settings-file-input"
                      onChange={handleBackgroundFileChange}
                      type="file"
                    />
                    <div className="settings-note">
                      Local files are stored on this machine and remain available after
                      restarting the app.
                    </div>
                    <div className="settings-actions">
                      <button
                        className="button-secondary"
                        onClick={resetBackgroundSource}
                        type="button"
                      >
                        Use default
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}

        <div
          className={
            mode === "text" && hasTextConversation ? "studio-stage text-stage" : "studio-stage"
          }
        >
          {surfaceState === "generating" && mode !== "text" ? (
            <section className="generate-card">
              <div className="generate-status">{statusLabel}</div>
              <div className="generate-whisper">{activeLoadingLine}</div>
              <h2>{prompt || deferredPrompt}</h2>
              <div className="generate-meta">
                <span>{mode}</span>
                <span>{selectedModel}</span>
                <span>{selectedProject?.title}</span>
              </div>
            </section>
          ) : null}

          {mode === "text" && hasTextConversation ? (
            <section className="chat-card">
              <div className="chat-viewport" ref={textChatViewportRef}>
                {selectedChat && selectedChat.messages.length > 0 ? (
                  selectedChat.messages.map((message) => (
                    <article
                      className={
                        message.role === "assistant" ? "chat-message assistant" : "chat-message user"
                      }
                      key={message.id}
                    >
                      <div className="chat-message-role">
                        {message.role === "assistant" ? (
                          <>
                            <Bot aria-hidden="true" size={14} strokeWidth={1.9} />
                            <span className="sr-only">Assistant</span>
                          </>
                        ) : (
                          <>
                            <User aria-hidden="true" size={14} strokeWidth={1.9} />
                            <span className="sr-only">You</span>
                          </>
                        )}
                      </div>
                      <MarkdownMessage content={message.content} />
                    </article>
                  ))
                ) : (
                  <div className="chat-empty-state">
                    Start a text conversation from this project. The thread will stay close at
                    hand in the sidebar.
                  </div>
                )}
                {isTextResponding ? (
                  <article className="chat-message assistant chat-message-thinking">
                    <div className="chat-message-role">
                      <Bot aria-hidden="true" size={14} strokeWidth={1.9} />
                      <span className="sr-only">Assistant</span>
                    </div>
                    <div className="chat-thinking-copy">{activeLoadingLine}</div>
                  </article>
                ) : null}
              </div>
            </section>
          ) : null}

          {surfaceState === "result" && currentResult && currentResult.kind !== "text" ? (
            <section className="result-card">
              <div className="result-card-head">
                <div>
                  <h2>{currentResult.prompt}</h2>
                  <div className="result-meta">
                    <span>{currentResult.modelId}</span>
                    <span>{currentResult.kind}</span>
                  </div>
                </div>
                <div className="result-card-actions">
                  <div className="result-status">{statusLabel}</div>
                  {activeRender ? (
                    <button
                      className="button-secondary"
                      onClick={() => void handleRetryActiveRender()}
                      type="button"
                    >
                      <RotateCcw aria-hidden="true" size={14} strokeWidth={1.9} />
                      <span>Retry</span>
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="result-media-frame">
                {currentResult.kind === "image" ? (
                  <img alt={currentResult.prompt} src={currentResult.src} />
                ) : null}
                {currentResult.kind === "video" ? (
                  <video controls playsInline src={currentResult.src} />
                ) : null}
              </div>
            </section>
          ) : null}

          {surfaceState === "failed" && activeRender ? (
            <section className="failed-card">
              <div className="failed-card-head">
                <div>
                  <h2>{activeRender.prompt}</h2>
                  <div className="result-meta">
                    <span>{activeRender.modelId}</span>
                    <span>{activeRender.workflowType}</span>
                  </div>
                </div>
                <div className="result-card-actions">
                  <div className="failed-status">Failed</div>
                  <button
                    className="button-secondary"
                    onClick={() => void handleRetryActiveRender()}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" size={14} strokeWidth={1.9} />
                    <span>Retry</span>
                  </button>
                </div>
              </div>
              <div className="failed-message">
                {activeRender.failureMessage || "This render failed before completion."}
              </div>
            </section>
          ) : null}

          {surfaceState === "idle" && !hasTextConversation ? (
            <div className="idle-copy">
              <div className="idle-title">{idleTitle}</div>
              <div className="idle-subtle">
                The room stays ambient until you bring the first output into view.
              </div>
            </div>
          ) : null}

          <section className="composer-shell">
            <textarea
              aria-label="Prompt"
              className="composer-input"
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handlePromptKeyDown}
              placeholder="Describe the image, video, or text you want to generate..."
              value={prompt}
            />

            {mode === "video" && selectedModelOption ? (
              <div className="composer-advanced">
                {canUseImageGuidance ? (
                  <div className="composer-advanced-group">
                    <div className="composer-advanced-label">Workflow</div>
                    <div className="composer-inline-switch">
                      <button
                        className={
                          imageGuidanceMode === "text-to-video"
                            ? "composer-inline-button active"
                            : "composer-inline-button"
                        }
                        onClick={() => setVideoWorkflow("text-to-video")}
                        type="button"
                      >
                        Prompt only
                      </button>
                      <button
                        className={
                          imageGuidanceMode === "image-to-video"
                            ? "composer-inline-button active"
                            : "composer-inline-button"
                        }
                        onClick={() => setVideoWorkflow("image-to-video")}
                        type="button"
                      >
                        Use reference
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="composer-advanced-grid">
                  {selectedModelOption.supportedAspectRatios?.length ? (
                    <label className="composer-field">
                      <span>Aspect</span>
                      <select
                        aria-label="Video aspect ratio"
                        className="composer-select"
                        onChange={(event) => setAspectRatio(event.target.value)}
                        value={aspectRatio}
                      >
                        {selectedModelOption.supportedAspectRatios.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {selectedModelOption.supportedDurations?.length ? (
                    <label className="composer-field">
                      <span>Duration</span>
                      <select
                        aria-label="Video duration"
                        className="composer-select"
                        onChange={(event) => setDuration(Number(event.target.value))}
                        value={duration ?? ""}
                      >
                        {selectedModelOption.supportedDurations.map((value) => (
                          <option key={value} value={value}>
                            {value}s
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {selectedModelOption.supportedResolutions?.length ? (
                    <label className="composer-field">
                      <span>Resolution</span>
                      <select
                        aria-label="Video resolution"
                        className="composer-select"
                        onChange={(event) => setResolution(event.target.value)}
                        value={resolution}
                      >
                        {selectedModelOption.supportedResolutions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>

                {selectedModelOption.generateAudio === true ? (
                  <label className="composer-check">
                    <input
                      checked={generateAudio}
                      onChange={(event) => setGenerateAudio(event.target.checked)}
                      type="checkbox"
                    />
                    <span>Generate audio</span>
                  </label>
                ) : null}

                {imageGuidanceMode === "image-to-video" ? (
                  <div className="composer-reference">
                    <div className="composer-advanced-label">Reference image</div>
                    <div className="composer-reference-row">
                    <input
                      accept="image/*"
                      aria-label="Reference image"
                      className="composer-reference-input"
                        onChange={handleReferenceFileChange}
                        type="file"
                      />
                      <div className="composer-reference-meta">
                        {referenceFileName || "Choose a local image to guide this video."}
                      </div>
                    </div>
                    <div className="composer-note">
                      {selectedModelOption.supportsImageToVideo
                        ? "This model supports frame-based image-to-video."
                        : "This model accepts a reference image for guidance."}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="composer-footer">
              <div className="composer-modes">
                {(["image", "video", "text"] as Mode[]).map((value) => (
                  <button
                    aria-label={`Switch to ${value} mode`}
                    key={value}
                    className={mode === value ? "composer-mode active" : "composer-mode"}
                    onClick={() => handleModeChange(value)}
                    title={value}
                    type="button"
                  >
                    <ModeGlyph mode={value} />
                  </button>
                ))}
              </div>

              <div className="composer-controls">
                <div className="model-menu" ref={modelMenuRef}>
                  <button
                    aria-expanded={isModelMenuOpen}
                    aria-haspopup="listbox"
                    className={isModelMenuOpen ? "model-trigger active" : "model-trigger"}
                    onClick={() => setIsModelMenuOpen((current) => !current)}
                    type="button"
                  >
                    <span className="model-trigger-label">
                      {selectedModelOption?.name || selectedModel || "Select model"}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="model-trigger-icon"
                      size={15}
                      strokeWidth={2}
                    />
                  </button>

                  {isModelMenuOpen ? (
                    <div className="model-menu-popover" role="listbox">
                      {models.map((model) => {
                        const isActive = model.id === selectedModel;

                        return (
                          <button
                            aria-selected={isActive}
                            className={isActive ? "model-menu-item active" : "model-menu-item"}
                            key={model.id}
                            onClick={() => {
                              const nextSelectedModel = model.id;
                              setSelectedModel(nextSelectedModel);
                              setSelectedModelsByMode((current) => {
                                const next = {
                                  ...current,
                                  [mode]: nextSelectedModel
                                };

                                writeLocalSettings((settings) => ({
                                  ...settings,
                                  selectedModels: next
                                }));

                                return next;
                              });
                              setIsModelMenuOpen(false);
                            }}
                            role="option"
                            type="button"
                          >
                            <div className="model-menu-copy">
                              <div className="model-menu-name">{model.name || model.id}</div>
                            </div>
                            <div className="model-menu-check">
                              {isActive ? (
                                <Check aria-hidden="true" size={14} strokeWidth={2.2} />
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <button
                  className="composer-submit"
                  disabled={!canSubmit}
                  onClick={() => void handleGenerate()}
                  type="button"
                >
                  <SendHorizontal aria-hidden="true" size={15} strokeWidth={2} />
                  <span>Generate</span>
                </button>
              </div>
            </div>
          </section>

          {error ? <div className="studio-error">{error}</div> : null}
        </div>
      </main>
    </div>
  );
}
