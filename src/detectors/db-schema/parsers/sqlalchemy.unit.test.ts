import { describe, expect, it } from "bun:test";
import { parseSqlalchemy } from "./sqlalchemy";

describe("SQLAlchemy parser", () => {
  it("extracts class with __tablename__ and Column fields", () => {
    const code = `
from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(255))
    email = Column(String(255))
`;
    const result = parseSqlalchemy(code, "app/models.py");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.name).toBe("users");
    expect(result.tables[0]!.columns).toHaveLength(3);
    expect(result.tables[0]!.columns[0]!.name).toBe("id");
    expect(result.tables[0]!.columns[0]!.type).toBe("integer");
    expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
    expect(result.tables[0]!.columns[1]!.name).toBe("name");
    expect(result.tables[0]!.columns[1]!.type).toBe("varchar");
  });

  it("detects primary_key=True", () => {
    const code = `
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String)
`;
    const result = parseSqlalchemy(code, "models.py");
    expect(result.tables[0]!.primaryKey).toEqual(["id"]);
    expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
  });

  it("detects nullable=False", () => {
    const code = `
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    bio = Column(Text)
`;
    const result = parseSqlalchemy(code, "models.py");
    expect(result.tables[0]!.columns[1]!.nullable).toBe(false);
    expect(result.tables[0]!.columns[2]!.nullable).toBe(true);
  });

  it("detects ForeignKey references", () => {
    const code = `
class Post(Base):
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True)
    author_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String(200))
`;
    const result = parseSqlalchemy(code, "models.py");
    const authorCol = result.tables[0]!.columns.find(
      (c) => c.name === "author_id",
    )!;
    expect(authorCol.isForeignKey).toBe(true);
    expect(authorCol.references).toEqual({ table: "users", column: "id" });
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.type).toBe("one-to-many");
  });

  it("detects default values", () => {
    const code = `
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    active = Column(Boolean, default=True)
`;
    const result = parseSqlalchemy(code, "models.py");
    expect(result.tables[0]!.columns[1]!.defaultValue).toBe("True");
  });

  it("handles mapped_column (SQLAlchemy 2.0 style)", () => {
    const code = `
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
`;
    const result = parseSqlalchemy(code, "models.py");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.columns).toHaveLength(2);
    expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
  });

  it("records source info correctly", () => {
    const code = `
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
`;
    const result = parseSqlalchemy(code, "app/models.py");
    expect(result.tables[0]!.source.parser).toBe("sqlalchemy");
    expect(result.tables[0]!.source.confidence).toBe(0.9);
  });

  it("returns empty result for empty input", () => {
    const result = parseSqlalchemy("", "models.py");
    expect(result.tables).toHaveLength(0);
    expect(result.relationships).toHaveLength(0);
  });

  it("returns empty result for non-model Python class", () => {
    const result = parseSqlalchemy(
      "class UserSerializer:\n    def serialize(self):\n        pass",
      "serializers.py",
    );
    expect(result.tables).toHaveLength(0);
  });
});
