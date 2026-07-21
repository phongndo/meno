import { Store } from "@tanstack/store";
import type {
  ChatEvent,
  ChatModel,
  ChatResponseEndReason,
  MenoApi,
  ThinkingLevel,
} from "../shared/chat.js";
import { icons, renderIcon } from "./icons.js";
import { renderMarkdown } from "./markdown.js";

declare global {
  interface Window {
    meno: MenoApi;
  }
}

document.documentElement.classList.toggle(
  "platform-macos",
  navigator.platform.toLocaleLowerCase().includes("mac"),
);

interface MessageView {
  article: HTMLElement;
  state: HTMLElement;
  text: HTMLElement;
  typing: HTMLElement;
  value: string;
}

const MODEL_STORAGE_KEY = "meno:selected-model";
const SIDEBAR_STORAGE_KEY = "meno:sidebar-collapsed";
const SIDEBAR_WIDTH_STORAGE_KEY = "meno:sidebar-width";
const THINKING_STORAGE_PREFIX = "meno:thinking-level";
const thinkingLevels: ThinkingLevel[] = ["off", "low", "medium", "high"];

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
};

const appShell = byId<HTMLElement>("appShell");
const composerForm = byId<HTMLFormElement>("composerForm");
const composerInput = byId<HTMLTextAreaElement>("composerInput");
const conversation = byId<HTMLElement>("conversation");
const chatListItem = byId<HTMLButtonElement>("chatListItem");
const conversationTitle = byId<HTMLElement>("conversationTitle");
const effortButton = byId<HTMLButtonElement>("effortButton");
const emptyCopy = byId<HTMLElement>("emptyCopy");
const emptyState = byId<HTMLElement>("emptyState");
const emptyTitle = byId<HTMLElement>("emptyTitle");
const errorBanner = byId<HTMLElement>("errorBanner");
const messagesContainer = byId<HTMLElement>("messages");
const modelList = byId<HTMLElement>("modelList");
const modelPopover = byId<HTMLElement>("modelPopover");
const modelSearch = byId<HTMLInputElement>("modelSearch");
const modelTrigger = byId<HTMLButtonElement>("modelTrigger");
const modelTriggerLabel = byId<HTMLElement>("modelTriggerLabel");
const newChatButton = byId<HTMLButtonElement>("newChatButton");
const sendButton = byId<HTMLButtonElement>("sendButton");
const sendButtonIcon = byId<HTMLElement>("sendButtonIcon");
const sendButtonLabel = byId<HTMLElement>("sendButtonLabel");
const settingsButton = byId<HTMLButtonElement>("settingsButton");
const sidebarResizeHandle = byId<HTMLElement>("sidebarResizeHandle");
const sidebarToggle = byId<HTMLButtonElement>("sidebarToggle");
const statusText = byId<HTMLElement>("statusText");
const threadSearch = byId<HTMLInputElement>("threadSearch");

const messages = new Map<string, MessageView>();
let activeResponseId: string | undefined;
let availableModels: ChatModel[] = [];
let controlsPending = false;
let errorTimer: ReturnType<typeof setTimeout> | undefined;
let initialized = false;
let isAborting = false;
let isBusy = false;
let selectedModelKey: string | undefined;
let thinkingLevel: ThinkingLevel = "off";
let sidebarCollapsed = localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
let sidebarWidth = Math.min(
  420,
  Math.max(180, Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)) || 220),
);

const renderSidebarState = (): void => {
  appShell.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
  sidebarResizeHandle.setAttribute("aria-valuenow", String(sidebarWidth));
  appShell.classList.toggle("sidebar-collapsed", sidebarCollapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!sidebarCollapsed));
  sidebarToggle.setAttribute(
    "aria-label",
    sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar",
  );
};

const toggleSidebar = (): void => {
  sidebarCollapsed = !sidebarCollapsed;
  localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  renderSidebarState();
};

const thinkingStorageKey = (modelKey: string): string => `${THINKING_STORAGE_PREFIX}:${modelKey}`;

const storedThinkingLevel = (modelKey: string): ThinkingLevel => {
  const stored = localStorage.getItem(thinkingStorageKey(modelKey)) as ThinkingLevel | null;
  return stored && thinkingLevels.includes(stored) ? stored : "medium";
};

const setThinkingLevel = (nextLevel: ThinkingLevel): void => {
  if (controlsPending || isBusy || !selectedModelKey) return;
  const model = availableModels.find((item) => item.key === selectedModelKey);
  if (!model?.reasoning) return;

  const previousLevel = thinkingLevel;
  thinkingLevel = nextLevel;
  controlsPending = true;
  refreshControls();
  void window.meno.chat
    .setThinkingLevel(nextLevel)
    .then(() => localStorage.setItem(thinkingStorageKey(selectedModelKey!), nextLevel))
    .catch((error: unknown) => {
      thinkingLevel = previousLevel;
      showError(errorMessage(error));
    })
    .finally(() => {
      controlsPending = false;
      refreshControls();
      composerInput.focus();
    });
};

const cycleThinkingLevel = (): void => {
  const currentIndex = thinkingLevels.indexOf(thinkingLevel);
  setThinkingLevel(thinkingLevels[(currentIndex + 1) % thinkingLevels.length]!);
};

const providerNames: Record<string, string> = {
  anthropic: "Anthropic",
  "github-copilot": "GitHub Copilot",
  google: "Google",
  "google-vertex": "Google Vertex",
  openai: "OpenAI",
  "openai-codex": "OpenAI Codex",
  openrouter: "OpenRouter",
};

const displayProvider = (provider: string): string =>
  providerNames[provider] ??
  provider
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Something went wrong. Please try again.";
};

const showError = (message: string): void => {
  if (errorTimer) clearTimeout(errorTimer);
  errorBanner.textContent = message;
  errorBanner.hidden = false;
  errorTimer = setTimeout(() => {
    errorBanner.hidden = true;
  }, 5_000);
};

const hasModel = (): boolean => Boolean(selectedModelKey && availableModels.length > 0);

const refreshEmptyState = (): void => {
  emptyState.hidden = messages.size > 0;

  if (!initialized) {
    emptyTitle.textContent = "Loading models…";
    emptyCopy.textContent = "";
  } else if (!hasModel()) {
    emptyTitle.textContent = "No models configured";
    emptyCopy.textContent = "Authenticate a provider with pi /login, then restart Meno.";
  } else {
    emptyTitle.textContent = "Start a conversation";
    emptyCopy.textContent = "Ask a question or choose a topic you want to learn.";
  }
};

const refreshControls = (): void => {
  const canChat = initialized && hasModel();
  const locked = controlsPending || isAborting;

  composerInput.disabled = !canChat || isBusy || locked;
  composerInput.placeholder = canChat ? "Message Meno" : "Connect a model to start chatting";
  modelTrigger.disabled = !canChat || isBusy || locked;
  effortButton.disabled = !canChat || isBusy || locked;
  effortButton.hidden = !availableModels.find((model) => model.key === selectedModelKey)?.reasoning;
  effortButton.textContent = thinkingLevel;
  if (modelTrigger.disabled) modelPopover.hidden = true;
  newChatButton.disabled = !canChat || isBusy || locked;
  sendButton.disabled = !canChat || locked || (!isBusy && !composerInput.value.trim());
  sendButton.classList.toggle("is-stop", isBusy);
  renderIcon(sendButtonIcon, isBusy ? icons.square : icons.arrowUp, isBusy ? 11 : 17);
  sendButtonLabel.textContent = isBusy ? "Stop response" : "Send message";

  if (!initialized) {
    statusText.textContent = "Starting pi…";
  } else if (!hasModel()) {
    statusText.textContent = "No model";
  } else if (isBusy) {
    statusText.textContent = isAborting ? "Stopping…" : "Thinking…";
  } else if (controlsPending) {
    statusText.textContent = "Updating…";
  } else {
    statusText.textContent = "Ready";
  }

  refreshEmptyState();
};

const setBusy = (busy: boolean): void => {
  isBusy = busy;
  if (!busy) isAborting = false;
  conversation.setAttribute("aria-busy", String(busy));
  refreshControls();
};

const resizeComposer = (): void => {
  composerInput.style.height = "0px";
  composerInput.style.height = `${Math.min(composerInput.scrollHeight, 160)}px`;
};

const scrollToBottom = (behavior: ScrollBehavior = "smooth"): void => {
  requestAnimationFrame(() => {
    conversation.scrollTo({ behavior, top: conversation.scrollHeight });
  });
};

const createTypingIndicator = (): HTMLElement => {
  const indicator = document.createElement("span");
  indicator.className = "typing-indicator";
  indicator.setAttribute("aria-label", "Meno is thinking");
  indicator.append(
    document.createElement("span"),
    document.createElement("span"),
    document.createElement("span"),
  );
  return indicator;
};

const appendMessage = (id: string, role: "assistant" | "user", initialText = ""): MessageView => {
  const article = document.createElement("article");
  article.className = `message message-${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "assistant" ? "M" : "Y";

  const content = document.createElement("div");
  content.className = "message-content";

  const header = document.createElement("header");
  const author = document.createElement("strong");
  author.textContent = role === "assistant" ? "Meno" : "You";
  const state = document.createElement("span");
  state.className = "message-state";
  state.textContent = role === "assistant" ? "Thinking" : "";
  header.append(author, state);

  const text = document.createElement("div");
  text.className = "message-text";
  renderMarkdown(text, initialText);

  const typing = createTypingIndicator();
  typing.hidden = role !== "assistant" || Boolean(initialText);

  content.append(header, text, typing);
  article.append(avatar, content);
  messagesContainer.append(article);

  const view = { article, state, text, typing, value: initialText };
  messages.set(id, view);
  refreshEmptyState();
  return view;
};

const appendDelta = (responseId: string, delta: string): void => {
  const view = messages.get(responseId);
  if (!view) return;
  view.value += delta;
  renderMarkdown(view.text, view.value, true);
  view.typing.hidden = true;
  view.state.textContent = "";
  scrollToBottom("auto");
};

const finishResponse = (
  responseId: string,
  reason: ChatResponseEndReason,
  error?: string,
): void => {
  const view = messages.get(responseId);
  if (view) {
    view.typing.hidden = true;

    if (reason === "aborted") {
      view.state.textContent = "Stopped";
      if (!view.value) view.text.textContent = "Response stopped.";
    } else if (reason === "error") {
      const detail = error ?? "The model could not complete this response.";
      view.state.textContent = "Error";
      view.article.classList.add("has-error");
      if (!view.value) view.text.textContent = detail;
      showError(detail);
    } else {
      view.state.textContent = "";
      if (!view.value) renderMarkdown(view.text, "No response was returned.");
    }

    renderMarkdown(view.text, view.value || view.text.textContent || "");
  }

  if (activeResponseId === responseId) {
    activeResponseId = undefined;
    setBusy(false);
    composerInput.focus();
  }
  scrollToBottom();
};

const updateConversationTitle = (text: string): void => {
  if (conversationTitle.textContent !== "New conversation") return;
  const oneLine = text.replaceAll(/\s+/g, " ").trim();
  conversationTitle.textContent =
    oneLine.length > 32 ? `${oneLine.slice(0, 32).trimEnd()}…` : oneLine;
};

const sendMessage = (): void => {
  if (isBusy || controlsPending || !hasModel()) return;
  const text = composerInput.value.trim();
  if (!text) return;

  const responseId = crypto.randomUUID();
  appendMessage(crypto.randomUUID(), "user", text);
  appendMessage(responseId, "assistant");
  activeResponseId = responseId;

  composerInput.value = "";
  resizeComposer();
  updateConversationTitle(text);
  setBusy(true);
  scrollToBottom();

  void window.meno.chat.send({ responseId, text }).catch((error: unknown) => {
    if (activeResponseId === responseId) {
      finishResponse(responseId, "error", errorMessage(error));
    }
  });
};

const modelLabel = (model: ChatModel): string =>
  model.name === model.id ? model.name : `${model.name} · ${model.id}`;

const renderModelOptions = (query = ""): void => {
  modelList.replaceChildren();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  let lastProvider = "";

  for (const model of availableModels.filter((item) =>
    `${modelLabel(item)} ${displayProvider(item.provider)}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  )) {
    if (model.provider !== lastProvider) {
      const heading = document.createElement("div");
      heading.className = "model-group-label";
      heading.textContent = displayProvider(model.provider);
      modelList.append(heading);
      lastProvider = model.provider;
    }

    const option = document.createElement("button");
    option.className = "model-option";
    option.type = "button";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(model.key === selectedModelKey));
    option.dataset.modelKey = model.key;
    const label = document.createElement("span");
    label.textContent = modelLabel(model);
    const check = document.createElement("span");
    if (model.key === selectedModelKey) renderIcon(check, icons.check, 13);
    option.append(label, check);
    modelList.append(option);
  }

  if (modelList.childElementCount === 0) {
    const empty = document.createElement("div");
    empty.className = "model-list-empty";
    empty.textContent = "No models found";
    modelList.append(empty);
  }
};

const renderModels = (): void => {
  const selected = availableModels.find((model) => model.key === selectedModelKey);
  modelTriggerLabel.textContent = selected ? modelLabel(selected) : "No model";
  renderModelOptions(modelSearch.value);
};

const clearConversation = (): void => {
  activeResponseId = undefined;
  messages.clear();
  messagesContainer.replaceChildren();
  conversationTitle.textContent = "New conversation";
  conversation.scrollTo({ top: 0 });
  refreshEmptyState();
};

const handleChatEvent = (event: ChatEvent): void => {
  if (event.type === "response-start") {
    activeResponseId = event.responseId;
    setBusy(true);
  } else if (event.type === "response-delta") {
    appendDelta(event.responseId, event.delta);
  } else {
    finishResponse(event.responseId, event.reason, event.error);
  }
};

composerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isBusy) {
    if (isAborting) return;
    isAborting = true;
    refreshControls();
    void window.meno.chat.abort().catch((error: unknown) => {
      isAborting = false;
      refreshControls();
      showError(errorMessage(error));
    });
    return;
  }
  sendMessage();
});

composerInput.addEventListener("input", () => {
  resizeComposer();
  refreshControls();
});

composerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    composerForm.requestSubmit();
  }
});

const setModelPopoverOpen = (open: boolean): void => {
  modelPopover.hidden = !open;
  modelTrigger.setAttribute("aria-expanded", String(open));
  if (open) {
    modelSearch.value = "";
    renderModelOptions();
    modelSearch.focus();
  }
};

modelTrigger.addEventListener("click", () => setModelPopoverOpen(modelPopover.hidden !== false));
modelSearch.addEventListener("input", () => renderModelOptions(modelSearch.value));
modelList.addEventListener("click", (event) => {
  const option =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-model-key]")
      : null;
  const nextModelKey = option?.dataset.modelKey;
  const previousModelKey = selectedModelKey;
  if (!nextModelKey || nextModelKey === previousModelKey) {
    setModelPopoverOpen(false);
    return;
  }

  setModelPopoverOpen(false);
  controlsPending = true;
  refreshControls();
  void window.meno.chat
    .selectModel(nextModelKey)
    .then(async () => {
      selectedModelKey = nextModelKey;
      const model = availableModels.find((item) => item.key === nextModelKey);
      thinkingLevel = model?.reasoning ? storedThinkingLevel(nextModelKey) : "off";
      if (model?.reasoning) await window.meno.chat.setThinkingLevel(thinkingLevel);
      localStorage.setItem(MODEL_STORAGE_KEY, nextModelKey);
      renderModels();
    })
    .catch((error: unknown) => showError(errorMessage(error)))
    .finally(() => {
      controlsPending = false;
      refreshControls();
      composerInput.focus();
    });
});

document.addEventListener("pointerdown", (event) => {
  if (
    !modelPopover.hidden &&
    event.target instanceof Node &&
    !modelPopover.parentElement?.contains(event.target)
  ) {
    setModelPopoverOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modelPopover.hidden) setModelPopoverOpen(false);
});

const threadSearchStore = new Store("");
threadSearchStore.subscribe(() => {
  const query = threadSearchStore.state.trim().toLocaleLowerCase();
  chatListItem.hidden = !conversationTitle.textContent?.toLocaleLowerCase().includes(query);
});
threadSearch.addEventListener("input", () => {
  threadSearchStore.setState(() => threadSearch.value);
});

settingsButton.addEventListener("click", () => {
  if (!modelTrigger.disabled) setModelPopoverOpen(true);
});

sidebarToggle.addEventListener("click", toggleSidebar);
effortButton.addEventListener("click", cycleThinkingLevel);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "b") {
    event.preventDefault();
    toggleSidebar();
    return;
  }
  if (
    event.shiftKey &&
    event.key === "Tab" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    effortButton.hidden === false
  ) {
    event.preventDefault();
    cycleThinkingLevel();
  }
});

sidebarResizeHandle.addEventListener("pointerdown", (event) => {
  if (sidebarCollapsed) return;
  sidebarResizeHandle.setPointerCapture(event.pointerId);
  appShell.classList.add("is-resizing");
});
sidebarResizeHandle.addEventListener("pointermove", (event) => {
  if (!sidebarResizeHandle.hasPointerCapture(event.pointerId)) return;
  const maximumWidth = Math.min(420, window.innerWidth - 480);
  sidebarWidth = Math.max(180, Math.min(maximumWidth, event.clientX));
  renderSidebarState();
});
sidebarResizeHandle.addEventListener("pointerup", (event) => {
  if (!sidebarResizeHandle.hasPointerCapture(event.pointerId)) return;
  sidebarResizeHandle.releasePointerCapture(event.pointerId);
  appShell.classList.remove("is-resizing");
  localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
});
sidebarResizeHandle.addEventListener("dblclick", () => {
  sidebarWidth = 220;
  localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  renderSidebarState();
});

newChatButton.addEventListener("click", () => {
  if (isBusy || controlsPending || !hasModel()) return;
  controlsPending = true;
  refreshControls();
  void window.meno.chat
    .newConversation()
    .then(() => {
      clearConversation();
      composerInput.focus();
    })
    .catch((error: unknown) => showError(errorMessage(error)))
    .finally(() => {
      controlsPending = false;
      refreshControls();
    });
});

const unsubscribe = window.meno.chat.onEvent(handleChatEvent);
window.addEventListener("beforeunload", unsubscribe, { once: true });

const initialize = async (): Promise<void> => {
  try {
    const preferredModelKey = localStorage.getItem(MODEL_STORAGE_KEY) ?? undefined;
    const bootstrap = await window.meno.chat.bootstrap(preferredModelKey);
    availableModels = bootstrap.models;
    selectedModelKey = bootstrap.selectedModelKey;
    const selectedModel = availableModels.find((model) => model.key === selectedModelKey);
    thinkingLevel =
      selectedModel?.reasoning && selectedModelKey
        ? storedThinkingLevel(selectedModelKey)
        : bootstrap.thinkingLevel;
    if (selectedModelKey) localStorage.setItem(MODEL_STORAGE_KEY, selectedModelKey);
    if (selectedModel?.reasoning && thinkingLevel !== bootstrap.thinkingLevel) {
      await window.meno.chat.setThinkingLevel(thinkingLevel);
    }
    initialized = true;
    renderModels();
    refreshControls();
    if (hasModel()) composerInput.focus();
  } catch (error: unknown) {
    initialized = true;
    availableModels = [];
    selectedModelKey = undefined;
    renderModels();
    refreshControls();
    showError(`Could not start pi: ${errorMessage(error)}`);
  }
};

renderIcon(byId("newChatIcon"), icons.plus, 16);
renderIcon(byId("threadSearchIcon"), icons.search, 15);
renderIcon(byId("chatListIcon"), icons.message, 13);
renderIcon(byId("settingsIcon"), icons.settings, 16);
renderIcon(byId("modelChevronIcon"), icons.chevronDown, 12);
renderIcon(byId("modelSearchIcon"), icons.search, 14);
renderIcon(byId("sidebarToggleIcon"), icons.panelLeft, 16);
renderSidebarState();
resizeComposer();
refreshControls();
void initialize();
