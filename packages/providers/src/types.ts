import type { BUILT_IN_PROVIDER_KINDS, PROVIDER_MESSAGE_ROLES } from "./constants";

export type BuiltInProviderKind = (typeof BUILT_IN_PROVIDER_KINDS)[number];

export type ProviderKind = BuiltInProviderKind | (string & {});

export type ProviderMessageRole = (typeof PROVIDER_MESSAGE_ROLES)[number];

export type ProviderMessage = {
  role: ProviderMessageRole;
  content: string;
};

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type ProviderGenerateTextRequest = {
  model: string;
  messages: readonly ProviderMessage[];
};

export type ProviderGenerateTextResult = {
  text: string;
  usage?: ProviderUsage;
};

export type ProviderGenerateObjectRequest = {
  model: string;
  schemaName: string;
  messages: readonly ProviderMessage[];
};

export type ProviderGenerateObjectResult<TObject> = {
  object: TObject;
  usage?: ProviderUsage;
  rawText?: string;
};

export type ProviderClient = {
  kind: ProviderKind;
  generateText(request: ProviderGenerateTextRequest): Promise<ProviderGenerateTextResult>;
  generateObject?<TObject>(request: ProviderGenerateObjectRequest): Promise<ProviderGenerateObjectResult<TObject>>;
};

export type ProviderRegistry = {
  register(client: ProviderClient): void;
  get(kind: ProviderKind): ProviderClient | undefined;
  list(): ProviderClient[];
};
