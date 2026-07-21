const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

type ChatApi = import("../shared/chat.js").ChatApi;
type ChatBootstrap = import("../shared/chat.js").ChatBootstrap;
type ChatEvent = import("../shared/chat.js").ChatEvent;
type IpcRendererEvent = import("electron").IpcRendererEvent;
type SendMessageRequest = import("../shared/chat.js").SendMessageRequest;
type ThinkingLevel = import("../shared/chat.js").ThinkingLevel;

const channels = {
  abort: "meno:chat:abort",
  bootstrap: "meno:chat:bootstrap",
  event: "meno:chat:event",
  newConversation: "meno:chat:new-conversation",
  selectModel: "meno:chat:select-model",
  setThinkingLevel: "meno:chat:set-thinking-level",
  send: "meno:chat:send",
} as const;

const chatApi: ChatApi = {
  abort: () => ipcRenderer.invoke(channels.abort) as Promise<void>,
  bootstrap: (preferredModelKey?: string) =>
    ipcRenderer.invoke(channels.bootstrap, preferredModelKey) as Promise<ChatBootstrap>,
  newConversation: () => ipcRenderer.invoke(channels.newConversation) as Promise<void>,
  onEvent: (listener: (event: ChatEvent) => void) => {
    const handler = (_event: IpcRendererEvent, payload: ChatEvent): void => listener(payload);
    ipcRenderer.on(channels.event, handler);
    return () => ipcRenderer.removeListener(channels.event, handler);
  },
  selectModel: (modelKey: string) =>
    ipcRenderer.invoke(channels.selectModel, modelKey) as Promise<void>,
  setThinkingLevel: (level: ThinkingLevel) =>
    ipcRenderer.invoke(channels.setThinkingLevel, level) as Promise<void>,
  send: (request: SendMessageRequest) =>
    ipcRenderer.invoke(channels.send, request) as Promise<void>,
};

contextBridge.exposeInMainWorld("meno", { chat: chatApi });
