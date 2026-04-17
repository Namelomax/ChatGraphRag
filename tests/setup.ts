import { vi } from "vitest";
import { globalSetup } from "@playwright/test";

// Mock Playwright setup for unit tests
vi.mock("@playwright/test", () => ({
  ...jest.requireActual("@playwright/test"),
  globalSetup: vi.fn(),
}));

// Mock fetch for API calls
global.fetch = vi.fn();

// Mock console.log to avoid cluttering test output
vi.spyOn(console, "log").mockImplementation(() => {});

// Mock console.error to avoid cluttering test output
vi.spyOn(console, "error").mockImplementation(() => {});
