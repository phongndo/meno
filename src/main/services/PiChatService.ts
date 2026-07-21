import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";

import type {
  ChatBootstrap,
  ChatEvent,
  ChatModel,
  ChatResponseEndReason,
  SendMessageRequest,
} from "../../shared/chat.js";

const TUTOR_SYSTEM_PROMPT = `You are Meno, a helpful learning assistant. Explain ideas clearly, ask clarifying questions when needed, and be honest about uncertainty.`;

type PiModel = NonNullable<ReturnType<ModelRuntime["getModel"]>>;
type PiSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

interface ActiveResponse {
  aborted: boolean;
  error?: string;
  id: string;
}

type EventEmitter = (event: ChatEvent) => void;

const modelKey = (model: PiModel): string => `${model.provider}/${model.id}`;

const compareModels = (left: PiModel, right: PiModel): number => {
  const providerOrder = left.provider.localeCompare(right.provider);
  if (providerOrder !== 0) return providerOrder;
  return left.name.localeCompare(right.name);
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "An unexpected error occurred while contacting the model.";
};

export class PiChatService {
  readonly #cwd: string;
  readonly #emit: EventEmitter;
  readonly #models = new Map<string, PiModel>();

  #activeResponse?: ActiveResponse;
  #initialization?: Promise<void>;
  #modelRuntime?: ModelRuntime;
  #selectedModelKey?: string;
  #session?: PiSession;
  #unsubscribe?: () => void;

  constructor(emit: EventEmitter, cwd = process.cwd()) {
    this.#emit = emit;
    this.#cwd = cwd;
  }

  async bootstrap(preferredModelKey?: string): Promise<ChatBootstrap> {
    if (!this.#initialization) {
      this.#initialization = this.#initialize(preferredModelKey).catch((error: unknown) => {
        this.#initialization = undefined;
        throw error;
      });
    }

    await this.#initialization;

    return {
      models: this.#serializedModels(),
      ...(this.#selectedModelKey ? { selectedModelKey: this.#selectedModelKey } : {}),
    };
  }

  async selectModel(key: string): Promise<void> {
    await this.#requireInitialization();
    if (this.#activeResponse) throw new Error("Wait for the current response to finish.");

    const model = this.#models.get(key);
    if (!model) throw new Error("That model is no longer available.");

    if (!this.#session) {
      await this.#createSession(model);
    } else {
      await this.#session.setModel(model);
    }

    this.#selectedModelKey = key;
  }

  async send(request: SendMessageRequest): Promise<void> {
    await this.#requireInitialization();
    if (this.#activeResponse) throw new Error("A response is already in progress.");
    if (!this.#session || !this.#selectedModelKey) {
      throw new Error("Configure an authenticated model before sending a message.");
    }

    const activeResponse: ActiveResponse = {
      aborted: false,
      id: request.responseId,
    };
    this.#activeResponse = activeResponse;
    this.#emit({ type: "response-start", responseId: activeResponse.id });

    let reason: ChatResponseEndReason = "complete";
    let responseError: string | undefined;

    try {
      await this.#session.prompt(request.text, {
        expandPromptTemplates: false,
        source: "interactive",
      });

      if (activeResponse.aborted) {
        reason = "aborted";
      } else if (activeResponse.error) {
        reason = "error";
        responseError = activeResponse.error;
      }
    } catch (error: unknown) {
      reason = activeResponse.aborted ? "aborted" : "error";
      if (reason === "error") responseError = errorMessage(error);
    } finally {
      if (this.#activeResponse === activeResponse) this.#activeResponse = undefined;
      this.#emit({
        type: "response-end",
        responseId: activeResponse.id,
        reason,
        ...(responseError ? { error: responseError } : {}),
      });
    }
  }

  async abort(): Promise<void> {
    if (!this.#activeResponse || !this.#session) return;
    this.#activeResponse.aborted = true;
    await this.#session.abort();
  }

  async newConversation(): Promise<void> {
    await this.#requireInitialization();
    if (this.#activeResponse)
      throw new Error("Stop the current response before starting a new chat.");

    const model = this.#selectedModelKey ? this.#models.get(this.#selectedModelKey) : undefined;
    if (!model) return;
    await this.#createSession(model);
  }

  dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#session?.dispose();
    this.#session = undefined;
  }

  async #initialize(preferredModelKey?: string): Promise<void> {
    this.#modelRuntime = await ModelRuntime.create();
    const availableModels = [...(await this.#modelRuntime.getAvailable())].sort(compareModels);

    this.#models.clear();
    for (const model of availableModels) this.#models.set(modelKey(model), model);

    const preferredModel = preferredModelKey ? this.#models.get(preferredModelKey) : undefined;
    const globalSettings = SettingsManager.create(this.#cwd, getAgentDir(), {
      projectTrusted: false,
    }).getGlobalSettings();
    const configuredDefault =
      globalSettings.defaultProvider && globalSettings.defaultModel
        ? this.#models.get(`${globalSettings.defaultProvider}/${globalSettings.defaultModel}`)
        : undefined;
    const initialModel = preferredModel ?? configuredDefault ?? availableModels[0];
    if (!initialModel) return;

    this.#selectedModelKey = modelKey(initialModel);
    await this.#createSession(initialModel);
  }

  async #requireInitialization(): Promise<void> {
    await this.bootstrap();
  }

  async #createSession(model: PiModel): Promise<void> {
    if (!this.#modelRuntime) throw new Error("The pi model runtime is not initialized.");

    this.#unsubscribe?.();
    this.#session?.dispose();

    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 2 },
    });
    const resourceLoader = new DefaultResourceLoader({
      agentDir: getAgentDir(),
      cwd: this.#cwd,
      noContextFiles: true,
      noExtensions: true,
      noPromptTemplates: true,
      noSkills: true,
      noThemes: true,
      settingsManager,
      systemPrompt: TUTOR_SYSTEM_PROMPT,
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: this.#cwd,
      model,
      modelRuntime: this.#modelRuntime,
      noTools: "all",
      resourceLoader,
      sessionManager: SessionManager.inMemory(this.#cwd),
      settingsManager,
      thinkingLevel: model.reasoning ? "medium" : "off",
    });

    this.#session = session;
    this.#unsubscribe = session.subscribe((event) => this.#onSessionEvent(event));
  }

  #onSessionEvent(event: AgentSessionEvent): void {
    const activeResponse = this.#activeResponse;
    if (!activeResponse) return;

    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      this.#emit({
        type: "response-delta",
        responseId: activeResponse.id,
        delta: event.assistantMessageEvent.delta,
      });
      return;
    }

    if (event.type !== "message_end" || event.message.role !== "assistant") return;

    if (event.message.stopReason === "aborted") {
      activeResponse.aborted = true;
    } else if (event.message.stopReason === "error") {
      activeResponse.error =
        event.message.errorMessage ?? "The model could not complete this response.";
    } else {
      activeResponse.error = undefined;
    }
  }

  #serializedModels(): ChatModel[] {
    return [...this.#models.entries()].map(([key, model]) => ({
      contextWindow: model.contextWindow,
      id: model.id,
      key,
      name: model.name,
      provider: model.provider,
      reasoning: model.reasoning,
    }));
  }
}
