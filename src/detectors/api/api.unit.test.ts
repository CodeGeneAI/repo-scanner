import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { ApiSurface } from "../../types";
import { FileIndex } from "../../utils/file-index";
import "../init";
import { getDetectors } from "../registry";
import {
  extractGraphqlSchema,
  extractNestJsGraphql,
} from "./graphql-extractors";
import { extractProto } from "./grpc-extractors";
import {
  extractExpress,
  extractFlask,
  extractGoHttp,
  extractNestJsRest,
  extractRails,
  extractSpring,
} from "./rest-extractors";
import { extractNestJsWebSocket } from "./websocket-extractors";

const tmpDir = () => mkdtemp(path.join(os.tmpdir(), "api-test-"));

const writeAt = async (root: string, relPath: string, content: string) => {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
};

const runApi = async (root: string) => {
  const idx = await FileIndex.build(root);
  const detector = getDetectors().find((d) => d.id === "api-surface")!;
  return detector.detect(root, idx);
};

// ─── Unit tests for individual extractors ───────────────────────────

describe("NestJS REST extractor", () => {
  it("extracts controller routes", () => {
    const lines = [
      '@Controller("users")',
      "export class UsersController {",
      "  @Get()",
      "  findAll() {}",
      '  @Post("create")',
      "  create() {}",
      '  @Get(":id")',
      "  findOne() {}",
      "}",
    ];
    const endpoints = extractNestJsRest(lines, "users.controller.ts");
    expect(endpoints).toHaveLength(3);
    expect(endpoints[0]).toMatchObject({ method: "GET", path: "/users" });
    expect(endpoints[1]).toMatchObject({
      method: "POST",
      path: "/users/create",
    });
    expect(endpoints[2]).toMatchObject({ method: "GET", path: "/users/:id" });
  });
});

describe("Express extractor", () => {
  it("extracts app.get/post routes", () => {
    const lines = [
      'app.get("/api/users", handler);',
      'app.post("/api/users", handler);',
      'router.delete("/api/users/:id", handler);',
    ];
    const endpoints = extractExpress(lines, "routes.ts");
    expect(endpoints).toHaveLength(3);
    expect(endpoints[0]).toMatchObject({ method: "GET", path: "/api/users" });
    expect(endpoints[1]).toMatchObject({ method: "POST", path: "/api/users" });
    expect(endpoints[2]).toMatchObject({
      method: "DELETE",
      path: "/api/users/:id",
    });
  });

  it("ignores non-path arguments", () => {
    const lines = ['const name = app.get("name");'];
    const endpoints = extractExpress(lines, "app.ts");
    expect(endpoints).toHaveLength(0);
  });
});

describe("Flask/FastAPI extractor", () => {
  it("extracts route decorators", () => {
    const lines = [
      '@app.route("/items")',
      "def list_items():",
      '@app.get("/items/<id>")',
      "def get_item(id):",
      '@app.post("/items")',
      "def create_item():",
    ];
    const endpoints = extractFlask(lines, "app.py");
    expect(endpoints).toHaveLength(3);
    expect(endpoints[0]).toMatchObject({ method: "GET", path: "/items" });
    expect(endpoints[1]).toMatchObject({ method: "GET", path: "/items/<id>" });
    expect(endpoints[2]).toMatchObject({ method: "POST", path: "/items" });
  });
});

describe("Go HTTP extractor", () => {
  it("extracts HandleFunc routes", () => {
    const lines = [
      'http.HandleFunc("/api/health", healthHandler)',
      'mux.HandleFunc("/api/users", usersHandler)',
    ];
    const endpoints = extractGoHttp(lines, "main.go");
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toMatchObject({ method: "ANY", path: "/api/health" });
    expect(endpoints[1]).toMatchObject({ method: "ANY", path: "/api/users" });
  });
});

describe("Rails extractor", () => {
  it("extracts explicit routes", () => {
    const lines = [
      '  get "/users", to: "users#index"',
      '  post "/users", to: "users#create"',
    ];
    const endpoints = extractRails(lines, "config/routes.rb");
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toMatchObject({ method: "GET", path: "/users" });
    expect(endpoints[1]).toMatchObject({ method: "POST", path: "/users" });
  });

  it("expands resources", () => {
    const lines = ["  resources :articles"];
    const endpoints = extractRails(lines, "config/routes.rb");
    expect(endpoints).toHaveLength(5);
    expect(endpoints.every((e) => e.path === "/articles")).toBe(true);
  });
});

describe("Spring extractor", () => {
  it("extracts mapping annotations", () => {
    const lines = [
      '@GetMapping("/api/users")',
      "public List<User> getUsers() {}",
      '@PostMapping("/api/users")',
      "public User createUser() {}",
    ];
    const endpoints = extractSpring(lines, "UserController.java");
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toMatchObject({ method: "GET", path: "/api/users" });
    expect(endpoints[1]).toMatchObject({ method: "POST", path: "/api/users" });
  });
});

describe("GraphQL schema extractor", () => {
  it("extracts Query and Mutation fields", () => {
    const lines = [
      "type Query {",
      "  users: [User!]!",
      "  user(id: ID!): User",
      "}",
      "",
      "type Mutation {",
      "  createUser(input: CreateUserInput!): User!",
      "}",
    ];
    const endpoints = extractGraphqlSchema(lines, "schema.graphql");
    expect(endpoints).toHaveLength(3);
    expect(endpoints[0]).toMatchObject({
      method: "QUERY",
      path: "Query.users",
    });
    expect(endpoints[1]).toMatchObject({ method: "QUERY", path: "Query.user" });
    expect(endpoints[2]).toMatchObject({
      method: "MUTATION",
      path: "Mutation.createUser",
    });
  });
});

describe("NestJS GraphQL extractor", () => {
  it("extracts @Query and @Mutation decorators", () => {
    const lines = [
      "@Resolver()",
      "export class UsersResolver {",
      "  @Query(() => [User])",
      "  async users() {}",
      "  @Mutation(() => User)",
      "  async createUser() {}",
      "}",
    ];
    const endpoints = extractNestJsGraphql(lines, "users.resolver.ts");
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toMatchObject({
      method: "QUERY",
      path: "Query.users",
    });
    expect(endpoints[1]).toMatchObject({
      method: "MUTATION",
      path: "Mutation.createUser",
    });
  });
});

describe("gRPC proto extractor", () => {
  it("extracts service methods", () => {
    const lines = [
      'syntax = "proto3";',
      "",
      "service UserService {",
      "  rpc GetUser (GetUserRequest) returns (User);",
      "  rpc CreateUser (CreateUserRequest) returns (User);",
      "}",
    ];
    const endpoints = extractProto(lines, "user.proto");
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toMatchObject({
      method: "RPC",
      path: "UserService.GetUser",
    });
    expect(endpoints[1]).toMatchObject({
      method: "RPC",
      path: "UserService.CreateUser",
    });
  });
});

describe("WebSocket extractor", () => {
  it("extracts @SubscribeMessage events", () => {
    const lines = [
      "@WebSocketGateway()",
      "export class ChatGateway {",
      "  @SubscribeMessage('message')",
      "  handleMessage() {}",
      "  @SubscribeMessage('join')",
      "  handleJoin() {}",
      "}",
    ];
    const endpoints = extractNestJsWebSocket(lines, "chat.gateway.ts");
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toMatchObject({ method: "WS", path: "message" });
    expect(endpoints[1]).toMatchObject({ method: "WS", path: "join" });
  });
});

// ─── Integration tests ──────────────────────────────────────────────

describe("api-surface detector (integration)", () => {
  it("is registered", () => {
    const detector = getDetectors().find((d) => d.id === "api-surface");
    expect(detector).toBeDefined();
  });

  it("detects Express routes from .ts files", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "src/routes.ts",
        'app.get("/api/health", handler);\napp.post("/api/users", handler);\n',
      );
      const result = await runApi(root);
      expect(result.findings.length).toBeGreaterThan(0);
      const surface = result.metadata?.apiSurface as ApiSurface;
      expect(surface.endpoints).toHaveLength(2);
      expect(surface.protocols).toContain("REST");
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects GraphQL schema files", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "schema.graphql",
        "type Query {\n  users: [User!]!\n}\n",
      );
      const result = await runApi(root);
      const surface = result.metadata?.apiSurface as ApiSurface;
      expect(surface.protocols).toContain("GraphQL");
      expect(surface.endpoints).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("detects .proto files", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "api.proto",
        "service Greeter {\n  rpc SayHello (HelloRequest) returns (HelloReply);\n}\n",
      );
      const result = await runApi(root);
      const surface = result.metadata?.apiSurface as ApiSurface;
      expect(surface.protocols).toContain("gRPC");
      expect(surface.endpoints).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("returns empty for no API files", async () => {
    const root = await tmpDir();
    try {
      await writeAt(root, "README.md", "# Hello\n");
      const result = await runApi(root);
      expect(result.findings).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it("sets hasTypedContracts signal for GraphQL", async () => {
    const root = await tmpDir();
    try {
      await writeAt(
        root,
        "schema.graphql",
        "type Query {\n  hello: String\n}\n",
      );
      const result = await runApi(root);
      expect(result.signals?.hasTypedContracts).toBe(true);
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
