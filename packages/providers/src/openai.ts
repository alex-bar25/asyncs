import OpenAI from "openai";
import type { Response, ResponseCreateParamsNonStreaming, ResponseInput } from "openai/resources/responses/responses";
import type {
  ProviderClient,
  ProviderGenerateObjectRequest,
  ProviderGenerateObjectResult,
  ProviderGenerateTextRequest,
  ProviderGenerateTextResult,
  ProviderMessage,
} from "./types";

export type OpenAIResponsesGateway = {
  responsesCreate(params: ResponseCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<Response>;
};

export type OpenAIProviderClientOptions = {
  apiKey: string;
  maxOutputTokens?: number;
  gateway?: OpenAIResponsesGateway;
};

export type SplitOpenAIMessagesResult = {
  instructions: string | undefined;
  input: ResponseInput;
};

// Reasoning models spend part of this budget on hidden reasoning tokens before any
// visible output, so the cap has to be generous or structured output gets truncated.
const DEFAULT_MAX_OUTPUT_TOKENS = 16384;

export function splitOpenAIMessages(messages: readonly ProviderMessage[]): SplitOpenAIMessagesResult {
  const instructions: string[] = [];
  const input: ResponseInput = [];

  for (const message of messages) {
    if (message.role === "system") {
      instructions.push(message.content);
      continue;
    }

    input.push({ role: message.role, content: message.content });
  }

  return {
    instructions: instructions.length === 0 ? undefined : instructions.join("\n\n"),
    input,
  };
}

export function createOpenAIProviderClient(options: OpenAIProviderClientOptions): ProviderClient {
  const gateway = options.gateway ?? createDefaultGateway(options.apiKey);
  const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  return {
    kind: "openai",
    async generateText(request: ProviderGenerateTextRequest): Promise<ProviderGenerateTextResult> {
      const split = splitOpenAIMessages(request.messages);
      const response = await gateway.responsesCreate(
        {
          model: request.model,
          max_output_tokens: maxOutputTokens,
          ...(split.instructions === undefined ? {} : { instructions: split.instructions }),
          input: split.input,
        },
        request.signal === undefined ? undefined : { signal: request.signal },
      );
      const text = extractOutputText(response);

      return {
        text,
        ...formatUsage(response),
      };
    },

    async generateObject(request: ProviderGenerateObjectRequest): Promise<ProviderGenerateObjectResult> {
      const split = splitOpenAIMessages(request.messages);
      const response = await gateway.responsesCreate(
        {
          model: request.model,
          max_output_tokens: maxOutputTokens,
          ...(split.instructions === undefined ? {} : { instructions: split.instructions }),
          input: split.input,
          text: {
            format: {
              // Non-strict: asyncs schemas carry optional fields (e.g. a finding's file/line),
              // which OpenAI strict mode forbids (it requires every property in `required`).
              // The agent layer re-validates each response with zod, so the schema only needs
              // to guide generation here.
              type: "json_schema",
              name: request.schemaName,
              strict: false,
              schema: request.schema,
            },
          },
        },
        request.signal === undefined ? undefined : { signal: request.signal },
      );
      const rawText = extractOutputText(response);
      const object = parseJsonObject(rawText);

      if (object === undefined) {
        throw new Error(`OpenAI provider did not return valid JSON for ${request.schemaName}.`);
      }

      return {
        object,
        rawText,
        ...formatUsage(response),
      };
    },
  };
}

// Non-strict structured output can arrive wrapped in a markdown code fence or with
// surrounding prose, so try the raw text, then a fenced body, then the outermost
// brace span. Returns undefined when none of those parse.
function parseJsonObject(rawText: string): unknown {
  for (const candidate of jsonCandidates(rawText)) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  return undefined;
}

function jsonCandidates(rawText: string): string[] {
  const trimmed = rawText.trim();
  const candidates = [trimmed];

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced?.[1] !== undefined) {
    candidates.push(fenced[1].trim());
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  return candidates;
}

function extractOutputText(response: Response): string {
  const texts: string[] = [];

  for (const item of response.output) {
    if (item.type !== "message") {
      continue;
    }

    for (const content of item.content) {
      if (content.type === "output_text") {
        texts.push(content.text);
      }
    }
  }

  return texts.join("");
}

function formatUsage(response: Response): Pick<ProviderGenerateTextResult, "usage"> {
  if (response.usage === null || response.usage === undefined) {
    return {};
  }

  return {
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

function createDefaultGateway(apiKey: string): OpenAIResponsesGateway {
  const client = new OpenAI({ apiKey });

  return {
    responsesCreate(params, options) {
      return client.responses.create(params, options);
    },
  };
}
