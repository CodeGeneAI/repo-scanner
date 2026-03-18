import { describe, expect, it } from "bun:test";
import { parseTypeorm } from "./typeorm";

describe("TypeORM entity parser", () => {
  it("extracts @Entity with @Column fields", () => {
    const code = `
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  email: string;
}`;
    const result = parseTypeorm(code, "src/entities/user.ts");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.name).toBe("user");
    expect(result.tables[0]!.columns).toHaveLength(3);
    expect(result.tables[0]!.columns[0]!.name).toBe("id");
    expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
    expect(result.tables[0]!.columns[1]!.name).toBe("name");
  });

  it("extracts @Entity with custom table name", () => {
    const code = `
@Entity("user_profiles")
export class UserProfile {
  @PrimaryGeneratedColumn()
  id: number;
}`;
    const result = parseTypeorm(code, "src/entities/user-profile.ts");
    expect(result.tables[0]!.name).toBe("user_profiles");
  });

  it("extracts @Column with type option", () => {
    const code = `
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "text", nullable: true })
  bio: string;
}`;
    const result = parseTypeorm(code, "src/entities/user.ts");
    expect(result.tables[0]!.columns[1]!.type).toBe("varchar");
    expect(result.tables[0]!.columns[2]!.type).toBe("text");
    expect(result.tables[0]!.columns[2]!.nullable).toBe(true);
  });

  it("detects @PrimaryColumn", () => {
    const code = `
@Entity()
export class User {
  @PrimaryColumn()
  id: string;
}`;
    const result = parseTypeorm(code, "src/entities/user.ts");
    expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
    expect(result.tables[0]!.primaryKey).toEqual(["id"]);
  });

  it("detects @ManyToOne relationship", () => {
    const code = `
@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @ManyToOne(() => User, (user) => user.posts)
  author: User;
}`;
    const result = parseTypeorm(code, "src/entities/post.ts");
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.from.table).toBe("post");
    expect(result.relationships[0]!.to.table).toBe("User");
    expect(result.relationships[0]!.type).toBe("one-to-many");
  });

  it("detects @OneToOne relationship", () => {
    const code = `
@Entity()
export class UserProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User)
  user: User;
}`;
    const result = parseTypeorm(code, "src/entities/user-profile.ts");
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.type).toBe("one-to-one");
  });

  it("detects @ManyToMany relationship", () => {
    const code = `
@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToMany(() => Tag)
  @JoinTable()
  tags: Tag[];
}`;
    const result = parseTypeorm(code, "src/entities/post.ts");
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.type).toBe("many-to-many");
  });

  it("records source info correctly", () => {
    const code = `
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;
}`;
    const result = parseTypeorm(code, "src/entities/user.ts");
    expect(result.tables[0]!.source.parser).toBe("typeorm");
    expect(result.tables[0]!.source.confidence).toBe(0.9);
  });

  it("extracts @Column default value", () => {
    const code = `
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: true })
  active: boolean;
}`;
    const result = parseTypeorm(code, "src/entities/user.ts");
    const activeCol = result.tables[0]!.columns.find(
      (c) => c.name === "active",
    )!;
    expect(activeCol.defaultValue).toBe("true");
  });

  it("handles entity with methods containing nested braces", () => {
    const code = `
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  getFullName(): string {
    return this.name;
  }
}`;
    const result = parseTypeorm(code, "src/entities/user.ts");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.columns).toHaveLength(2);
    expect(result.tables[0]!.columns[0]!.name).toBe("id");
    expect(result.tables[0]!.columns[1]!.name).toBe("name");
  });

  it("skips @OneToMany (inverse side produces zero relationships)", () => {
    const code = `
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];
}`;
    const result = parseTypeorm(code, "src/entities/user.ts");
    expect(result.tables).toHaveLength(1);
    expect(result.relationships).toHaveLength(0);
  });

  it("returns empty result for empty input", () => {
    const result = parseTypeorm("", "entity.ts");
    expect(result.tables).toHaveLength(0);
    expect(result.relationships).toHaveLength(0);
  });

  it("returns empty result for non-entity class", () => {
    const result = parseTypeorm(
      "export class UserService {\n  getUser(id: number) { return null; }\n}",
      "service.ts",
    );
    expect(result.tables).toHaveLength(0);
  });
});
