import type { Ecosystem } from "../types";
import type { RegistryClient } from "./types";

const clients = new Map<Ecosystem, RegistryClient>();

export const registerRegistryClient = (client: RegistryClient): void => {
  clients.set(client.ecosystem, client);
};

export const getRegistryClient = (
  ecosystem: Ecosystem,
): RegistryClient | undefined => {
  return clients.get(ecosystem);
};
