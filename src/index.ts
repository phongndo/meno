import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const prompt = process.argv.slice(2).join(" ").trim();

if (!prompt) {
  process.stderr.write('Usage: pnpm dev -- "your prompt"\n');
  process.exit(1);
}

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const { session } = await createAgentSession({
  authStorage,
  modelRegistry,
  sessionManager: SessionManager.inMemory(),
});

let wroteText = false;
const unsubscribe = session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
    wroteText = true;
  }
});

try {
  await session.prompt(prompt);
  if (wroteText) process.stdout.write("\n");
} finally {
  unsubscribe();
  session.dispose();
}
