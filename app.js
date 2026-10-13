import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { supabaseConfig } from "./supabase-config.js";
import NAMES from "./names.js";

const $ = (id) => document.getElementById(id);
const WHO = { mliko: "Mliko", danca: "Danča" };
const ROUND_LABELS = ["Předkolo", "Kolo 256", "Kolo 128", "Kolo 64", "Kolo 32", "Osmifinále", "Čtvrtfinále", "Semifinále", "Finále"];
const FINAL_ROUND = 8;

let db, who = localStorage.getItem("who");
const matches = new Map();      // id -> data
let currentRound = null;
const openComments = new Set();
const drafts = new Map();

if (!supabaseConfig.url || supabaseConfig.url.startsWith("VLOZ")) {
  showError("Chybí nastavení Supabase – vyplň supabase-config.js (viz README).");
} else {
  db = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  start();
}

function showError(msg) {
  $("error").textContent = msg;
  $("error").hidden = false;
}

async function start() {
  if (!WHO[who]) {
    $("login").hidden = false;
    $("login").addEventListener("click", (e) => {
      const w = e.target.dataset?.who;
      if (!w) return;
      localStorage.setItem("who", w);
      location.reload();
    });
    return;
  }
  $("meName").textContent = WHO[who];
  $("switch").onclick = (e) => { e.preventDefault(); localStorage.removeItem("who"); location.reload(); };
  $("fTodo").onchange = $("fTie").onchange = render;
  $("init").onclick = createBracket;

  const refresh = () => {
    if (matches.size === 0) {
      $("setup").hidden = false; $("app").hidden = true;
    } else {
      $("setup").hidden = true; $("app").hidden = false;
      render();
    }
  };

  db.channel("matches-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, (p) => {
      if (p.eventType === "DELETE") matches.delete(p.old.id);
      else matches.set(p.new.id, p.new);
      refresh();
    })
    .subscribe();

  const { data, error } = await db.from("matches").select("*");
  if (error) return showError("Chyba databáze: " + error.message);
  data.forEach((m) => matches.set(m.id, m));
  refresh();
}

// ---------- bracket structure ----------
const mid = (r, i) => `r${r}_${String(i).padStart(3, "0")}`;

function nextOf(m) {
  if (m.round === FINAL_ROUND) return null;
  if (m.round === 0) return { id: mid(1, 4 * m.idx), slot: "a" };
  return { id: mid(m.round + 1, m.idx >> 1), slot: m.idx % 2 === 0 ? "a" : "b" };
}

async function createBracket() {
  $("init").disabled = true;
  const names = NAMES.map((x) => ({ ...x }));
  for (let i = names.length - 1; i > 0; i--) {           // Fisher–Yates
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const playIn = 2 * (names.length - 256);                // 287 -> 62 jmen = 31 zápasů
  const slots = new Array(256).fill(null);
  const rest = names.slice(playIn);
  for (let s = 0, k = 0; s < 256; s++) {
    if (s % 8 === 0 && s / 8 < playIn / 2) continue;      // slot čeká na vítěze předkola
    slots[s] = rest[k++];
  }
  const rows = [];
  const put = (round, idx, a, b) => rows.push({
    id: mid(round, idx), round, idx, a, b, winner: null, votes: { mliko: null, danca: null }, comments: [],
  });
  for (let i = 0; i < playIn / 2; i++) put(0, i, names[2 * i], names[2 * i + 1]);
  for (let i = 0; i < 128; i++) put(1, i, slots[2 * i], slots[2 * i + 1]);
  for (let r = 2, n = 64; r <= FINAL_ROUND; r++, n /= 2) for (let i = 0; i < n; i++) put(r, i, null, null);
  const { error } = await db.from("matches").insert(rows);
  if (error) { showError("Chyba: " + error.message); $("init").disabled = false; return; }
  rows.forEach((m) => matches.set(m.id, m));
  $("setup").hidden = true; $("app").hidden = false;
  render();
}

// ---------- voting ----------
const sameName = (x, y) => (x?.n ?? null) === (y?.n ?? null);
const agreed = (m) => (m.a && m.b && m.votes.mliko && m.votes.mliko === m.votes.danca ? m.votes.mliko : null);

async function vote(id, side) {
  const local = new Map([...matches].map(([k, v]) => [k, structuredClone(v)]));
  const touched = new Set([id]);
  let cur = local.get(id);
  cur.votes[who] = cur.votes[who] === side ? null : side;
  for (;;) {
    cur.winner = agreed(cur);
    const nx = nextOf(cur);
    if (!nx) break;
    const target = local.get(nx.id);
    const entry = cur.winner ? cur[cur.winner] : null;
    if (sameName(target[nx.slot], entry)) break;
    target[nx.slot] = entry;
    target.votes = { mliko: null, danca: null };          // změna soupeře = hlasuje se znovu
    touched.add(nx.id);
    cur = target;
  }
  const rows = [...touched].map((t) => {
    const m = local.get(t);
    matches.set(t, { ...matches.get(t), a: m.a, b: m.b, votes: m.votes, winner: m.winner });
    return { id: t, round: m.round, idx: m.idx, a: m.a, b: m.b, votes: m.votes, winner: m.winner };
  });
  render();
  const { error } = await db.from("matches").upsert(rows);   // comments se nepřepisují
  if (error) showError("Chyba při ukládání: " + error.message);
}

async function addComment(id, text) {
  text = text.trim();
  if (!text) return;
  drafts.delete(id);
  const { error } = await db.rpc("add_comment", { p_id: id, p_comment: { who, text, ts: Date.now() } });
  if (error) showError("Chyba při ukládání: " + error.message);
}

// ---------- rendering ----------
const roundMatches = (r) => [...matches.values()].filter((m) => m.round === r).sort((a, b) => a.idx - b.idx);
const isTie = (m) => m.a && m.b && m.votes.mliko && m.votes.danca && m.votes.mliko !== m.votes.danca;
const needsMe = (m) => m.a && m.b && !m.votes[who];

function render() {
  const focused = document.activeElement;
  const focusId = focused?.matches?.("textarea") ? focused.dataset.id : null;
  const caret = focusId ? focused.selectionStart : 0;

  if (currentRound === null) {
    currentRound = 0;
    for (let r = 0; r <= FINAL_ROUND; r++) {
      if (roundMatches(r).some((m) => m.a && m.b && !m.winner)) { currentRound = r; break; }
    }
  }

  $("rounds").replaceChildren(...ROUND_LABELS.map((label, r) => {
    const ms = roundMatches(r);
    const done = ms.filter((m) => m.winner).length;
    const b = document.createElement("button");
    b.className = r === currentRound ? "on" : "";
    b.innerHTML = `${label}<small>${done}/${ms.length}</small>`;
    b.onclick = () => { currentRound = r; render(); };
    return b;
  }));

  let list = roundMatches(currentRound);
  const total = list.length;
  if ($("fTodo").checked) list = list.filter(needsMe);
  if ($("fTie").checked) list = list.filter(isTie);
  const ties = roundMatches(currentRound).filter(isTie).length;
  $("stats").textContent = `${total} zápasů · neshod: ${ties}`;

  const frag = list.map(matchCard);
  $("matches").replaceChildren(...(frag.length ? frag : [Object.assign(document.createElement("div"), { className: "empty", textContent: "Tady nic není." })]));

  if (focusId) {
    const t = document.querySelector(`textarea[data-id="${focusId}"]`);
    if (t) { t.focus(); t.setSelectionRange(caret, caret); }
  }
}

function sideButton(m, s) {
  const p = m[s];
  const btn = document.createElement("button");
  btn.className = "side";
  if (!p) {
    btn.disabled = true;
    btn.innerHTML = `<span class="nm tbd">čeká na vítěze…</span>`;
    return btn;
  }
  btn.disabled = !m.a || !m.b;
  if (m.votes[who] === s) btn.classList.add("mine");
  if (m.winner === s) btn.classList.add("won");
  const badges = ["mliko", "danca"].filter((w) => m.votes[w] === s)
    .map((w) => `<span class="badge">${w === "mliko" ? "M" : "D"}</span>`).join("");
  btn.innerHTML = `<span class="nm"></span><span class="meta"></span><span class="badges">${badges}</span>`;
  btn.querySelector(".nm").textContent = p.n;
  btn.querySelector(".meta").innerHTML =
    `${esc(p.d)}<br>♥ ${p.p ?? "n/a"} · #${p.r ?? "n/a"}`;
  btn.onclick = () => vote(mid(m.round, m.idx), s);
  return btn;
}

function matchCard(m) {
  const id = mid(m.round, m.idx);
  const el = document.createElement("div");
  el.className = "match" + (isTie(m) ? " tie" : m.winner ? " done" : "");

  const status = document.createElement("div");
  status.className = "status";
  status.textContent = isTie(m) ? "⚠ 1:1 – nesouhlasíte, rozhodněte se!"
    : m.winner ? `Postupuje: ${m[m.winner].n}`
    : !m.a || !m.b ? "" : `Hlasy: Mliko ${m.votes.mliko ? "✓" : "–"} · Danča ${m.votes.danca ? "✓" : "–"}`;

  const cs = m.comments || [];
  const toggle = document.createElement("button");
  toggle.className = "toggle";
  toggle.textContent = `💬 Komentáře (${cs.length})`;
  toggle.onclick = () => { openComments.has(id) ? openComments.delete(id) : openComments.add(id); render(); };

  el.append(sideButton(m, "a"), sideButton(m, "b"), status, toggle);

  if (openComments.has(id) || drafts.get(id)) {
    const box = document.createElement("div");
    box.className = "comments";
    cs.slice().sort((x, y) => x.ts - y.ts).forEach((c) => {
      const d = document.createElement("div");
      d.className = "comment";
      d.innerHTML = `<b>${esc(WHO[c.who] || c.who)}</b>: <span></span><time>${new Date(c.ts).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</time>`;
      d.querySelector("span").textContent = c.text;
      box.append(d);
    });
    const form = document.createElement("form");
    form.className = "cform";
    form.innerHTML = `<textarea rows="1" placeholder="Napiš komentář…"></textarea><button>Poslat</button>`;
    const ta = form.querySelector("textarea");
    ta.dataset.id = id;
    ta.value = drafts.get(id) || "";
    ta.oninput = () => drafts.set(id, ta.value);
    form.onsubmit = (e) => { e.preventDefault(); addComment(id, ta.value); };
    box.append(form);
    el.append(box);
  }
  return el;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
