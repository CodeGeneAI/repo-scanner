import { describe, expect, it } from "bun:test";
import { parsePrisma } from "./prisma";

describe("Prisma schema parser", () => {
  it("extracts a simple model with scalar fields", () => {
    const schema = `
model User {
  id    Int    @id @default(autoincrement())
  name  String
  email String
}`;
    const result = parsePrisma(schema, "prisma/schema.prisma");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.name).toBe("User");
    expect(result.tables[0]!.columns).toHaveLength(3);
    expect(result.tables[0]!.columns[0]!.name).toBe("id");
    expect(result.tables[0]!.columns[0]!.type).toBe("integer");
    expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
    expect(result.tables[0]!.columns[1]!.name).toBe("name");
    expect(result.tables[0]!.columns[1]!.type).toBe("varchar");
  });

  it("detects @id field as primary key", () => {
    const schema = `
model Post {
  id    String @id @default(uuid())
  title String
}`;
    const result = parsePrisma(schema, "prisma/schema.prisma");
    expect(result.tables[0]!.primaryKey).toEqual(["id"]);
    expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
  });

  it("detects optional (?) fields as nullable", () => {
    const schema = `
model User {
  id   Int     @id
  bio  String?
  name String
}`;
    const result = parsePrisma(schema, "prisma/schema.prisma");
    expect(result.tables[0]!.columns[1]!.nullable).toBe(true);
    expect(result.tables[0]!.columns[1]!.name).toBe("bio");
    expect(result.tables[0]!.columns[2]!.nullable).toBe(false);
  });

  it("extracts @default values", () => {
    const schema = `
model User {
  id        Int      @id @default(autoincrement())
  active    Boolean  @default(true)
  role      String   @default("user")
}`;
    const result = parsePrisma(schema, "prisma/schema.prisma");
    expect(result.tables[0]!.columns[0]!.defaultValue).toBe("autoincrement()");
    expect(result.tables[0]!.columns[1]!.defaultValue).toBe("true");
    expect(result.tables[0]!.columns[2]!.defaultValue).toBe('"user"');
  });

  it("extracts @relation and foreign key fields", () => {
    const schema = `
model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}

model User {
  id    Int    @id
  posts Post[]
}`;
    const result = parsePrisma(schema, "prisma/schema.prisma");
    expect(result.tables).toHaveLength(2);

    // The authorId column should be marked as FK
    const postTable = result.tables.find((t) => t.name === "Post")!;
    const authorIdCol = postTable.columns.find((c) => c.name === "authorId")!;
    expect(authorIdCol.isForeignKey).toBe(true);
    expect(authorIdCol.references).toEqual({ table: "User", column: "id" });

    // Should have a relationship
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.from).toEqual({
      table: "Post",
      column: "authorId",
    });
    expect(result.relationships[0]!.to).toEqual({
      table: "User",
      column: "id",
    });
    expect(result.relationships[0]!.type).toBe("one-to-many");
  });

  it("handles multiple models with cross-references", () => {
    const schema = `
model User {
  id       Int       @id
  name     String
  posts    Post[]
  comments Comment[]
}

model Post {
  id       Int       @id
  authorId Int
  author   User      @relation(fields: [authorId], references: [id])
  comments Comment[]
}

model Comment {
  id       Int    @id
  postId   Int
  userId   Int
  post     Post   @relation(fields: [postId], references: [id])
  user     User   @relation(fields: [userId], references: [id])
}`;
    const result = parsePrisma(schema, "prisma/schema.prisma");
    expect(result.tables).toHaveLength(3);
    expect(result.relationships).toHaveLength(3);
  });

  it("handles @@map table name override", () => {
    const schema = `
model UserProfile {
  id   Int    @id
  name String

  @@map("user_profiles")
}`;
    const result = parsePrisma(schema, "prisma/schema.prisma");
    expect(result.tables[0]!.name).toBe("user_profiles");
  });

  it("skips relation list fields (e.g. Post[])", () => {
    const schema = `
model User {
  id    Int    @id
  posts Post[]
}`;
    const result = parsePrisma(schema, "prisma/schema.prisma");
    // posts is a relation field, not a column
    expect(result.tables[0]!.columns).toHaveLength(1);
    expect(result.tables[0]!.columns[0]!.name).toBe("id");
  });

  it("records source info correctly", () => {
    const schema = `
model User {
  id Int @id
}`;
    const result = parsePrisma(schema, "prisma/schema.prisma");
    expect(result.tables[0]!.source.file).toBe("prisma/schema.prisma");
    expect(result.tables[0]!.source.parser).toBe("prisma");
    expect(result.tables[0]!.source.confidence).toBe(0.95);
  });

  it("returns empty result for empty input", () => {
    const result = parsePrisma("", "schema.prisma");
    expect(result.tables).toHaveLength(0);
    expect(result.relationships).toHaveLength(0);
  });

  it("returns empty result for non-model content", () => {
    const result = parsePrisma(
      `datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}`,
      "schema.prisma",
    );
    expect(result.tables).toHaveLength(0);
  });

  it("handles truncated model (no closing brace) gracefully", () => {
    const result = parsePrisma("model Broken {\n  id Int @id", "schema.prisma");
    // extractBalanced returns remaining content; parser extracts what it can
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.name).toBe("Broken");
  });

  it("handles @@id composite primary key", () => {
    const schema = `model OrderItem {
  orderId   Int
  productId Int
  quantity  Int

  @@id([orderId, productId])
}`;
    const result = parsePrisma(schema, "schema.prisma");
    expect(result.tables[0]!.primaryKey).toEqual(["orderId", "productId"]);
  });

  it("handles model at EOF without trailing newline", () => {
    const schema = "model User {\n  id Int @id\n  name String\n}";
    const result = parsePrisma(schema, "schema.prisma");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.columns).toHaveLength(2);
  });
});
