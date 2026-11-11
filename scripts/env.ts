try { process.loadEnvFile(".env"); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
export const apiUrl = `http://127.0.0.1:${process.env.API_PORT ?? 3000}`;
export const mockUrl = process.env.PROVIDER_URL ?? `http://127.0.0.1:${process.env.MOCK_PORT ?? 4101}`;
export const dbPath = process.env.DATABASE_PATH ?? "./data/provisioning.sqlite";
