import { BUILT_IN_PROVIDER_KINDS } from "./constants";
import type { BuiltInProviderKind, ProviderClient, ProviderKind, ProviderRegistry } from "./types";

export function isBuiltInProviderKind(kind: string): kind is BuiltInProviderKind {
  return BUILT_IN_PROVIDER_KINDS.includes(kind as BuiltInProviderKind);
}

export function defineProviderClient(client: ProviderClient): ProviderClient {
  return client;
}

export function createProviderRegistry(initialClients: readonly ProviderClient[] = []): ProviderRegistry {
  const clientsByKind = new Map<ProviderKind, ProviderClient>();

  for (const client of initialClients) {
    clientsByKind.set(client.kind, client);
  }

  return {
    register(client) {
      clientsByKind.set(client.kind, client);
    },
    get(kind) {
      return clientsByKind.get(kind);
    },
    list() {
      return [...clientsByKind.values()];
    },
  };
}
