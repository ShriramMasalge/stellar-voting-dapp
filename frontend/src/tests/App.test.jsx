// frontend/src/tests/App.test.jsx
// Run with: npm test
// Requires: npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// ── Mock stellar.js so tests don't need a live RPC ─────────────────────────
vi.mock("../stellar", () => ({
  readContract:    vi.fn().mockResolvedValue(true),
  CONTRACT_ID:     "CAMU6H2XDIX6K52K5FL33A7LHSCEYB3ZRISUAVNLB5FOGWPPE26RFUDY",
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  invalidateCache: vi.fn(),
  RPC_URL:         "https://soroban-testnet.stellar.org",
  server:          {},
}));

// ── Mock Freighter API ────────────────────────────────────────────────────
vi.mock("@stellar/freighter-api", () => ({
  getPublicKey:    vi.fn().mockResolvedValue("GDYJ6EWDGJUS76WULDIBIVSUYCRVRIV7ZQZWFXMGM23UNSLJ3LBVA42X"),
  signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: "mockXDR" }),
}));

// ── Mock Stellar SDK ───────────────────────────────────────────────────────
vi.mock("@stellar/stellar-sdk", () => ({
  nativeToScVal:      vi.fn(v => v),
  Address:            class { toScVal() { return {}; } },
  TransactionBuilder: class {
    addOperation() { return this; }
    setTimeout()   { return this; }
    build()        { return { toEnvelope: () => ({ toXDR: () => "mockXDR" }) }; }
  },
  BASE_FEE:  "100",
  Contract:  class { call() { return {}; } },
  SorobanRpc: {
    assembleTransaction: vi.fn(() => ({ build: () => ({ toEnvelope: () => ({ toXDR: () => "mockXDR" }) }) })),
    Api: { isSimulationError: vi.fn(() => false) },
  },
  Account: class { constructor(id, seq) { this.id = id; this.seq = seq; } },
}));

import App from "../App";

// ── helpers (copied from App.jsx for isolated unit tests) ─────────────────
function formatCountdown(ms) {
  if (ms <= 0) return { d:0, h:0, m:0, s:0, total:0 };
  const s = Math.floor(ms / 1000);
  return { d:Math.floor(s/86400), h:Math.floor((s%86400)/3600), m:Math.floor((s%3600)/60), s:s%60, total:ms };
}

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────
describe("Stellar Voting dApp", () => {

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  // ── Test 1 ───────────────────────────────────────────────────────────────
  it("renders the app header with correct title", () => {
    render(<App />);
    expect(screen.getByText(/Stellar Voting dApp/i)).toBeInTheDocument();
  });

  // ── Test 2 ───────────────────────────────────────────────────────────────
  it("displays all 3 proposals (Alice, Bob, Charlie)", () => {
    render(<App />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  // ── Test 3 ───────────────────────────────────────────────────────────────
  it("shows Connect Freighter button when wallet is not connected", () => {
    render(<App />);
    expect(screen.getByText(/Connect Freighter/i)).toBeInTheDocument();
  });

  // ── Test 4 — fixed: use getAllByText since "Testnet" appears twice ────────
  it("shows Testnet network badge", () => {
    render(<App />);
    const matches = screen.getAllByText(/Testnet/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]).toBeInTheDocument();
  });

  // ── Test 5 — unit test formatCountdown ───────────────────────────────────
  it("formatCountdown correctly breaks milliseconds into d/h/m/s", () => {
    const ms = (2 * 86400 + 3 * 3600 + 14 * 60 + 22) * 1000;
    const result = formatCountdown(ms);
    expect(result.d).toBe(2);
    expect(result.h).toBe(3);
    expect(result.m).toBe(14);
    expect(result.s).toBe(22);
    expect(result.total).toBe(ms);
  });

  // ── Test 6 — unit test timeAgo ────────────────────────────────────────────
  it("timeAgo returns correct relative labels", () => {
    const now = Date.now();
    expect(timeAgo(now - 30000)).toBe("just now");
    expect(timeAgo(now - 5 * 60000)).toBe("5m ago");
    expect(timeAgo(now - 2 * 3600000)).toBe("2h ago");
    expect(timeAgo(now - 3 * 86400000)).toBe("3d ago");
  });

});