import type { RawEndpoint } from "./types";

/** Check if a line is a comment (JS/TS/Go single-line, JSDoc, or Python). */
const isCommentLine = (line: string): boolean => {
  const t = line.trim();
  return (
    t.startsWith("//") ||
    t.startsWith("*") ||
    t.startsWith("/*") ||
    t.startsWith("#")
  );
};

// ─── NestJS ─────────────────────────────────────────────────────────

/** Extract REST endpoints from NestJS controllers. */
export const extractNestJsRest = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];
  let controllerPrefix = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // @Controller("prefix") or @Controller()
    const ctrlMatch = /@Controller\(\s*['"]([^'"]*)['"]\s*\)/.exec(line);
    if (ctrlMatch) {
      controllerPrefix = ctrlMatch[1] ?? "";
      continue;
    }
    // @Controller() with no prefix
    if (/@Controller\(\s*\)/.test(line)) {
      controllerPrefix = "";
      continue;
    }

    // @Get(), @Post(), etc.
    const methodMatch =
      /@(Get|Post|Put|Delete|Patch)\(\s*(?:['"]([^'"]*)['"]\s*)?\)/.exec(line);
    if (methodMatch) {
      const method = methodMatch[1]!.toUpperCase();
      const routePath = methodMatch[2] ?? "";
      const fullPath = joinPaths(controllerPrefix, routePath);
      endpoints.push({
        method,
        path: fullPath || "/",
        file: filePath,
        line: i + 1,
        framework: "NestJS",
      });
    }
  }

  return endpoints;
};

/** Check if file content looks like a NestJS controller. */
export const isNestJsController = (content: string): boolean =>
  content.includes("@Controller") ||
  (content.includes("@nestjs") &&
    /@(Get|Post|Put|Delete|Patch)\(/.test(content));

// ─── Express / Fastify ──────────────────────────────────────────────

const EXPRESS_PATTERN =
  /(?:app|router|server)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/gi;

/** Extract REST endpoints from Express/Fastify route definitions. */
export const extractExpress = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isCommentLine(line)) continue;
    EXPRESS_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = EXPRESS_PATTERN.exec(line)) !== null) {
      const path = m[2]!;
      // Must start with / to avoid false positives like app.get("name")
      if (!path.startsWith("/")) continue;
      endpoints.push({
        method: m[1]!.toUpperCase(),
        path,
        file: filePath,
        line: i + 1,
        framework: "Express",
      });
    }
  }

  return endpoints;
};

/** Check if content looks like Express/Fastify routes. */
export const isExpressLike = (content: string): boolean =>
  /(?:app|router|server)\.(get|post|put|delete|patch)\(\s*['"]\//.test(content);

// ─── Flask / FastAPI ────────────────────────────────────────────────

const FLASK_PATTERN =
  /@(?:app|router|blueprint)\.(route|get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;

/** Extract REST endpoints from Flask/FastAPI decorators. */
export const extractFlask = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];

  let inDocstring = false;
  let docstringDelim = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Track Python docstrings (triple quotes)
    if (!inDocstring) {
      if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        docstringDelim = trimmed.slice(0, 3);
        // Check if docstring closes on same line (after opening)
        if (trimmed.length > 3 && trimmed.slice(3).includes(docstringDelim)) {
          continue; // single-line docstring, skip
        }
        inDocstring = true;
        continue;
      }
    } else {
      if (trimmed.includes(docstringDelim)) {
        inDocstring = false;
      }
      continue;
    }

    if (isCommentLine(line)) continue;
    FLASK_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = FLASK_PATTERN.exec(line)) !== null) {
      const decorator = m[1]!;
      const path = m[2]!;
      // @app.route has methods= param, default GET; specific decorators are self-evident
      const method = decorator === "route" ? "GET" : decorator.toUpperCase();
      endpoints.push({
        method,
        path,
        file: filePath,
        line: i + 1,
        framework: "Flask/FastAPI",
      });
    }
  }

  return endpoints;
};

/** Check if content looks like Flask/FastAPI. */
export const isFlaskLike = (content: string): boolean =>
  /@(?:app|router|blueprint)\.(route|get|post|put|delete|patch)\(/.test(
    content,
  );

// ─── Go net/http ────────────────────────────────────────────────────

const GO_HTTP_PATTERN =
  /(?:http\.HandleFunc|mux\.Handle(?:Func)?|[a-z]\w*\.(?:GET|POST|PUT|DELETE|PATCH|Get|Post|Put|Delete|Patch|Handle))\(\s*(?:http\.Method\w+\s*,\s*)?"([^"]+)"/g;

/** Extract REST endpoints from Go HTTP handlers. */
export const extractGoHttp = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isCommentLine(line)) continue;
    GO_HTTP_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = GO_HTTP_PATTERN.exec(line)) !== null) {
      const path = m[1]!;
      if (!path.startsWith("/")) continue;

      // Try to infer method from the function name (mixed-case or uppercase)
      const methodMatch =
        /\.(GET|POST|PUT|DELETE|PATCH|Get|Post|Put|Delete|Patch)\(/.exec(line);
      const method = methodMatch ? methodMatch[1]!.toUpperCase() : "ANY";

      endpoints.push({
        method,
        path,
        file: filePath,
        line: i + 1,
        framework: "Go net/http",
      });
    }
  }

  return endpoints;
};

/** Check if content looks like Go HTTP routing. */
export const isGoHttp = (content: string): boolean =>
  /(?:http\.HandleFunc|mux\.Handle|\.HandleFunc|\.(?:GET|POST|PUT|DELETE|PATCH|Handle)\(\s*(?:http\.Method)?)/.test(
    content,
  );

// ─── Rails ──────────────────────────────────────────────────────────

const RAILS_ROUTE_PATTERN =
  /^\s*(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/;
const RAILS_RESOURCES_PATTERN = /^\s*resources?\s+:(\w+)/;

/** Extract REST endpoints from Rails route files. */
export const extractRails = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const routeMatch = RAILS_ROUTE_PATTERN.exec(line);
    if (routeMatch) {
      endpoints.push({
        method: routeMatch[1]!.toUpperCase(),
        path: routeMatch[2]!,
        file: filePath,
        line: i + 1,
        framework: "Rails",
      });
      continue;
    }

    const resourceMatch = RAILS_RESOURCES_PATTERN.exec(line);
    if (resourceMatch) {
      const resource = resourceMatch[1]!;
      // Rails resources generate standard REST routes
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
      for (const method of methods) {
        endpoints.push({
          method,
          path: `/${resource}`,
          file: filePath,
          line: i + 1,
          framework: "Rails",
        });
      }
    }
  }

  return endpoints;
};

/** Check if a file path looks like a Rails routes file. */
export const isRailsRoutes = (relativePath: string): boolean =>
  relativePath.endsWith("routes.rb") || relativePath.includes("config/routes");

// ─── Spring ─────────────────────────────────────────────────────────

const SPRING_PATTERN =
  /@(Get|Post|Put|Delete|Patch|Request)Mapping\(\s*(?:value\s*=\s*)?["']([^"']+)["']/;

/** Extract REST endpoints from Spring annotations. */
export const extractSpring = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = SPRING_PATTERN.exec(line);
    if (m) {
      const annotation = m[1]!;
      const method =
        annotation === "Request" ? "ANY" : annotation.toUpperCase();
      endpoints.push({
        method,
        path: m[2]!,
        file: filePath,
        line: i + 1,
        framework: "Spring",
      });
    }
  }

  return endpoints;
};

/** Check if content looks like Spring controllers. */
export const isSpringController = (content: string): boolean =>
  content.includes("@Controller") ||
  content.includes("@RestController") ||
  /@(?:Get|Post|Put|Delete|Patch|Request)Mapping/.test(content);

// ─── ASP.NET Core ──────────────────────────────────────────────────

/** Extract REST endpoints from ASP.NET controller attributes. */
export const extractAspNet = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];
  let controllerPrefix = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // [Route("api/[controller]")] or [Route("prefix")]
    const routeMatch = /\[Route\(\s*["']([^"']+)["']\s*\)\]/.exec(line);
    if (routeMatch) {
      controllerPrefix = routeMatch[1] ?? "";
      continue;
    }

    // [HttpGet], [HttpGet("path")], [HttpPost("path")]
    const methodMatch =
      /\[Http(Get|Post|Put|Delete|Patch)\s*(?:\(\s*["']([^"']*?)["']\s*\))?\]/.exec(
        line,
      );
    if (methodMatch) {
      const method = methodMatch[1]!.toUpperCase();
      const routePath = methodMatch[2] ?? "";
      const fullPath = joinPaths(controllerPrefix, routePath);
      endpoints.push({
        method,
        path: fullPath || "/",
        file: filePath,
        line: i + 1,
        framework: "ASP.NET",
      });
    }
  }

  return endpoints;
};

/** Check if content looks like an ASP.NET controller. */
export const isAspNetController = (content: string): boolean =>
  content.includes("[ApiController]") ||
  content.includes("ControllerBase") ||
  /\[Http(?:Get|Post|Put|Delete|Patch)/.test(content);

// ─── Rust Actix/Axum ───────────────────────────────────────────────

/** Extract REST endpoints from Rust web frameworks (Actix-web, Axum). */
export const extractRustWeb = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isCommentLine(line)) continue;

    // Actix macros: #[get("/path")], #[post("/path")]
    const actixMatch =
      /#\[(get|post|put|delete|patch)\(\s*["']([^"']+)["']/.exec(line);
    if (actixMatch) {
      endpoints.push({
        method: actixMatch[1]!.toUpperCase(),
        path: actixMatch[2]!,
        file: filePath,
        line: i + 1,
        framework: "Actix",
      });
      continue;
    }

    // Axum: .route("/path", get(...)) or .route("/path", post(...))
    const axumMatch =
      /\.route\(\s*["']([^"']+)["']\s*,\s*(?:get|post|put|delete|patch|method_router::)?(get|post|put|delete|patch)/i.exec(
        line,
      );
    if (axumMatch) {
      endpoints.push({
        method: axumMatch[2]!.toUpperCase(),
        path: axumMatch[1]!,
        file: filePath,
        line: i + 1,
        framework: "Axum",
      });
    }
  }

  return endpoints;
};

/** Check if content looks like Rust web framework code. */
export const isRustWebFramework = (content: string): boolean =>
  /#\[(get|post|put|delete|patch)\(/.test(content) ||
  content.includes("actix_web") ||
  content.includes("axum::Router") ||
  /\.route\(\s*["']/.test(content);

// ─── PHP Laravel ───────────────────────────────────────────────────

const LARAVEL_ROUTE_PATTERN =
  /Route::(get|post|put|delete|patch|any)\(\s*['"]([^'"]+)['"]/g;

/** Extract REST endpoints from Laravel route definitions. */
export const extractLaravel = (
  lines: readonly string[],
  filePath: string,
): RawEndpoint[] => {
  const endpoints: RawEndpoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isCommentLine(line)) continue;
    LARAVEL_ROUTE_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = LARAVEL_ROUTE_PATTERN.exec(line)) !== null) {
      endpoints.push({
        method: m[1]!.toUpperCase(),
        path: m[2]!,
        file: filePath,
        line: i + 1,
        framework: "Laravel",
      });
    }

    // Route::resource('photos')
    const resourceMatch = /Route::resource\(\s*['"]([^'"]+)['"]/.exec(line);
    if (resourceMatch) {
      const resource = resourceMatch[1]!;
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
        endpoints.push({
          method,
          path: `/${resource}`,
          file: filePath,
          line: i + 1,
          framework: "Laravel",
        });
      }
    }
  }

  return endpoints;
};

/** Check if content looks like Laravel routes. */
export const isLaravelRoute = (
  content: string,
  relativePath: string,
): boolean =>
  /Route::(get|post|put|delete|patch|any|resource)\(/.test(content) ||
  relativePath.includes("routes/");

// ─── Helpers ────────────────────────────────────────────────────────

/** Join two URL path segments, handling slashes. */
const joinPaths = (prefix: string, suffix: string): string => {
  if (!prefix) return suffix.startsWith("/") ? suffix : `/${suffix}`;
  const p = prefix.startsWith("/") ? prefix : `/${prefix}`;
  if (!suffix) return p;
  const s = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return p.endsWith("/") ? `${p.slice(0, -1)}${s}` : `${p}${s}`;
};
