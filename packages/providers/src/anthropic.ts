import Anthropic from "@anthropic-ai/sdk";
import type { ProviderClient, ProviderGenerateTextRequest, ProviderGenerateTextResult, ProviderMessage } from "./types";

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

const DEFAULT_MAX_TOKENS = 4096;

export type AnthropicMessagesGateway = {
  messagesCreate(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
};

export type AnthropicProviderClientOptions = {
  apiKey: string;
  maxTokens?: number;
  /**
   * @internal Test-only injection seam. Not part of the public API.
   */
  gateway?: AnthropicMessagesGateway;
};

export function createAnthropicProviderClient(options: AnthropicProviderClientOptions): ProviderClient {
  const gateway = options.gateway ?? createDefaultGateway(options.apiKey);
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  return {
    kind: "anthropic",
    async generateText(request: ProviderGenerateTextRequest): Promise<ProviderGenerateTextResult> {
      const split = splitProviderMessages(request.messages);
      const response = await gateway.messagesCreate({
        model: request.model,
        max_tokens: maxTokens,
        ...(split.system === undefined ? {} : { system: split.system }),
        messages: split.messages,
      });
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}

function createDefaultGateway(apiKey: string): AnthropicMessagesGateway {
  const client = new Anthropic({ apiKey });

  return {
    messagesCreate(params) {
      return client.messages.create(params);
    },
  };
}
