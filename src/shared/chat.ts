export const CHAT_CHANNELS = {
  abort: "meno:chat:abort",
  bootstrap: "meno:chat:bootstrap",
  event: "meno:chat:event",
  newConversation: "meno:chat:new-conversation",
  selectModel: "meno:chat:select-model",
  send: "meno:chat:send",
} as const;

export interface ChatModel {
  contextWindow: number;
  id: string;
  key: string;
  name: string;
  provider: string;
  reasoning: boolean;
}

export interface ChatBootstrap {
  models: ChatModel[];
  selectedModelKey?: string;
}

export interface SendMessageRequest {
  responseId: string;
  text: string;
}

export type ChatResponseEndReason = "aborted" | "complete" | "error";

export type ChatEvent =
  | {
      type: "response-start";
      responseId: string;
    }
  | {
      type: "response-delta";
      responseId: string;
      delta: string;
    }
  | {
      type: "response-end";
      responseId: string;
      reason: ChatResponseEndReason;
      error?: string;
    };

export interface ChatApi {
  abort(): Promise<void>;
  bootstrap(preferredModelKey?: string): Promise<ChatBootstrap>;
  newConversation(): Promise<void>;
  onEvent(listener: (event: ChatEvent) => void): () => void;
  selectModel(modelKey: string): Promise<void>;
  send(request: SendMessageRequest): Promise<void>;
}

export interface MenoApi {
  chat: ChatApi;
}
