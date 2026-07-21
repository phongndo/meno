import { app, BrowserWindow } from "electron";

import { CHAT_CHANNELS, type ChatEvent } from "../shared/chat.js";
import { registerChatIpc } from "./ipc/registerChatIpc.js";
import { PiChatService } from "./services/PiChatService.js";
import { createMainWindow } from "./window/createMainWindow.js";

let chatService: PiChatService | undefined;
let mainWindow: BrowserWindow | undefined;
let unregisterChatIpc: (() => void) | undefined;

const emitChatEvent = (event: ChatEvent): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(CHAT_CHANNELS.event, event);
  }
};

const openMainWindow = async (): Promise<void> => {
  mainWindow = await createMainWindow();
  mainWindow.once("closed", () => {
    mainWindow = undefined;
  });
};

app.whenReady().then(async () => {
  chatService = new PiChatService(emitChatEvent);
  unregisterChatIpc = registerChatIpc(chatService);
  await openMainWindow();

  app.on("activate", () => {
    if (!mainWindow) void openMainWindow();
  });
});

app.on("before-quit", () => {
  unregisterChatIpc?.();
  chatService?.dispose();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
