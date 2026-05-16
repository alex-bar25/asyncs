export const FILE_CLASSIFICATION_KINDS = [
  "backend",
  "frontend",
  "security",
  "database",
  "tests",
  "docs",
  "config",
  "ci",
  "infra",
  "unknown",
] as const;

export const CONFIG_FILE_NAMES = [
  ".prettierrc",
  ".prettierrc.json",
  "eslint.config.js",
  "package.json",
  "tsconfig.json",
  "bun.lock",
] as const;

export const BACKEND_PATH_PATTERN = /(^|\/)(api|server|service|services|controller|controllers|routes|auth)(\/|\.|$)/;

export const FRONTEND_PATH_PATTERN = /(^|\/)(components|pages|app|ui)(\/|$)/;

export const SECURITY_PATH_PATTERN = /(^|\/)(auth|security|permissions?|sessions?)(\/|\.|$)/;

export const TEST_PATH_SEGMENTS = ["__tests__/"] as const;

export const TEST_FILE_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"] as const;

export const FRONTEND_FILE_SUFFIXES = [".tsx", ".jsx"] as const;

export const DOCS_FILE_SUFFIXES = [".md", ".mdx"] as const;

export const DATABASE_FILE_SUFFIXES = [".sql", ".prisma"] as const;

export const INFRA_FILE_SUFFIXES = [".tf"] as const;

export const DATABASE_PATH_SEGMENTS = ["/migrations/"] as const;

export const DATABASE_PATH_PREFIXES = ["prisma/"] as const;

export const DOCS_PATH_PREFIXES = ["docs/"] as const;

export const CI_PATH_PREFIXES = [".github/workflows/"] as const;

export const CI_FILE_NAMES = [".gitlab-ci.yml"] as const;

export const INFRA_FILE_NAMES = ["dockerfile"] as const;

export const INFRA_PATH_PREFIXES = ["k8s/", "terraform/"] as const;
