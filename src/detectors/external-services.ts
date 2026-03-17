import type { ExternalService } from "../types";
import type { FileIndex } from "../utils/file-index";
import { readJson, readText } from "../utils/fs";
import { registerDetector } from "./registry";
import type { DetectorResult, Finding } from "./types";

// ─── Service Registry ────────────────────────────────────────────────

interface ServiceEntry {
  readonly packages: readonly string[];
  readonly name: string;
  readonly category: string;
}

const SERVICE_REGISTRY: readonly ServiceEntry[] = [
  // AI/LLM
  { packages: ["openai"], name: "OpenAI", category: "AI/LLM" },
  {
    packages: ["anthropic", "@anthropic-ai/sdk"],
    name: "Anthropic",
    category: "AI/LLM",
  },
  {
    packages: ["@openrouter/ai-sdk-provider"],
    name: "OpenRouter",
    category: "AI/LLM",
  },
  { packages: ["cohere-ai"], name: "Cohere", category: "AI/LLM" },
  {
    packages: ["@google/generative-ai"],
    name: "Google AI",
    category: "AI/LLM",
  },
  { packages: ["replicate"], name: "Replicate", category: "AI/LLM" },
  { packages: ["together-ai"], name: "Together AI", category: "AI/LLM" },
  { packages: ["ollama"], name: "Ollama", category: "AI/LLM" },

  // Email
  { packages: ["resend"], name: "Resend", category: "Email" },
  { packages: ["mailgun.js"], name: "Mailgun", category: "Email" },
  { packages: ["postmark"], name: "Postmark", category: "Email" },
  { packages: ["nodemailer"], name: "Nodemailer", category: "Email" },
  {
    packages: ["@aws-sdk/client-ses", "@aws-sdk/client-sesv2"],
    name: "AWS SES",
    category: "Email",
  },

  // Observability
  { packages: ["dd-trace"], name: "Datadog", category: "Observability" },
  { packages: ["newrelic"], name: "New Relic", category: "Observability" },
  {
    packages: ["prom-client"],
    name: "Prometheus",
    category: "Observability",
  },

  // Payments
  { packages: ["stripe"], name: "Stripe", category: "Payments" },
  { packages: ["braintree"], name: "Braintree", category: "Payments" },
  {
    packages: ["@paddle/paddle-node-sdk"],
    name: "Paddle",
    category: "Payments",
  },
  {
    packages: ["@lemonsqueezy/lemonsqueezy.js"],
    name: "Lemon Squeezy",
    category: "Payments",
  },

  // Auth
  { packages: ["auth0"], name: "Auth0", category: "Auth" },
  {
    packages: ["@supabase/auth-helpers-nextjs"],
    name: "Supabase Auth",
    category: "Auth",
  },
  { packages: ["next-auth"], name: "NextAuth", category: "Auth" },

  // Messaging/Queues
  {
    packages: ["bullmq", "@nestjs/bullmq"],
    name: "BullMQ",
    category: "Messaging",
  },
  { packages: ["amqplib"], name: "RabbitMQ", category: "Messaging" },
  { packages: ["kafkajs"], name: "Kafka", category: "Messaging" },
  { packages: ["nats"], name: "NATS", category: "Messaging" },
  {
    packages: ["@aws-sdk/client-sqs"],
    name: "AWS SQS",
    category: "Messaging",
  },
  {
    packages: ["@aws-sdk/client-sns"],
    name: "AWS SNS",
    category: "Messaging",
  },
  { packages: ["web-push"], name: "Web Push", category: "Messaging" },

  // Storage
  {
    packages: ["@aws-sdk/client-s3"],
    name: "AWS S3",
    category: "Storage",
  },
  { packages: ["cloudinary"], name: "Cloudinary", category: "Storage" },
  { packages: ["uploadthing"], name: "UploadThing", category: "Storage" },
  { packages: ["minio"], name: "MinIO", category: "Storage" },

  // Search
  { packages: ["algoliasearch"], name: "Algolia", category: "Search" },
  {
    packages: ["@elastic/elasticsearch"],
    name: "Elasticsearch",
    category: "Search",
  },
  { packages: ["meilisearch"], name: "Meilisearch", category: "Search" },
  { packages: ["typesense"], name: "Typesense", category: "Search" },

  // Infrastructure
  {
    packages: ["cloudflare"],
    name: "Cloudflare",
    category: "Infrastructure",
  },
  {
    packages: ["@vercel/sdk", "@vercel/sandbox"],
    name: "Vercel",
    category: "Infrastructure",
  },

  // VCS
  { packages: ["octokit"], name: "GitHub API", category: "VCS" },
];

/** Prefix-based service entries (match any package starting with the prefix). */
const PREFIX_REGISTRY: readonly {
  readonly prefix: string;
  readonly name: string;
  readonly category: string;
}[] = [
  { prefix: "@ai-sdk/", name: "Vercel AI SDK", category: "AI/LLM" },
  { prefix: "@anthropic-ai/", name: "Anthropic", category: "AI/LLM" },
  { prefix: "@huggingface/", name: "Hugging Face", category: "AI/LLM" },
  { prefix: "@mistralai/", name: "Mistral AI", category: "AI/LLM" },
  { prefix: "@sendgrid/", name: "SendGrid", category: "Email" },
  {
    prefix: "@opentelemetry/",
    name: "OpenTelemetry",
    category: "Observability",
  },
  { prefix: "@sentry/", name: "Sentry", category: "Observability" },
  { prefix: "@grafana/", name: "Grafana", category: "Observability" },
  { prefix: "@clerk/", name: "Clerk", category: "Auth" },
  { prefix: "@okta/", name: "Okta", category: "Auth" },
  { prefix: "@auth/", name: "Auth.js", category: "Auth" },
  { prefix: "@octokit/", name: "GitHub API", category: "VCS" },
  { prefix: "@gitbeaker/", name: "GitLab API", category: "VCS" },
  {
    prefix: "@lemonsqueezy/",
    name: "Lemon Squeezy",
    category: "Payments",
  },
  { prefix: "@flydotio/", name: "Fly.io", category: "Infrastructure" },
  { prefix: "@fly/", name: "Fly.io", category: "Infrastructure" },
];

// Build a fast lookup map for exact matches
const EXACT_MAP = new Map<string, { name: string; category: string }>();
for (const entry of SERVICE_REGISTRY) {
  for (const pkg of entry.packages) {
    EXACT_MAP.set(pkg, { name: entry.name, category: entry.category });
  }
}

// Also handle the "ai" package specially (too generic for a prefix)
EXACT_MAP.set("ai", { name: "Vercel AI SDK", category: "AI/LLM" });

// ─── Non-npm Ecosystem Lookups ───────────────────────────────────────

const PYTHON_SERVICES = new Map<string, { name: string; category: string }>([
  ["openai", { name: "OpenAI", category: "AI/LLM" }],
  ["anthropic", { name: "Anthropic", category: "AI/LLM" }],
  ["cohere", { name: "Cohere", category: "AI/LLM" }],
  ["google-generativeai", { name: "Google AI", category: "AI/LLM" }],
  ["replicate", { name: "Replicate", category: "AI/LLM" }],
  ["stripe", { name: "Stripe", category: "Payments" }],
  ["sendgrid", { name: "SendGrid", category: "Email" }],
  ["sentry-sdk", { name: "Sentry", category: "Observability" }],
  ["boto3", { name: "AWS SDK", category: "Infrastructure" }],
  ["celery", { name: "Celery", category: "Messaging" }],
  ["pika", { name: "RabbitMQ", category: "Messaging" }],
  ["elasticsearch", { name: "Elasticsearch", category: "Search" }],
  ["prometheus-client", { name: "Prometheus", category: "Observability" }],
]);

const GO_SERVICES = new Map<string, { name: string; category: string }>([
  ["github.com/sashabaranov/go-openai", { name: "OpenAI", category: "AI/LLM" }],
  ["github.com/stripe/stripe-go", { name: "Stripe", category: "Payments" }],
  [
    "github.com/getsentry/sentry-go",
    { name: "Sentry", category: "Observability" },
  ],
  [
    "github.com/aws/aws-sdk-go",
    { name: "AWS SDK", category: "Infrastructure" },
  ],
  ["github.com/streadway/amqp", { name: "RabbitMQ", category: "Messaging" }],
  ["github.com/segmentio/kafka-go", { name: "Kafka", category: "Messaging" }],
  [
    "go.opentelemetry.io/otel",
    { name: "OpenTelemetry", category: "Observability" },
  ],
  ["github.com/olivere/elastic", { name: "Elasticsearch", category: "Search" }],
]);

const RUBY_SERVICES = new Map<string, { name: string; category: string }>([
  ["ruby-openai", { name: "OpenAI", category: "AI/LLM" }],
  ["anthropic", { name: "Anthropic", category: "AI/LLM" }],
  ["stripe", { name: "Stripe", category: "Payments" }],
  ["sentry-ruby", { name: "Sentry", category: "Observability" }],
  ["aws-sdk-s3", { name: "AWS S3", category: "Storage" }],
  ["aws-sdk-ses", { name: "AWS SES", category: "Email" }],
  ["bunny", { name: "RabbitMQ", category: "Messaging" }],
  ["sidekiq", { name: "Sidekiq", category: "Messaging" }],
  ["sendgrid-ruby", { name: "SendGrid", category: "Email" }],
  ["elasticsearch", { name: "Elasticsearch", category: "Search" }],
]);

// ─── Matching ────────────────────────────────────────────────────────

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface ServiceMatch {
  name: string;
  category: string;
  evidence: string[];
}

const matchDep = (
  depName: string,
): { name: string; category: string } | undefined => {
  const exact = EXACT_MAP.get(depName);
  if (exact) return exact;

  for (const entry of PREFIX_REGISTRY) {
    if (depName.startsWith(entry.prefix)) {
      return { name: entry.name, category: entry.category };
    }
  }

  return undefined;
};

const addMatch = (
  serviceMap: Map<string, ServiceMatch>,
  name: string,
  category: string,
  evidence: string,
): void => {
  const key = `${category}/${name}`;
  const existing = serviceMap.get(key);
  if (existing) {
    if (!existing.evidence.includes(evidence)) {
      existing.evidence.push(evidence);
    }
  } else {
    serviceMap.set(key, { name, category, evidence: [evidence] });
  }
};

// ─── Detector ────────────────────────────────────────────────────────

registerDetector({
  id: "external-services",
  async detect(_rootPath: string, index: FileIndex): Promise<DetectorResult> {
    const serviceMap = new Map<string, ServiceMatch>();

    // Scan all package.json files
    for (const file of index.getByNamePrimary("package.json")) {
      const pkg = await readJson<PackageJson>(file.path);
      if (!pkg) continue;

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      for (const depName of Object.keys(allDeps)) {
        const match = matchDep(depName);
        if (!match) continue;
        addMatch(
          serviceMap,
          match.name,
          match.category,
          `npm: ${depName} in ${file.relativePath}`,
        );
      }
    }

    // Scan pyproject.toml files
    for (const file of index.getByNamePrimary("pyproject.toml")) {
      const content = await readText(file.path);
      if (!content) continue;

      const depsMatch = /dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(content);
      if (!depsMatch) continue;

      const depBlock = depsMatch[1]!;
      for (const [pkg, svc] of PYTHON_SERVICES) {
        if (depBlock.includes(`"${pkg}`)) {
          addMatch(
            serviceMap,
            svc.name,
            svc.category,
            `pypi: ${pkg} in ${file.relativePath}`,
          );
        }
      }
    }

    // Scan go.mod files
    for (const file of index.getByNamePrimary("go.mod")) {
      const content = await readText(file.path);
      if (!content) continue;

      for (const [mod, svc] of GO_SERVICES) {
        if (content.includes(mod)) {
          addMatch(
            serviceMap,
            svc.name,
            svc.category,
            `go: ${mod} in ${file.relativePath}`,
          );
        }
      }
    }

    // Scan Gemfile files
    for (const file of index.getByNamePrimary("Gemfile")) {
      const content = await readText(file.path);
      if (!content) continue;

      for (const [gem, svc] of RUBY_SERVICES) {
        if (content.includes(`"${gem}"`) || content.includes(`'${gem}'`)) {
          addMatch(
            serviceMap,
            svc.name,
            svc.category,
            `gem: ${gem} in ${file.relativePath}`,
          );
        }
      }
    }

    // Build findings and result
    const externalServices: ExternalService[] = [...serviceMap.values()].sort(
      (a, b) =>
        a.category === b.category
          ? a.name.localeCompare(b.name)
          : a.category.localeCompare(b.category),
    );

    const findings: Finding[] = externalServices.map((svc) => ({
      value: `${svc.category}: ${svc.name}`,
      confidence: 1.0,
      evidence: svc.evidence.slice(0, 3),
    }));

    return {
      detectorId: "external-services",
      findings,
      metadata: {
        externalServices:
          externalServices.length > 0 ? externalServices : undefined,
      },
    };
  },
});
