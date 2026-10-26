// Integration tests run against an isolated SQLite database and storage directory.
process.env.DATABASE_URL = "file:./test-integration.db";
process.env.STORAGE_DIR = "./storage-test";
process.env.DEMO_MODE = "true";
