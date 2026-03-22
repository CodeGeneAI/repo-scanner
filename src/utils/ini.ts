export type IniSectionMap = Record<string, Record<string, string>>;

/**
 * Parse INI-style content into a normalized section/key/value map.
 * - Section and key names are lowercased for case-insensitive lookup.
 * - Comment-only lines (`#` or `;`) and blank lines are ignored.
 * - Duplicate keys overwrite prior values within the same section.
 */
export const parseIniSections = (content: string): IniSectionMap => {
  const sections: IniSectionMap = {};
  let currentSection = "";

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1]!.trim().toLowerCase();
      if (!sections[currentSection]) {
        sections[currentSection] = {};
      }
      continue;
    }

    const keyValueMatch = line.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (!keyValueMatch) {
      continue;
    }

    const key = keyValueMatch[1]!.trim().toLowerCase();
    const value = keyValueMatch[2]!.trim();
    if (!sections[currentSection]) {
      sections[currentSection] = {};
    }
    sections[currentSection][key] = value;
  }

  return sections;
};
