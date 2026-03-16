export enum TokenType {
  Keyword = 0,
  Identifier = 1,
  StringLiteral = 2,
  NumericLiteral = 3,
  Operator = 4,
  Punctuation = 5,
}

export interface Token {
  readonly type: TokenType;
  /** Normalized value used for hashing (identifiers→$ID, strings→$STR, numbers→$NUM). */
  readonly normalized: string;
  /** Original source text. */
  readonly original: string;
  readonly line: number;
}
