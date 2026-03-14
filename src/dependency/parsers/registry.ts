import type { Ecosystem } from "../types";
import type { EcosystemParser } from "./types";

const parsers = new Map<Ecosystem, EcosystemParser>();

export const registerParser = (parser: EcosystemParser): void => {
  parsers.set(parser.ecosystem, parser);
};

export const getParser = (
  ecosystem: Ecosystem,
): EcosystemParser | undefined => {
  return parsers.get(ecosystem);
};

export const listParsers = (): readonly EcosystemParser[] => {
  return Array.from(parsers.values());
};

export const getFilteredParsers = (
  filter?: readonly Ecosystem[],
): readonly EcosystemParser[] => {
  if (!filter) return listParsers();
  return filter
    .map((e) => parsers.get(e))
    .filter((p): p is EcosystemParser => p !== undefined);
};
