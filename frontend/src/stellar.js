// src/stellar.js
import {
  Contract,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  SorobanRpc,
  Account,
  xdr,
  Keypair,
} from "@stellar/stellar-sdk";

export const RPC_URL = "https://soroban-testnet.stellar.org";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID;
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const server = new SorobanRpc.Server(RPC_URL, { allowHttp: false });

const cache = new Map();
const CACHE_TTL = 15000;

export function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.value;
  return null;
}

export function setCache(key, value) {
  cache.set(key, { value, ts: Date.now() });
}

export function invalidateCache() {
  cache.clear();
}

// Generate a valid random keypair for simulation — no funding needed
// Soroban only needs a well-formed transaction XDR for read simulations
function getSimAccount() {
  const keypair = Keypair.random();
  return new Account(keypair.publicKey(), "100000000");
}

export async function readContract(method, args = []) {
  const cacheKey = `${method}:${args.map(a => a?.toString?.() ?? String(a)).join(",")}`;

  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const contract = new Contract(CONTRACT_ID);
    const account = getSimAccount();

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const txXdr = tx.toEnvelope().toXDR("base64");

    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: { transaction: txXdr },
      }),
    });

    if (!res.ok) throw new Error(`RPC HTTP error ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));

    const simulation = json.result;

    if (simulation.error) {
      throw new Error(`Simulation error for "${method}": ${simulation.error}`);
    }

    let resultXdr;
    if (simulation.results?.length > 0 && simulation.results[0]?.xdr) {
      resultXdr = simulation.results[0].xdr;
    } else if (simulation.result?.xdr) {
      resultXdr = simulation.result.xdr;
    } else {
      throw new Error(
        `No result returned from "${method}". ` +
        `Possible causes: method returns void, wrong contract ID, or RPC issue.`
      );
    }

    const scVal = xdr.ScVal.fromXDR(resultXdr, "base64");
    const value = scValToNative(scVal);

    setCache(cacheKey, value);
    return value;
  } catch (err) {
    console.error(`readContract("${method}") failed:`, err);
    throw err;
  }
}