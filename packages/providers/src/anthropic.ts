import type { ProviderMessage } from "./types";

export type SplitProviderMessagesResult = {
  system: string | undefined;
  messages: { role: "user" | "assistant"; content: string }[];
};

export function splitProviderMessages(messages: readonly ProviderMessage[]): SplitProviderMessagesResult {
  const systems: string[] = [];
  const others: SplitProviderMessagesResult["messages"] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systems.push(message.content);
      continue;
    }

    others.push({ role: message.role, content: message.content });
  }

  return {
    system: systems.length === 0 ? undefined : systems.join("\n\n"),
    messages: others,
  };
}
