import { ipcMain } from "electron";

import {
  CHAT_CHANNELS,
  type ChatBootstrap,
  type SendMessageRequest,
  type ThinkingLevel,
} from "../../shared/chat.js";
import type { PiChatService } from "../services/PiChatService.js";

const MAX_MESSAGE_LENGTH = 100_000;
const MAX_IDENTIFIER_LENGTH = 200;

const optionalString = (value: unknown, name: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > MAX_IDENTIFIER_LENGTH) {
    throw new TypeError(`${name} must be a valid string.`);
  }
  return value;
};

const requiredString = (value: unknown, name: string, maxLength: number): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value;
};

const thinkingLevels = new Set<ThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

const parseThinkingLevel = (value: unknown): ThinkingLevel => {
  if (typeof value !== "string" || !thinkingLevels.has(value as ThinkingLevel)) {
    throw new TypeError("Invalid reasoning level.");
  }
  return value as ThinkingLevel;
};

const parseSendRequest = (value: unknown): SendMessageRequest => {
  if (!value || typeof value !== "object") throw new TypeError("Invalid message request.");

  const request = value as Record<string, unknown>;
  const text = requiredString(request.text, "Message", MAX_MESSAGE_LENGTH).trim();
  if (!text) throw new TypeError("Message must not be blank.");

  return {
    responseId: requiredString(request.responseId, "Response identifier", MAX_IDENTIFIER_LENGTH),
    text,
  };
};

export const registerChatIpc = (chatService: PiChatService): (() => void) => {
  ipcMain.handle(
    CHAT_CHANNELS.bootstrap,
    async (_event, preferredModelKey: unknown): Promise<ChatBootstrap> =>
      chatService.bootstrap(optionalString(preferredModelKey, "Preferred model")),
  );
  ipcMain.handle(CHAT_CHANNELS.selectModel, async (_event, modelKey: unknown) => {
    await chatService.selectModel(
      requiredString(modelKey, "Model identifier", MAX_IDENTIFIER_LENGTH),
    );
  });
  ipcMain.handle(CHAT_CHANNELS.setThinkingLevel, async (_event, level: unknown) => {
    await chatService.setThinkingLevel(parseThinkingLevel(level));
  });
  ipcMain.handle(CHAT_CHANNELS.send, async (_event, request: unknown) => {
    await chatService.send(parseSendRequest(request));
  });
  ipcMain.handle(CHAT_CHANNELS.abort, async () => {
    await chatService.abort();
  });
  ipcMain.handle(CHAT_CHANNELS.newConversation, async () => {
    await chatService.newConversation();
  });

  return () => {
    ipcMain.removeHandler(CHAT_CHANNELS.bootstrap);
    ipcMain.removeHandler(CHAT_CHANNELS.selectModel);
    ipcMain.removeHandler(CHAT_CHANNELS.setThinkingLevel);
    ipcMain.removeHandler(CHAT_CHANNELS.send);
    ipcMain.removeHandler(CHAT_CHANNELS.abort);
    ipcMain.removeHandler(CHAT_CHANNELS.newConversation);
  };
};
