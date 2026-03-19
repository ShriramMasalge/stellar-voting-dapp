// src/App.jsx  — fully self-contained, styles injected via <style> tag
import { useState, useEffect, useCallback, useRef } from "react";
import {
  readContract, CONTRACT_ID, NETWORK_PASSPHRASE,
  invalidateCache, RPC_URL, server,
} from "./stellar";
import { getPublicKey, signTransaction } from "@stellar/freighter-api";
import {
  nativeToScVal, Address, TransactionBuilder,
  BASE_FEE, Contract, SorobanRpc, Account,
} from "@stellar/stellar-sdk";

/* ─── constants ─────────────────────────────────────────────────────────── */
const PROPOSALS = [
  { name: "Alice",   description: "Best frontend developer on the team" },
  { name: "Bob",     description: "Most reliable backend engineer" },
  { name: "Charlie", description: "Outstanding full-stack contributor" },
];
const ADMIN_PUBKEY  = "GDYJ6EWDGJUS76WULDIBIVSUYCRVRIV7ZQZWFXMGM23UNSLJ3LBVA42X";
const HORIZON_URL   = "https://horizon-testnet.stellar.org";
const EXPLORER_TX   = "https://stellar.expert/explorer/testnet/tx/";
const EXPLORER_ACCT = "https://stellar.expert/explorer/testnet/account/";

/* ─── localStorage helpers ───────────────────────────────────────────────── */
const votedKey    = a => `voted_${a}`;
const txHashKey   = a => `txhash_${a}`;
const DEADLINE_K  = "voting_deadline";
const ACTIVITY_K  = "activity_feed";

const checkLocalVoted  = a => !!localStorage.getItem(votedKey(a));
const markLocalVoted   = a =>   localStorage.setItem(votedKey(a), "1");
const saveLocalTxHash  = (a,h)=> localStorage.setItem(txHashKey(a), h);
const getLocalTxHash   = a =>   localStorage.getItem(txHashKey(a)) || "";
const saveDeadline     = ts =>  localStorage.setItem(DEADLINE_K, String(ts));
const getDeadline      = () =>  Number(localStorage.getItem(DEADLINE_K)) || 0;

/* ─── time helpers ────────────────────────────────────────────────────────── */
function formatCountdown(ms) {
  if (ms <= 0) return { d:0, h:0, m:0, s:0, total:0 };
  const s = Math.floor(ms / 1000);
  return { d:Math.floor(s/86400), h:Math.floor((s%86400)/3600),
           m:Math.floor((s%3600)/60), s:s%60, total:ms };
}
function timeAgo(ts) {
  const m = Math.floor((Date.now()-ts)/60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

/* ─── CSS ─────────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:        #0d0e1a;
  --surface:   #13152b;
  --surface2:  #1a1d35;
  --border:    rgba(139,92,246,0.18);
  --border2:   rgba(255,255,255,0.07);
  --purple:    #7c3aed;
  --purple-l:  #a78bfa;
  --purple-ll: #c4b5fd;
  --green:     #22c55e;
  --green-l:   #4ade80;
  --red:       #ef4444;
  --yellow:    #eab308;
  --blue:      #3b82f6;
  --text:      #e2e8f0;
  --muted:     #64748b;
  --muted2:    #94a3b8;
  --font:      'DM Sans', sans-serif;
  --mono:      'Space Mono', monospace;
  --radius:    14px;
  --shadow:    0 4px 24px rgba(0,0,0,0.4);
}

html, body, #root { height: 100%; }

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  min-height: 100vh;
}

/* background glow */
body::before {
  content: '';
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 60% 40% at 20% 10%, rgba(124,58,237,0.12) 0%, transparent 70%),
    radial-gradient(ellipse 50% 30% at 80% 80%, rgba(59,130,246,0.08) 0%, transparent 70%);
}

.app {
  position: relative; z-index: 1;
  max-width: 680px;
  margin: 0 auto;
  padding: 2rem 1rem 4rem;
}

/* ── header ── */
.app-header {
  display: flex; align-items: center; gap: 0.75rem;
  margin-bottom: 0.4rem;
}
.app-header h1 {
  font-size: 1.7rem; font-weight: 700; letter-spacing: -0.02em;
  background: linear-gradient(135deg, #e2e8f0 30%, var(--purple-ll));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.net-badge {
  display: inline-flex; align-items: center; gap: 0.35rem;
  font-size: 0.68rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--purple-l);
  background: rgba(124,58,237,0.12); border: 1px solid rgba(124,58,237,0.3);
  border-radius: 20px; padding: 0.2rem 0.7rem; margin-bottom: 1.5rem;
}
.net-dot { width:6px; height:6px; border-radius:50%; background:var(--green); box-shadow:0 0 6px var(--green); }

/* ── card ── */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1.4rem;
  margin-bottom: 1rem;
  box-shadow: var(--shadow);
  transition: border-color 0.2s;
}
.card:hover { border-color: rgba(139,92,246,0.3); }
.card h2 {
  font-size: 0.8rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--muted2); margin-bottom: 1rem;
}

/* ── banners ── */
.banner {
  border-radius: 10px; padding: 0.65rem 1rem;
  margin-bottom: 0.85rem; font-size: 0.85rem; font-weight: 500;
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
}
.banner.loading { background:rgba(124,58,237,0.1); border:1px solid rgba(124,58,237,0.25); color:var(--purple-l); }
.banner.success { background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.25); color:var(--green-l); }
.banner.error   { background:rgba(239,68,68,0.08);  border:1px solid rgba(239,68,68,0.25);  color:#fca5a5; }
.banner.urgent  { background:rgba(234,179,8,0.08);  border:1px solid rgba(234,179,8,0.3);   color:#fde68a; }
.banner.urgent.pulse { animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
.spinner {
  display: inline-block; width:14px; height:14px; border-radius:50%;
  border:2px solid rgba(167,139,250,0.25); border-top-color:var(--purple-l);
  animation: spin 0.7s linear infinite; flex-shrink:0;
}
@keyframes spin { to { transform: rotate(360deg); } }
.tx-link {
  font-size:0.78rem; color:var(--purple-l); text-decoration:none; white-space:nowrap;
  padding:0.2rem 0.55rem; border-radius:6px; background:rgba(124,58,237,0.12);
  border:1px solid rgba(124,58,237,0.25); transition:background 0.15s;
}
.tx-link:hover { background:rgba(124,58,237,0.22); }

/* ── status row ── */
.status-row { display:flex; align-items:center; gap:1rem; flex-wrap:wrap; }
.badge {
  display:inline-flex; align-items:center; gap:0.4rem;
  font-size:0.78rem; font-weight:600; border-radius:20px; padding:0.3rem 0.85rem;
}
.badge.open   { background:rgba(34,197,94,0.12); color:var(--green-l); border:1px solid rgba(34,197,94,0.25); }
.badge.closed { background:rgba(239,68,68,0.1);  color:#fca5a5;        border:1px solid rgba(239,68,68,0.2); }
.pulse-dot { width:7px; height:7px; border-radius:50%; background:var(--green); box-shadow:0 0 0 0 rgba(34,197,94,0.5); animation:ping 1.4s ease infinite; }
@keyframes ping { 0%{box-shadow:0 0 0 0 rgba(34,197,94,0.5)} 70%{box-shadow:0 0 0 7px rgba(34,197,94,0)} 100%{box-shadow:0 0 0 0 rgba(34,197,94,0)} }
.total-votes { font-size:0.82rem; color:var(--muted2); }
.total-votes strong { color:var(--text); }

/* ── countdown ── */
.countdown-wrap {
  margin-top:1rem; padding:0.9rem 1rem;
  background:rgba(255,255,255,0.03); border-radius:10px;
  border:1px solid var(--border2);
}
.countdown-wrap.urgent-cd { border-color:rgba(234,179,8,0.3); background:rgba(234,179,8,0.05); }
.countdown-wrap.critical  { border-color:rgba(239,68,68,0.35); background:rgba(239,68,68,0.06); }
.countdown-label { font-size:0.7rem; text-transform:uppercase; letter-spacing:0.09em; color:var(--muted); margin-bottom:0.65rem; }
.countdown-digits { display:flex; gap:0.5rem; flex-wrap:wrap; }
.countdown-unit {
  display:flex; flex-direction:column; align-items:center;
  min-width:54px; background:rgba(255,255,255,0.05); border-radius:8px; padding:0.5rem 0.7rem;
  border:1px solid var(--border2);
}
.countdown-num { font-family:var(--mono); font-size:1.65rem; font-weight:700; line-height:1; }
.countdown-wrap.urgent-cd .countdown-num { color:#fbbf24; }
.countdown-wrap.critical  .countdown-num { color:#f87171; }
.countdown-sub { font-size:0.6rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--muted); margin-top:0.25rem; }
.countdown-date { font-size:0.72rem; color:var(--muted); margin-top:0.6rem; }

/* ── wallet section ── */
.wallet-row { display:flex; align-items:center; gap:0.75rem; }
.wallet-pill {
  flex:1; display:flex; align-items:center; gap:0.6rem;
  background:rgba(34,197,94,0.07); border:1px solid rgba(34,197,94,0.2);
  border-radius:10px; padding:0.6rem 0.9rem;
  font-family:var(--mono); font-size:0.82rem; font-weight:700; color:var(--green-l);
}
.wallet-check { color:var(--green); font-size:1rem; }
.admin-badge {
  font-size:0.65rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em;
  background:rgba(251,191,36,0.12); color:#fde68a;
  border:1px solid rgba(251,191,36,0.25); border-radius:20px; padding:0.15rem 0.5rem; margin-left:0.4rem;
}

/* ── receipt card ── */
.receipt-card {
  margin-top:0.9rem; padding:0.9rem 1rem;
  border-radius:10px; background:rgba(34,197,94,0.05);
  border:1px solid rgba(34,197,94,0.2);
}
.receipt-header {
  display:flex; justify-content:space-between; align-items:center;
  font-weight:600; font-size:0.85rem; color:var(--green-l); margin-bottom:0.7rem;
}
.receipt-chip {
  font-size:0.62rem; text-transform:uppercase; letter-spacing:0.1em;
  background:rgba(34,197,94,0.15); color:var(--green-l);
  border:1px solid rgba(34,197,94,0.25); border-radius:20px; padding:0.15rem 0.55rem;
}
.receipt-row {
  display:flex; justify-content:space-between; align-items:center;
  font-size:0.8rem; padding:0.32rem 0; border-bottom:1px solid rgba(255,255,255,0.04);
}
.receipt-row:last-of-type { border-bottom:none; }
.rl { color:var(--muted2); }
.rv { font-weight:500; }
.rv.mono { font-family:var(--mono); font-size:0.75rem; }
.receipt-actions { display:flex; gap:0.6rem; flex-wrap:wrap; margin-top:0.7rem; }
.rl-btn {
  font-size:0.75rem; color:#60a5fa; text-decoration:none;
  padding:0.28rem 0.65rem; border-radius:7px;
  background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.2);
  transition:background 0.15s; font-weight:500;
}
.rl-btn:hover { background:rgba(59,130,246,0.18); }

/* ── connect wallet ── */
.connect-area { text-align:center; padding:0.5rem 0; }
.muted-note { font-size:0.78rem; color:var(--muted); margin-top:0.5rem; }

/* ── proposals ── */
.proposal { padding:0.85rem 0; border-bottom:1px solid var(--border2); }
.proposal:last-child { border-bottom:none; padding-bottom:0; }
.proposal-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.55rem; gap:0.5rem; }
.proposal-name { font-size:0.97rem; font-weight:600; display:block; }
.proposal-desc { font-size:0.75rem; color:var(--muted2); display:block; margin-top:0.1rem; }
.vote-stat { font-size:0.78rem; color:var(--muted2); text-align:right; white-space:nowrap; }
.vote-stat strong { color:var(--purple-ll); }
.progress-track {
  height:5px; background:rgba(255,255,255,0.06); border-radius:99px;
  margin-bottom:0.65rem; overflow:hidden;
}
.progress-fill {
  height:100%; border-radius:99px;
  background:linear-gradient(90deg, var(--purple) 0%, var(--purple-l) 100%);
  transition:width 0.6s cubic-bezier(.4,0,.2,1);
}

/* ── buttons ── */
.btn {
  display:inline-flex; align-items:center; gap:0.4rem;
  padding:0.55rem 1.1rem; border-radius:9px; font-family:var(--font);
  font-size:0.82rem; font-weight:600; cursor:pointer; border:none;
  transition:all 0.15s; line-height:1;
}
.btn-primary {
  background:linear-gradient(135deg, var(--purple) 0%, #6d28d9 100%);
  color:#fff; box-shadow:0 2px 12px rgba(124,58,237,0.35);
}
.btn-primary:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 4px 18px rgba(124,58,237,0.45); }
.btn-primary:active:not(:disabled) { transform:translateY(0); }
.btn-primary:disabled { opacity:0.4; cursor:not-allowed; }
.btn-ghost {
  background:rgba(255,255,255,0.05); color:var(--text);
  border:1px solid var(--border2);
}
.btn-ghost:hover:not(:disabled) { background:rgba(255,255,255,0.09); }
.btn-ghost:disabled { opacity:0.4; cursor:not-allowed; }
.btn-danger { background:rgba(239,68,68,0.12); color:#fca5a5; border:1px solid rgba(239,68,68,0.22); }
.btn-danger:hover:not(:disabled) { background:rgba(239,68,68,0.2); }
.btn-danger:disabled { opacity:0.4; cursor:not-allowed; }
.btn-voted { background:rgba(34,197,94,0.08); color:var(--green-l); border:1px solid rgba(34,197,94,0.2); cursor:default; }
.btn-connect {
  background:linear-gradient(135deg, var(--purple) 0%, #6d28d9 100%);
  color:#fff; box-shadow:0 2px 16px rgba(124,58,237,0.3);
  padding:0.65rem 1.4rem; font-size:0.9rem;
}
.btn-connect:hover { transform:translateY(-1px); box-shadow:0 4px 22px rgba(124,58,237,0.4); }

/* ── two-col grid (analytics + activity) ── */
.two-col { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem; }
@media(max-width:520px){ .two-col { grid-template-columns:1fr; } }

/* ── donut chart ── */
.donut-wrap { display:flex; align-items:center; gap:1rem; margin-top:0.5rem; }
.donut { width:64px; height:64px; flex-shrink:0; }
.donut-label { font-size:0.82rem; color:var(--muted2); line-height:1.5; }
.donut-label strong { color:var(--text); font-size:1rem; }

/* ── activity feed ── */
.activity-list { display:flex; flex-direction:column; gap:0; }
.activity-row {
  display:flex; justify-content:space-between; align-items:center;
  padding:0.5rem 0; border-bottom:1px solid rgba(255,255,255,0.04);
  font-size:0.78rem; gap:0.5rem;
}
.activity-row:last-child { border-bottom:none; }
.act-left { display:flex; align-items:center; gap:0.5rem; }
.act-dot { width:6px; height:6px; border-radius:50%; background:var(--purple-l); flex-shrink:0; }
.act-name { color:var(--purple-ll); font-weight:600; }
.act-for  { color:var(--muted2); }
.act-proposal { color:var(--text); font-weight:500; }
.act-right { display:flex; align-items:center; gap:0.4rem; flex-shrink:0; }
.act-time { font-size:0.7rem; color:var(--muted); white-space:nowrap; }
.act-link { color:var(--purple-l); font-size:0.82rem; text-decoration:none; }
.act-link:hover { color:var(--purple-ll); }

/* ── voting period / contract info ── */
.info-row { font-size:0.8rem; color:var(--muted2); margin-top:0.4rem; }
.info-row strong { color:var(--text); }
.contract-link {
  display:inline-flex; align-items:center; gap:0.35rem;
  font-size:0.78rem; color:var(--purple-l); text-decoration:none; margin-top:0.4rem;
  padding:0.28rem 0.7rem; border-radius:7px;
  background:rgba(124,58,237,0.08); border:1px solid rgba(124,58,237,0.2);
  transition:background 0.15s;
}
.contract-link:hover { background:rgba(124,58,237,0.18); }

/* ── winner ── */
.winner-card { border-color:rgba(251,191,36,0.3); background:rgba(251,191,36,0.05); text-align:center; }
.winner-name { font-size:1.4rem; font-weight:700; color:#fde68a; margin:0.25rem 0 0.1rem; }
.winner-sub  { font-size:0.8rem; color:var(--muted2); }

/* ── admin ── */
.admin-card { border-color:rgba(251,191,36,0.2); background:rgba(251,191,36,0.03); }
.admin-btns { display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:0.25rem; }
.admin-note { font-size:0.72rem; color:var(--muted); margin-top:0.6rem; }

/* ── misc ── */
.muted { color:var(--muted2); font-size:0.8rem; }
.mono  { font-family:var(--mono); }
`;

/* ─── component ──────────────────────────────────────────────────────────── */
export default function App() {
  const [status,     setStatus]     = useState("idle");
  const [message,    setMessage]    = useState("");
  const [votingOpen, setVotingOpen] = useState(false);
  const [votes,      setVotes]      = useState([0,0,0]);
  const [winner,     setWinner]     = useState(null);
  const [hasVoted,   setHasVoted]   = useState(false);
  const [myVote,     setMyVote]     = useState(null);
  const [walletAddr, setWalletAddr] = useState("");
  const [lastTxHash, setLastTxHash] = useState("");
  const [totalVotes, setTotalVotes] = useState(0);
  const [deadline,   setDeadline]   = useState(() => getDeadline());
  const [countdown,  setCountdown]  = useState({d:0,h:0,m:0,s:0,total:0});
  const [activity,   setActivity]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(ACTIVITY_K)||"[]"); } catch { return []; }
  });
  const timerRef = useRef(null);

  /* countdown tick */
  useEffect(() => {
    if (!deadline || !votingOpen) { setCountdown({d:0,h:0,m:0,s:0,total:0}); return; }
    const tick = () => setCountdown(formatCountdown(deadline - Date.now()));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [deadline, votingOpen]);

  /* load */
  const load = useCallback(async (addr=null) => {
    try {
      setStatus("loading");
      const open = await readContract("is_voting_open").catch(()=>false);
      setVotingOpen(open);
      const counts = await Promise.all(
        PROPOSALS.map((_,i) => readContract("get_votes",[nativeToScVal(i,{type:"u32"})]).catch(()=>0))
      );
      const nums = counts.map(Number);
      setVotes(nums);
      setTotalVotes(nums.reduce((a,b)=>a+b,0));
      if (!open && nums.some(n=>n>0)) {
        try { const [idx,vc]=await readContract("get_winner"); setWinner({name:PROPOSALS[Number(idx)].name,votes:Number(vc)}); }
        catch {}
      } else { setWinner(null); }
      if (addr) {
        const v = checkLocalVoted(addr); setHasVoted(v);
        if (v) setLastTxHash(getLocalTxHash(addr));
      }
      setStatus("idle");
    } catch(e) { console.error(e); setStatus("idle"); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  /* activity */
  function pushActivity(wallet, proposal, hash) {
    setActivity(prev => {
      const next = [{wallet,proposal,hash,ts:Date.now()},...prev].slice(0,10);
      localStorage.setItem(ACTIVITY_K, JSON.stringify(next));
      return next;
    });
  }

  /* wallet */
  function disconnect() {
    setWalletAddr(""); setHasVoted(false); setMyVote(null);
    setLastTxHash(""); setMessage(""); setStatus("idle");
  }
  async function connect() {
    try {
      setStatus("loading"); setMessage("Opening Freighter...");
      const address = await getPublicKey();
      if (!address?.startsWith("G")) throw new Error("Not a valid Stellar address – is Freighter on Testnet?");
      setWalletAddr(address); setMessage("Wallet connected"); setStatus("success");
      await load(address);
    } catch(e) { setStatus("error"); setMessage("Freighter failed: "+(e.message||e)); }
  }

  /* RPC */
  async function rpcCall(method, params) {
    const res = await fetch(RPC_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message||JSON.stringify(json.error));
    return json.result;
  }

  async function sendTx(operation) {
    if (!walletAddr) throw new Error("Wallet not connected");
    const hRes = await fetch(`${HORIZON_URL}/accounts/${walletAddr}`);
    if (!hRes.ok) throw new Error("Account not found on testnet");
    const hData = await hRes.json();
    const account = new Account(walletAddr, hData.sequence);
    const baseTx = new TransactionBuilder(account,{fee:BASE_FEE,networkPassphrase:NETWORK_PASSPHRASE})
      .addOperation(operation).setTimeout(30).build();
    const txXdr    = baseTx.toEnvelope().toXDR("base64");
    const simResult = await rpcCall("simulateTransaction",{transaction:txXdr});
    if (simResult.error) throw new Error(`Simulation failed: ${simResult.error}`);
    let prepared;
    try { prepared = SorobanRpc.assembleTransaction(baseTx, simResult).build(); }
    catch(e) { throw new Error(`assembleTransaction failed: ${e.message}`); }
    const preparedXdr = prepared.toEnvelope().toXDR("base64");
    let signResult;
    try { signResult = await signTransaction(preparedXdr,{networkPassphrase:NETWORK_PASSPHRASE}); }
    catch(e) { throw new Error(`Freighter signing failed: ${e.message||e}`); }
    let signedXdr;
    if (typeof signResult==="string")    signedXdr=signResult;
    else if (signResult?.signedTxXdr)    signedXdr=signResult.signedTxXdr;
    else if (signResult?.result)         signedXdr=signResult.result;
    else { console.error("Freighter shape:",JSON.stringify(signResult)); throw new Error(`No signed XDR. Got: ${JSON.stringify(signResult)}`); }
    const sendResult = await rpcCall("sendTransaction",{transaction:signedXdr});
    if (sendResult.status==="ERROR") throw new Error(`Submission failed: ${JSON.stringify(sendResult)}`);
    const txHash = sendResult.hash;
    let poll;
    do { await new Promise(r=>setTimeout(r,1500)); poll=await rpcCall("getTransaction",{hash:txHash}); }
    while (poll.status==="NOT_FOUND");
    if (poll.status==="FAILED") throw new Error("Transaction failed on-chain");
    return txHash;
  }

  /* vote */
  async function handleVote(index) {
    if (hasVoted) return;
    try {
      setStatus("loading"); setMessage("Waiting for signature..."); invalidateCache();
      const op = new Contract(CONTRACT_ID).call("vote", new Address(walletAddr).toScVal(), nativeToScVal(index,{type:"u32"}));
      const hash = await sendTx(op);
      markLocalVoted(walletAddr); saveLocalTxHash(walletAddr,hash);
      pushActivity(walletAddr, PROPOSALS[index].name, hash);
      setLastTxHash(hash); setHasVoted(true); setMyVote(PROPOSALS[index].name);
      setMessage("Vote cast successfully!"); setStatus("success");
      await load(walletAddr);
    } catch(e) {
      console.error(e);
      const msg = e.message||String(e);
      setStatus("error");
      const dupe = msg.includes("Already")||msg.includes("already")||msg.includes("Unreachable");
      if (dupe) { markLocalVoted(walletAddr); setHasVoted(true); }
      setMessage(dupe?"This wallet has already voted":`Vote failed: ${msg}`);
    }
  }

  /* admin */
  async function handleAdmin(method) {
    try {
      setStatus("loading"); setMessage(`Running ${method}...`); invalidateCache();
      const op = new Contract(CONTRACT_ID).call(method);
      const hash = await sendTx(op);
      if (method==="start_voting") { const dl=Date.now()+48*60*60*1000; saveDeadline(dl); setDeadline(dl); }
      if (method==="end_voting")   { saveDeadline(0); setDeadline(0); }
      setLastTxHash(hash); setMessage(`${method} completed`); setStatus("success");
      await load(walletAddr);
    } catch(e) { setStatus("error"); setMessage(`Admin failed: ${e.message||e}`); }
  }

  /* derived */
  const isAdmin    = walletAddr===ADMIN_PUBKEY;
  const hoursLeft  = countdown.d*24+countdown.h;
  const isUrgent   = votingOpen&&deadline>0&&hoursLeft<24;
  const isCritical = votingOpen&&deadline>0&&hoursLeft<12;
  const deadlineDate = deadline
    ? new Date(deadline).toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"})
    : null;

  /* donut SVG */
  const donutPct = totalVotes > 0 ? Math.min(totalVotes/20, 1) : 0; // assume ~20 eligible
  const R=24, circ=2*Math.PI*R, dash=circ*donutPct;

  /* ── render ── */
  return (
    <>
      <style>{CSS}</style>
      <div className="app">

        {/* header */}
        <div className="app-header">
          <h1>🗳️ Stellar Voting dApp</h1>
        </div>
        <div className="net-badge"><span className="net-dot"/>Testnet</div>

        {/* banners */}
        {status==="loading" && <div className="banner loading"><span className="spinner"/>{message||"Loading..."}</div>}
        {status==="success" && (
          <div className="banner success">
            <span>{message}</span>
            {lastTxHash && <a href={`${EXPLORER_TX}${lastTxHash}`} target="_blank" rel="noreferrer" className="tx-link">View tx →</a>}
          </div>
        )}
        {status==="error" && <div className="banner error">{message}</div>}
        {isCritical && <div className="banner urgent pulse">⚠️ Voting closes very soon — cast your vote now!</div>}
        {isUrgent&&!isCritical && <div className="banner urgent">🔔 Less than 24 hours remaining — don't miss out!</div>}

        {/* status card */}
        <div className="card">
          <h2>Status</h2>
          <div className="status-row">
            <span className={`badge ${votingOpen?"open":"closed"}`}>
              {votingOpen && <span className="pulse-dot"/>}
              {votingOpen?"Voting Open":"Voting Closed"}
            </span>
            <span className="total-votes">Total votes cast: <strong>{totalVotes}</strong></span>
          </div>
          {votingOpen&&deadline>0&&countdown.total>0 && (
            <div className={`countdown-wrap${isCritical?" critical":isUrgent?" urgent-cd":""}`}>
              <p className="countdown-label">⏱ Voting closes in</p>
              <div className="countdown-digits">
                {[["d","Days"],["h","Hrs"],["m","Min"],["s","Sec"]].map(([k,l])=>(
                  <div key={k} className="countdown-unit">
                    <span className="countdown-num">{String(countdown[k]).padStart(2,"0")}</span>
                    <span className="countdown-sub">{l}</span>
                  </div>
                ))}
              </div>
              {deadlineDate&&<p className="countdown-date">Ends {deadlineDate}</p>}
            </div>
          )}
          {votingOpen&&deadline===0 && <p className="muted" style={{marginTop:"0.5rem",fontSize:"0.75rem"}}>No deadline set — admin controls end time</p>}
        </div>

        {/* wallet card */}
        <div className="card">
          <h2>Your Wallet</h2>
          {walletAddr ? (
            <>
              <div className="wallet-row">
                <div className="wallet-pill">
                  <span className="wallet-check">✅</span>
                  <span>{walletAddr.slice(0,8)}…{walletAddr.slice(-6)}</span>
                  {isAdmin && <span className="admin-badge">👑 Admin</span>}
                </div>
                <button className="btn btn-danger" onClick={disconnect}>Disconnect</button>
              </div>
              {hasVoted && (
                <div className="receipt-card">
                  <div className="receipt-header">
                    <span>✅ Vote Confirmed</span>
                    <span className="receipt-chip">On-Chain</span>
                  </div>
                  {myVote&&<div className="receipt-row"><span className="rl">Voted for</span><span className="rv"><strong>{myVote}</strong></span></div>}
                  <div className="receipt-row"><span className="rl">Wallet</span><span className="rv mono">{walletAddr.slice(0,6)}…{walletAddr.slice(-4)}</span></div>
                  <div className="receipt-row"><span className="rl">Network</span><span className="rv">Stellar Testnet</span></div>
                  {lastTxHash && (
                    <>
                      <div className="receipt-row"><span className="rl">Tx Hash</span><span className="rv mono">{lastTxHash.slice(0,8)}…{lastTxHash.slice(-6)}</span></div>
                      <div className="receipt-actions">
                        <a href={`${EXPLORER_TX}${lastTxHash}`} target="_blank" rel="noreferrer" className="rl-btn">🔍 View Transaction →</a>
                        <a href={`${EXPLORER_ACCT}${walletAddr}`} target="_blank" rel="noreferrer" className="rl-btn">👤 View Wallet →</a>
                      </div>
                    </>
                  )}
                  {!lastTxHash&&<p className="muted" style={{marginTop:"0.5rem",fontSize:"0.72rem"}}>Tx hash unavailable (voted in a previous session)</p>}
                </div>
              )}
            </>
          ) : (
            <div className="connect-area">
              <button className="btn btn-connect" onClick={connect}>🔗 Connect Freighter</button>
              <p className="muted-note">Your keys stay in your wallet</p>
            </div>
          )}
        </div>

        {/* proposals card */}
        <div className="card">
          <h2>Proposals</h2>
          {PROPOSALS.map((p,i)=>{
            const pct = totalVotes>0 ? Math.round((votes[i]/totalVotes)*100) : 0;
            return (
              <div key={i} className="proposal">
                <div className="proposal-header">
                  <div>
                    <span className="proposal-name">{p.name}</span>
                    <span className="proposal-desc">{p.description}</span>
                  </div>
                  <div className="vote-stat">{votes[i]} vote{votes[i]!==1?"s":""} · <strong>{pct}%</strong></div>
                </div>
                <div className="progress-track"><div className="progress-fill" style={{width:`${pct}%`}}/></div>
                {walletAddr&&votingOpen&&(
                  <button
                    className={`btn ${hasVoted?"btn-voted":"btn-primary"}`}
                    onClick={()=>!hasVoted&&handleVote(i)}
                    disabled={hasVoted||status==="loading"}
                  >
                    {hasVoted?"✔ Already Voted":`Vote for ${p.name}`}
                  </button>
                )}
              </div>
            );
          })}
          {!walletAddr&&<p className="muted" style={{marginTop:"0.5rem"}}>Connect wallet to vote</p>}
        </div>

        {/* analytics + activity two-col */}
        <div className="two-col">
          {/* analytics */}
          <div className="card" style={{marginBottom:0}}>
            <h2>Analytics</h2>
            <div className="donut-wrap">
              <svg className="donut" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
                <circle cx="28" cy="28" r={R} fill="none" stroke="url(#dg)" strokeWidth="7"
                  strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={circ*0.25}
                  strokeLinecap="round" style={{transition:"stroke-dasharray 0.6s ease"}}/>
                <defs>
                  <linearGradient id="dg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7c3aed"/>
                    <stop offset="100%" stopColor="#a78bfa"/>
                  </linearGradient>
                </defs>
              </svg>
              <div className="donut-label">
                <strong>{totalVotes}</strong><br/>
                votes cast<br/>
                <span style={{fontSize:"0.7rem",color:"var(--muted)"}}>on Stellar Testnet</span>
              </div>
            </div>
            <div style={{marginTop:"1rem"}}>
              <p className="info-row" style={{marginBottom:"0.3rem",fontSize:"0.72rem",textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--muted)"}}>Voting Period</p>
              {deadlineDate
                ? <p className="info-row">Ends <strong>{deadlineDate}</strong></p>
                : <p className="info-row">{votingOpen?"Ongoing — no deadline set":"Voting is closed"}</p>
              }
            </div>
            <div style={{marginTop:"0.9rem"}}>
              <p className="info-row" style={{marginBottom:"0.4rem",fontSize:"0.72rem",textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--muted)"}}>Smart Contract</p>
              <a href={`${EXPLORER_ACCT}${CONTRACT_ID}`} target="_blank" rel="noreferrer" className="contract-link">
                🔗 View on Stellar Explorer ↗
              </a>
            </div>
          </div>

          {/* recent activity */}
          <div className="card" style={{marginBottom:0}}>
            <h2>Recent Activity</h2>
            {activity.length===0
              ? <p className="muted">No votes recorded yet in this browser session.</p>
              : (
                <div className="activity-list">
                  {activity.map((a,idx)=>(
                    <div key={idx} className="activity-row">
                      <div className="act-left">
                        <span className="act-dot"/>
                        <div>
                          <span className="act-name">…{a.wallet.slice(-4)}</span>
                          <span className="act-for"> voted </span>
                          <span className="act-proposal">{a.proposal}</span>
                        </div>
                      </div>
                      <div className="act-right">
                        <span className="act-time">{timeAgo(a.ts)}</span>
                        {a.hash&&<a href={`${EXPLORER_TX}${a.hash}`} target="_blank" rel="noreferrer" className="act-link">↗</a>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
            {activity.length>0&&(
              <button className="btn btn-ghost" style={{marginTop:"0.75rem",fontSize:"0.72rem",padding:"0.3rem 0.75rem"}}
                onClick={()=>{setActivity([]);localStorage.removeItem(ACTIVITY_K);}}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* winner */}
        {winner&&totalVotes>0&&!votingOpen&&(
          <div className="card winner-card">
            <h2>🏆 Winner</h2>
            <p className="winner-name">{winner.name}</p>
            <p className="winner-sub">{winner.votes} vote{winner.votes!==1?"s":""} · Won the election</p>
          </div>
        )}

        {/* admin */}
        {isAdmin&&(
          <div className="card admin-card">
            <h2>👑 Admin Controls</h2>
            <div className="admin-btns">
              <button className="btn btn-primary" onClick={()=>handleAdmin("start_voting")} disabled={status==="loading"||votingOpen}>▶ Start Voting</button>
              <button className="btn btn-danger" onClick={()=>handleAdmin("end_voting")} disabled={status==="loading"||!votingOpen}>⏹ End Voting</button>
            </div>
            <p className="admin-note">Starting voting automatically sets a 48-hour countdown.</p>
          </div>
        )}

      </div>
    </>
  );
}