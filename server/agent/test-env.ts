// Tests never call the live gateway: .env's creds are dropped, so events and replies use the
// templates. agent.test.ts points the agent at its own fake gateway when it needs one.
for (const k of ["NEON_AI_GATEWAY_URL", "NEON_AI_GATEWAY_BASE_URL", "NEON_AI_GATEWAY_KEY", "NEON_AI_GATEWAY_TOKEN"]) delete process.env[k];
