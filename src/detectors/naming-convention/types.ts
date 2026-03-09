export type CaseStyle =
  | "camelCase"
  | "PascalCase"
  | "snake_case"
  | "kebab-case"
  | "SCREAMING_SNAKE_CASE"
  | "flatcase"
  | "mixed";

export type NamingCategory =
  | "file"
  | "directory"
  | "function"
  | "class"
  | "interface"
  | "type-alias"
  | "enum"
  | "variable"
  | "constant";

export interface NamingPattern {
  readonly category: NamingCategory;
  readonly dominantStyle: CaseStyle;
  readonly percentage: number;
  readonly sampleSize: number;
  readonly breakdown: Record<CaseStyle, number>;
}
