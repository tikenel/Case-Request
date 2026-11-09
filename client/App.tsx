import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, CATALOG_STATUS, CATEGORIES, procedureById, type Admission, type Anesthesia, type Setting } from "../shared/catalog";
import type { ChartSummary, NoteRef } from "../shared/chart";
import { searchDiagnoses } from "../shared/diagnoses";
import { searchProcedures, type Side } from "../shared/match";
import {
  booking, checklistFor, emptyRequest, packetText, postingLine, schedulerPacket, validate,
  type DatePlan, type PriorAuth, type SurgeryRequest, type Urgency,
} from "../shared/request";
import { applySuggestion, defaultAccepted, offlineSuggestion, type Accepted, type Suggestion } from "../shared/suggestion";
import { defaultPeople, matchMember, surgeonChoices, type TeamMember } from "../shared/team";
import { CLASS_LABEL, lastDoseDate, matchesFavorite, plansFor, withFavorite, withoutFavorite, type Favorites, type MedPlan } from "../shared/meds";
import { loadFavorites, saveFavorites } from "./favorites";
import { defaultLocation, LOCATIONS, type Location } from "../shared/locations";
import { formatWhen, stages, type Tracking } from "../shared/tracking";
import {
  aiHeaders, fileNote, loadBoard, loadChart, loadTeam, loadTracking, readNote, sendOrders, TRACKING_LIST, WRITE_NOTE, WRITE_ORDERS,
  type BoardRow, type Session,
} from "./fhir";
import { createDictation } from "./speech";

type Config = { ai: boolean; model: string | null; demo: boolean };

export default function App({ session }: { session: Session }) {
  const [chart, setChart] = useState<ChartSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<Config>({ ai: false, model: null, demo: false });
  const [req, setReq] = useState<SurgeryRequest>(() => emptyRequest(null));
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [view, setView] = useState<"patient" | "board">("patient");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Favorites>({});

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig).catch(() => undefined);
    Promise.all([loadChart(session), loadTeam(session)])
      .then(([c, t]) => {
        setChart(c);
        setTeam(t);
        // Signed-in surgeon (roster) or physician becomes the operating surgeon; APPs pick one.
        const people = defaultPeople(c.signedIn, t);
        const fallback = c.signedIn ? "" : c.user ?? "";
        const favs = loadFavorites(c.signedIn);
        setFavorites(favs);
        setReq((r) => ({
          ...r,
          surgeon: r.surgeon || people.surgeon || fallback,
          requestedBy: r.requestedBy || people.requestedBy || c.user || "",
          // Decisions for anticoagulants, antiplatelets and kidney-risk drugs, prefilled from the user's usual.
          medPlans: plansFor(c.meds.map((m) => m.display), favs, r.medPlans),
        }));
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [session]);

  // Keep the pre-op checklist in step with the procedures and the chart.
  const checklistKey = JSON.stringify([req.procedures.map((p) => p.id), req.anesthesia, req.admission, req.urgency, req.priorAuth, Boolean(chart)]);
  useEffect(() => {
    setReq((r) => {
      const next = checklistFor(r, chart);
      return JSON.stringify(next) === JSON.stringify(r.checklist) ? r : { ...r, checklist: next };
    });
  }, [checklistKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof SurgeryRequest>(k: K, v: SurgeryRequest[K]) => setReq((r) => ({ ...r, [k]: v }));
  const updateFavorites = (f: Favorites) => {
    setFavorites(f);
    saveFavorites(chart?.signedIn ?? null, f);
  };

  if (loadError) return <div className="fatal">Couldn't read the chart from Epic: {loadError}. Relaunch the app from the patient's chart.</div>;
  if (!chart) return <div className="loading">Reading the chart…</div>;

  return (
    <div className="app">
      <Header chart={chart} config={config} demo={session.kind === "demo"} view={view} setView={setView} showBoard={session.kind === "demo" || !!TRACKING_LIST} />
      {view === "board" ? (
        <main><Board session={session} /></main>
      ) : (
      <main>
        <StatusPanel session={session} patientId={chart.patient.id} sentAt={sentAt} />
        <Describe session={session} chart={chart} config={config} onApply={(s, a) => setReq((r) => applySuggestion(r, s, a))} />
        <Procedures req={req} setReq={setReq} />
        <Diagnoses req={req} setReq={setReq} chart={chart} />
        <Medications req={req} setReq={setReq} chart={chart} favorites={favorites} setFavorites={updateFavorites} />
        <Timing req={req} set={set} />
        <Booking req={req} set={set} team={team} chart={chart} />
        <Checklist req={req} setReq={setReq} />
        <Review req={req} chart={chart} session={session} onSent={() => setSentAt(Date.now())} />
      </main>
      )}
      <footer>{CATALOG_STATUS} The surgeon is responsible for the final request.</footer>
    </div>
  );
}

/* ── Header and patient flags ─────────────────────────────────────────── */

function Header({ chart, config, demo, view, setView, showBoard }: { chart: ChartSummary; config: Config; demo: boolean; view: "patient" | "board"; setView: (v: "patient" | "board") => void; showBoard: boolean }) {
  const p = chart.patient;
  const anticoag = chart.meds.filter((m) => m.flags.includes("anticoagulant"));
  const antiplatelet = chart.meds.filter((m) => m.flags.includes("antiplatelet"));
  const contrast = chart.allergies.filter((a) => a.contrast);
  const egfr = chart.labs.egfr;
  return (
    <header>
      <div className="brand">
        OR <b>Request</b> <span className="sub">Vascular surgery scheduling</span>
        {demo && <span className="pill warn">Demo patient</span>}
        <span className={`pill ${config.ai ? "ok" : ""}`}>{config.ai ? "AI on" : "AI off"}</span>
        {showBoard && (
          <span className="seg tabs">
            <button className={view === "patient" ? "on" : ""} onClick={() => setView("patient")}>This patient</button>
            <button className={view === "board" ? "on" : ""} onClick={() => setView("board")}>My cases</button>
          </span>
        )}
      </div>
      <div className="patient">
        <strong>{p.name}</strong>
        {p.mrn && <span>MRN {p.mrn}</span>}
        {p.birthDate && <span>DOB {p.birthDate}{p.age !== null && ` (${p.age} y)`}</span>}
        {p.sex && <span>{p.sex}</span>}
        {chart.coverage[0] && <span>{chart.coverage[0].payer}</span>}
      </div>
      <div className="flags">
        {anticoag.length > 0 && <span className="flag red">Anticoagulant: {anticoag.map((m) => m.display).join(", ")}</span>}
        {antiplatelet.length > 0 && <span className="flag amber">Antiplatelet: {antiplatelet.map((m) => m.display).join(", ")}</span>}
        {contrast.length > 0 && <span className="flag red">Contrast allergy</span>}
        {chart.allergyStatus === "not on file" && <span className="flag amber">Allergies not on file</span>}
        {egfr && <span className={`flag ${egfr.value < 45 ? "amber" : ""}`}>eGFR {egfr.value}{egfr.date ? ` (${egfr.date.slice(0, 10)})` : ""}</span>}
        {chart.labs.inr && <span className="flag">INR {chart.labs.inr.value}</span>}
      </div>
    </header>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2><span className="n">{n}</span>{title}</h2>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

/* ── 1. Describe the case: typed, dictated, or read from a note ───────── */

function Describe({ session, chart, config, onApply }: { session: Session; chart: ChartSummary; config: Config; onApply: (s: Suggestion, a: Accepted) => void }) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [noteId, setNoteId] = useState<string>("");
  const [noteBody, setNoteBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const rec = useRef<ReturnType<typeof createDictation>>(null);

  const toggleMic = () => {
    if (listening) return rec.current?.stop();
    rec.current = createDictation(
      (fin, int) => {
        if (fin) setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${fin.trim()}`);
        setInterim(int);
      },
      () => { setListening(false); setInterim(""); },
      (msg) => setError(msg),
    );
    if (!rec.current) return setError("Dictation isn't available in this browser.");
    setListening(true);
    rec.current.start();
  };

  async function run(mode: "phrase" | "note", body: string) {
    setError(null);
    setSuggestion(null);
    if (!body.trim()) return;
    if (!config.ai) {
      if (mode === "note") return setError("AI is off on this server, so notes can't be read automatically. Type the plan instead.");
      return setSuggestion(offlineSuggestion(body));
    }
    setBusy(mode === "note" ? "Reading the note…" : "Interpreting…");
    try {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...aiHeaders(session) },
        body: JSON.stringify({
          mode,
          text: body,
          today: new Date().toLocaleDateString("en-CA"),
          context: { age: chart.patient.age, sex: chart.patient.sex, problems: chart.problems.map((p) => `${p.code ?? ""} ${p.display}`.trim()) },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      setSuggestion(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (mode === "phrase") setSuggestion(offlineSuggestion(body));
    } finally {
      setBusy(null);
    }
  }

  async function loadNote(n: NoteRef) {
    setNoteId(n.id);
    setError(null);
    setBusy("Opening the note…");
    try {
      setNoteBody(await readNote(session, n));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section n={1} title="Describe the case" hint="Type or dictate the plan in your own words, or have the app read your clinic note. You confirm everything before it's used.">
      <div className="describe">
        <div className="col">
          <label>In your words</label>
          <textarea
            rows={3}
            value={text + (interim ? ` ${interim}` : "")}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Right fem-pop bypass with PTFE, elective in 2–3 weeks, hold Eliquis 3 days"
          />
          <div className="row">
            <button className="primary" disabled={!!busy || !text.trim()} onClick={() => run("phrase", text)}>
              {config.ai ? "Interpret" : "Find matches"}
            </button>
            <button onClick={toggleMic} className={listening ? "rec" : ""}>{listening ? "■ Stop dictation" : "🎙 Dictate"}</button>
          </div>
        </div>
        <div className="col">
          <label>From a note in the chart</label>
          {chart.notes.length === 0 ? (
            <p className="muted">No recent clinical notes were returned by Epic.</p>
          ) : (
            <select value={noteId} onChange={(e) => { const n = chart.notes.find((x) => x.id === e.target.value); if (n) void loadNote(n); }}>
              <option value="">Choose a note…</option>
              {chart.notes.map((n) => (
                <option key={n.id} value={n.id}>{n.date?.slice(0, 10) ?? "undated"} · {n.title}{n.author ? ` · ${n.author}` : ""}</option>
              ))}
            </select>
          )}
          {noteBody && (
            <>
              <textarea rows={6} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} className="note" />
              <p className="hint">Trim to the assessment and plan if the note is long.</p>
              <button className="primary" disabled={!!busy || !config.ai} onClick={() => run("note", noteBody)}>Read note</button>
            </>
          )}
        </div>
      </div>
      {busy && <p className="busy">{busy}</p>}
      {error && <p className="error">{error}</p>}
      {suggestion && <SuggestionCard s={suggestion} onApply={(a) => { onApply(suggestion, a); setSuggestion(null); }} onDismiss={() => setSuggestion(null)} />}
    </Section>
  );
}

function SuggestionCard({ s, onApply, onDismiss }: { s: Suggestion; onApply: (a: Accepted) => void; onDismiss: () => void }) {
  const [a, setA] = useState<Accepted>(() => defaultAccepted(s));
  const toggle = (k: "procedures" | "diagnoses", i: number) =>
    setA((x) => { const n = new Set(x[k]); n.has(i) ? n.delete(i) : n.add(i); return { ...x, [k]: n }; });
  const details = [
    s.urgency && `Urgency: ${s.urgency}`,
    s.datePlan && `Date: ${s.datePlan}${s.dateFrom ? ` ${s.dateFrom}` : ""}${s.dateTo ? ` – ${s.dateTo}` : ""}`,
    s.anesthesia && `Anesthesia: ${s.anesthesia}`,
    s.admission && `After surgery: ${s.admission}`,
    s.equipment.length > 0 && `Equipment: ${s.equipment.join(", ")}`,
    s.vendorNotes && `Vendor: ${s.vendorNotes}`,
    s.medicationPlan && `Medication plan: ${s.medicationPlan}`,
  ].filter(Boolean) as string[];
  return (
    <div className="suggestion">
      <p className="summary">{s.summary}</p>
      {s.procedures.length > 0 && <h4>Procedures</h4>}
      {s.procedures.map((p, i) => {
        const proc = procedureById(p.id)!;
        return (
          <label key={i} className="pick">
            <input type="checkbox" checked={a.procedures.has(i)} onChange={() => toggle("procedures", i)} />
            <span>
              <b>{p.side ? `${p.side} ` : ""}{proc.name}</b> <code>{proc.cpt}</code>{proc.addOn && <em className="tag">add-on</em>}
              <span className={`conf ${p.confidence}`}>{p.confidence}</span>
              {p.evidence && <q>{p.evidence}</q>}
            </span>
          </label>
        );
      })}
      {s.diagnoses.length > 0 && <h4>Diagnoses</h4>}
      {s.diagnoses.map((d, i) => (
        <label key={i} className="pick">
          <input type="checkbox" checked={a.diagnoses.has(i)} onChange={() => toggle("diagnoses", i)} />
          <span><code>{d.code}</code> {d.display} {d.evidence && <q>{d.evidence}</q>}</span>
        </label>
      ))}
      {details.length > 0 && (
        <label className="pick">
          <input type="checkbox" checked={a.details} onChange={() => setA((x) => ({ ...x, details: !x.details }))} />
          <span>{details.join(" · ")}</span>
        </label>
      )}
      {s.unmatched.length > 0 && <p className="warn">Not in the catalog (add by hand or in notes): {s.unmatched.join("; ")}</p>}
      {s.questions.length > 0 && <ul className="questions">{s.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>}
      <div className="row">
        <button className="primary" onClick={() => onApply(a)}>Add ticked items</button>
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}

/* ── 2. Procedures ────────────────────────────────────────────────────── */

function Procedures({ req, setReq }: { req: SurgeryRequest; setReq: React.Dispatch<React.SetStateAction<SurgeryRequest>> }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const results = useMemo(() => (q ? searchProcedures(q, 12).map((m) => m.procedure) : cat ? CATALOG.filter((p) => p.category === cat) : []), [q, cat]);
  const add = (id: string) => {
    setReq((r) => ({ ...r, procedures: [...r.procedures, { id, side: null, note: "" }] }));
    setQ("");
  };
  const update = (i: number, patch: Partial<{ side: Side | null; note: string }>) =>
    setReq((r) => ({ ...r, procedures: r.procedures.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const remove = (i: number) => setReq((r) => ({ ...r, procedures: r.procedures.filter((_, j) => j !== i) }));

  return (
    <Section n={2} title="Procedures" hint="Search by name, abbreviation (fem-pop, BKA, TCAR) or CPT code, or browse a category.">
      <div className="row">
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search procedures or CPT…" />
        <select value={cat} onChange={(e) => { setCat(e.target.value); setQ(""); }}>
          <option value="">Browse category…</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {results.length > 0 && (
        <ul className="results">
          {results.map((p) => (
            <li key={p.id}>
              <button onClick={() => add(p.id)}>
                <code>{p.cpt}</code> {p.name} {p.addOn && <em className="tag">add-on</em>} <span className="muted">· {p.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {req.procedures.length === 0 ? (
        <p className="muted">No procedures yet.</p>
      ) : (
        <table className="procs">
          <tbody>
            {req.procedures.map((r, i) => {
              const p = procedureById(r.id)!;
              return (
                <tr key={i}>
                  <td><code>{p.cpt}</code></td>
                  <td>
                    {p.name} {p.addOn && <em className="tag">add-on</em>}
                    {p.verify && <div className="verify">⚠ {p.verify}</div>}
                  </td>
                  <td>
                    {p.sided ? (
                      <div className={`sides ${r.side ? "" : "missing"}`}>
                        {(["Left", "Right", "Bilateral"] as Side[]).map((s) => (
                          <button key={s} className={r.side === s ? "on" : ""} onClick={() => update(i, { side: s })}>{s}</button>
                        ))}
                      </div>
                    ) : <span className="muted">midline</span>}
                  </td>
                  <td><input value={r.note} onChange={(e) => update(i, { note: e.target.value })} placeholder="Detail (vessel, graft size…)" /></td>
                  <td><button className="x" onClick={() => remove(i)} aria-label="Remove">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/* ── 3. Diagnoses ─────────────────────────────────────────────────────── */

function Diagnoses({ req, setReq, chart }: { req: SurgeryRequest; setReq: React.Dispatch<React.SetStateAction<SurgeryRequest>>; chart: ChartSummary }) {
  const [q, setQ] = useState("");
  const add = (code: string, display: string) =>
    setReq((r) => (r.diagnoses.some((d) => d.code === code) ? r : { ...r, diagnoses: [...r.diagnoses, { code, display }] }));
  const remove = (code: string) => setReq((r) => ({ ...r, diagnoses: r.diagnoses.filter((d) => d.code !== code) }));
  const fromChart = chart.problems.filter((p) => p.code && !req.diagnoses.some((d) => d.code === p.code));
  const results = searchDiagnoses(q);
  const looksLikeCode = /^[A-TV-Z]\d[0-9A-Z](\.[0-9A-Z]{1,4})?$/i.test(q.trim());
  return (
    <Section n={3} title="Diagnosis" hint="Pick from the problem list, or search. Confirm the final code in Epic.">
      <div className="chips">
        {req.diagnoses.map((d) => (
          <span key={d.code} className="chip on"><code>{d.code}</code> {d.display} <button onClick={() => remove(d.code)}>×</button></span>
        ))}
      </div>
      {fromChart.length > 0 && (
        <>
          <label>Problem list</label>
          <div className="chips">
            {fromChart.map((p) => (
              <button key={p.code} className="chip" onClick={() => add(p.code!, p.display)}>+ <code>{p.code}</code> {p.display}</button>
            ))}
          </div>
        </>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search diagnosis or ICD-10 code…" />
      {(results.length > 0 || looksLikeCode) && (
        <ul className="results">
          {results.map((d) => (
            <li key={d.code}><button onClick={() => { add(d.code, d.display); setQ(""); }}><code>{d.code}</code> {d.display}</button></li>
          ))}
          {looksLikeCode && !results.some((d) => d.code.toUpperCase() === q.trim().toUpperCase()) && (
            <li><button onClick={() => { add(q.trim().toUpperCase(), "(entered by hand)"); setQ(""); }}>Use code <code>{q.trim().toUpperCase()}</code></button></li>
          )}
        </ul>
      )}
    </Section>
  );
}

/* ── 4. Medications and medical history ─────────────────────────────── */

function Medications({ req, setReq, chart, favorites, setFavorites }: {
  req: SurgeryRequest; setReq: React.Dispatch<React.SetStateAction<SurgeryRequest>>; chart: ChartSummary; favorites: Favorites; setFavorites: (f: Favorites) => void;
}) {
  const update = (agent: string, patch: Partial<MedPlan>) =>
    setReq((r) => ({ ...r, medPlans: r.medPlans.map((m) => (m.agent === agent ? { ...m, ...patch, fromFavorite: false } : m)) }));
  const decided = new Set(req.medPlans.map((m) => m.med));
  const others = chart.meds.filter((m) => !decided.has(m.display));
  const surgeryDate = req.datePlan === "On date" && req.dateFrom ? req.dateFrom : null;
  return (
    <Section n={4} title="Medications & medical history" hint="From the chart. Decide continue or hold for blood thinners and kidney-risk drugs; ★ saves your usual choice for next time.">
      {req.medPlans.length === 0 ? (
        <p className="muted">No anticoagulants, antiplatelets or kidney-risk medications on file.</p>
      ) : (
        <table className="meds">
          <tbody>
            {req.medPlans.map((m) => {
              const fav = matchesFavorite(favorites, m);
              const last = m.action === "hold" && m.holdDays && surgeryDate ? lastDoseDate(surgeryDate, m.holdDays) : null;
              return (
                <tr key={m.agent} className={m.action ? "" : m.cls === "anticoagulant" ? "needs" : ""}>
                  <td>
                    <b>{m.med}</b>
                    <div><span className={`cls ${m.cls}`}>{CLASS_LABEL[m.cls]}</span>{m.fromFavorite && fav && <span className="muted small"> · your usual</span>}</div>
                  </td>
                  <td>
                    <label className="tick"><input type="radio" name={`med-${m.agent}`} checked={m.action === "continue"} onChange={() => update(m.agent, { action: "continue", holdDays: null })} /> Continue</label>
                    <label className="tick">
                      <input type="radio" name={`med-${m.agent}`} checked={m.action === "hold"} onChange={() => update(m.agent, { action: "hold", holdDays: m.holdDays ?? favorites[m.agent]?.holdDays ?? null })} /> Hold for
                      <input className="days" type="number" min={1} max={60} value={m.holdDays ?? ""} placeholder="X"
                        onChange={(e) => update(m.agent, { action: "hold", holdDays: e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null })} />
                      days
                    </label>
                    {last && <div className="muted small">Last dose {last}</div>}
                  </td>
                  <td>
                    <button className={`star ${fav ? "on" : ""}`} disabled={!m.action || (m.action === "hold" && !m.holdDays)}
                      title={fav ? "Your usual for this drug. Click to forget it." : "Save as my usual for this drug"}
                      onClick={() => setFavorites(fav ? withoutFavorite(favorites, m.agent) : withFavorite(favorites, m))}>
                      {fav ? "★" : "☆"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="grid two">
        <div className="field">
          <label>Other active medications ({others.length})</label>
          {others.length ? <ul className="plain">{others.map((m) => <li key={m.display}>{m.display}</li>)}</ul> : <p className="muted">None on file.</p>}
        </div>
        <div className="field">
          <label>Medical problems ({chart.problems.length})</label>
          {chart.problems.length ? <ul className="plain">{chart.problems.map((p) => <li key={`${p.code}${p.display}`}>{p.display}{p.code && <span className="muted"> · {p.code}</span>}</li>)}</ul> : <p className="muted">None on the problem list.</p>}
        </div>
      </div>
    </Section>
  );
}

/* ── 4. Timing ────────────────────────────────────────────────────────── */

type Setter = <K extends keyof SurgeryRequest>(k: K, v: SurgeryRequest[K]) => void;

function Timing({ req, set }: { req: SurgeryRequest; set: Setter }) {
  return (
    <Section n={5} title="When">
      <div className="row wrap">
        <div className="seg">
          {(["Elective", "Urgent", "Emergent"] as Urgency[]).map((u) => (
            <button key={u} className={req.urgency === u ? `on ${u.toLowerCase()}` : ""} onClick={() => set("urgency", u)}>{u}</button>
          ))}
        </div>
        <select value={req.datePlan} onChange={(e) => set("datePlan", e.target.value as DatePlan)}>
          {(["First available", "On date", "No later than", "Between dates"] as DatePlan[]).map((d) => <option key={d}>{d}</option>)}
        </select>
        {req.datePlan !== "First available" && <input type="date" value={req.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} />}
        {req.datePlan === "Between dates" && <>and <input type="date" value={req.dateTo} onChange={(e) => set("dateTo", e.target.value)} /></>}
      </div>
    </Section>
  );
}

/* ── 5. Booking details ───────────────────────────────────────────────── */

function Booking({ req, set, team, chart }: { req: SurgeryRequest; set: Setter; team: TeamMember[]; chart: ChartSummary }) {
  const b = booking(req);
  const choices = surgeonChoices(chart.signedIn, team);
  const [other, setOther] = useState(false);
  const typed = other || (!!req.surgeon && !choices.includes(req.surgeon));
  const me = matchMember(chart.signedIn, team);
  const pick = <T extends string>(label: string, key: "anesthesia" | "admission", options: T[], derived: T) => (
    <div className="field">
      <label>{label}</label>
      <select value={(req[key] as string | null) ?? ""} onChange={(e) => set(key, (e.target.value || null) as never)}>
        <option value="">{derived} (default)</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
  return (
    <Section n={6} title="Room, time and equipment" hint="Defaults come from the procedures. Change anything that's different for this patient.">
      <div className="grid">
        <div className="field">
          <label>Location</label>
          <select className={req.procedures.length && !b.location ? "missing" : ""} value={req.location ?? ""} onChange={(e) => set("location", (e.target.value || null) as Location | null)}>
            <option value="">{req.procedures.length ? `${defaultLocation(b.setting)} (default)` : "Choose a location…"}</option>
            {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        {pick<Anesthesia>("Anesthesia", "anesthesia", ["General", "MAC/sedation", "Regional", "Local"], b.anesthesia)}
        {pick<Admission>("After surgery", "admission", ["Outpatient", "Overnight (23 h)", "Inpatient", "ICU"], b.admission)}
        <div className="field">
          <label>Minutes to book</label>
          <input type="number" min={15} step={15} value={req.minutes ?? ""} placeholder={b.minutes ? `${b.minutes} (default)` : "Add a procedure first"} onChange={(e) => set("minutes", e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="field">
          <label>Prior authorization</label>
          <select value={req.priorAuth} onChange={(e) => set("priorAuth", e.target.value as PriorAuth)}>
            {(["Unknown", "Not required", "Needed", "Submitted", "Approved"] as PriorAuth[]).map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Operating surgeon</label>
          {choices.length > 0 && (
            <select value={typed ? "__other" : req.surgeon} onChange={(e) => { const v = e.target.value; setOther(v === "__other"); set("surgeon", v === "__other" ? "" : v); }}>
              <option value="">Choose the surgeon…</option>
              {choices.map((n) => <option key={n} value={n}>{n}{chart.signedIn && n === (me?.name ?? chart.signedIn.name) ? " (you)" : ""}</option>)}
              <option value="__other">Other (type a name)…</option>
            </select>
          )}
          {(typed || choices.length === 0) && <input value={req.surgeon} onChange={(e) => set("surgeon", e.target.value)} placeholder="Surgeon's name" />}
          {req.requestedBy && req.requestedBy !== req.surgeon && <p className="hint">Requested by {req.requestedBy}{me && me.role !== "Surgeon" ? ` (${me.role})` : ""}</p>}
        </div>
      </div>
      {b.equipment.length > 0 && (
        <>
          <label>Equipment the scheduler will request</label>
          <ul className="equip">{b.equipment.map((e) => <li key={e}>{e}</li>)}</ul>
        </>
      )}
      <div className="grid two">
        <div className="field">
          <label>Other equipment</label>
          <textarea rows={2} value={req.extraEquipment} onChange={(e) => set("extraEquipment", e.target.value)} placeholder="One per line" />
        </div>
        <div className="field">
          <label>Device / vendor {b.vendor && <em className="tag">needed</em>}</label>
          <textarea rows={2} value={req.vendorNotes} onChange={(e) => set("vendorNotes", e.target.value)} placeholder="Company, device, size" />
        </div>
      </div>
      <div className="field">
        <label>Notes for the scheduler</label>
        <textarea rows={2} value={req.schedulerNotes} onChange={(e) => set("schedulerNotes", e.target.value)} />
      </div>
    </Section>
  );
}

/* ── 6. Pre-op checklist ──────────────────────────────────────────────── */

function Checklist({ req, setReq }: { req: SurgeryRequest; setReq: React.Dispatch<React.SetStateAction<SurgeryRequest>> }) {
  const update = (id: string, patch: Partial<{ done: boolean; detail: string }>) =>
    setReq((r) => ({ ...r, checklist: r.checklist.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  return (
    <Section n={7} title="Before the date" hint="Built from the procedures and the chart. Tick what's already done; write plans where asked.">
      {req.checklist.length === 0 ? <p className="muted">Add a procedure to see the checklist.</p> : (
        <ul className="checklist">
          {req.checklist.map((c) => (
            <li key={c.id}>
              <label>
                <input type="checkbox" checked={c.done} onChange={(e) => update(c.id, { done: e.target.checked })} />
                <span><b>{c.label}</b> <span className="muted">{c.why}</span></span>
              </label>
              <input value={c.detail} onChange={(e) => update(c.id, { detail: e.target.value })} placeholder="Plan or detail" />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ── 7. Review and send ───────────────────────────────────────────────── */

function Review({ req, chart, session, onSent }: { req: SurgeryRequest; chart: ChartSummary; session: Session; onSent: () => void }) {
  const issues = validate(req);
  const errors = issues.filter((i) => i.level === "error");
  const packet = schedulerPacket(req, chart);
  const text = packetText(req, chart);
  const [status, setStatus] = useState<string | null>(null);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setStatus(`${label}…`);
    try {
      await fn();
      setStatus(`${label}: done.`);
      onSent();
    } catch (e) {
      setStatus(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Section n={8} title="Review and send">
      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((i, k) => <li key={k} className={i.level}>{i.level === "error" ? "Required" : "Check"}: {i.message}</li>)}
        </ul>
      )}
      {req.procedures.length > 0 && <p className="posting">{postingLine(req)}</p>}
      <div className="packet" id="packet">
        <h3>Vascular surgery scheduling request</h3>
        {packet.map((s) => (
          <div key={s.title} className="step">
            <h4>{s.title}</h4>
            <ul>{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="row wrap">
        <button className="primary" disabled={errors.length > 0} onClick={() => act("Copied", () => navigator.clipboard.writeText(text))}>Copy for scheduler</button>
        <button disabled={errors.length > 0} onClick={() => window.print()}>Print</button>
        {WRITE_NOTE && <button disabled={errors.length > 0} onClick={() => act("Filed note in Epic", () => fileNote(session, chart, text))}>File note in Epic</button>}
        {WRITE_ORDERS && <button disabled={errors.length > 0} onClick={() => act("Sent orders to Epic", () => sendOrders(session, req, chart))}>Send as orders</button>}
        {errors.length > 0 && <span className="muted">Fix the required items above to send.</span>}
      </div>
      {status && <p className="busy">{status}</p>}
    </Section>
  );
}

/* ── Scheduling status (live from Epic) ──────────────────────────────── */

const REFRESH_MS = 60_000;

/** Re-runs `load` every minute while the page is visible, and when `trigger` changes. */
function usePolling<T>(load: () => Promise<T>, trigger: unknown) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef(load);
  run.current = load;
  const refresh = async () => {
    setBusy(true);
    try {
      setData(await run.current());
      setError(null);
      setAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, at, busy, refresh };
}

function Updated({ at, busy, refresh, demo }: { at: Date | null; busy: boolean; refresh: () => void; demo: boolean }) {
  return (
    <span className="updated">
      {busy ? "Checking Epic…" : demo ? "Demo data (not from Epic)" : at ? `Live from Epic · updated ${at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
      <button onClick={refresh} disabled={busy}>Refresh</button>
    </span>
  );
}

function Stages({ t, sentHere }: { t: Tracking; sentHere: boolean }) {
  const s = stages(t, sentHere);
  return (
    <>
      {s.cancelled && <p className="error">Cancelled in Epic: {s.cancelled.description}{s.cancelled.comment ? ` · “${s.cancelled.comment}”` : ""}</p>}
      <ol className="stages">
        {s.stages.map((st) => (
          <li key={st.key} className={st.state}>
            <span className="dot" />
            <b>{st.label}</b>
            {st.detail && <span className="muted">{st.detail}</span>}
          </li>
        ))}
      </ol>
    </>
  );
}

function StatusPanel({ session, patientId, sentAt }: { session: Session; patientId: string; sentAt: number | null }) {
  const { data, error, at, busy, refresh } = usePolling(() => loadTracking(session, patientId), `${patientId}:${sentAt}`);
  return (
    <section className="status">
      <h2><span className="n">●</span>Scheduling status <Updated at={at} busy={busy} refresh={refresh} demo={session.kind === "demo"} /></h2>
      {error && <p className="warn">{error}</p>}
      {data && <Stages t={data} sentHere={sentAt !== null} />}
    </section>
  );
}

function Board({ session }: { session: Session }) {
  const { data, error, at, busy, refresh } = usePolling(() => loadBoard(session), "board");
  return (
    <section>
      <h2>My cases <Updated at={at} busy={busy} refresh={refresh} demo={session.kind === "demo"} /></h2>
      <p className="hint">Patients on {session.kind === "demo" ? "the demo list" : "your Epic patient list"}, with where each request is in scheduling. Updates every minute.</p>
      {error && <p className="warn">{error}</p>}
      {data && data.length === 0 && <p className="muted">No patients on the list.</p>}
      {data && data.length > 0 && (
        <table className="board">
          <thead><tr><th>Patient</th><th>Status</th><th>Surgery</th></tr></thead>
          <tbody>
            {data.map((row: BoardRow) => {
              const s = row.tracking ? stages(row.tracking, false) : null;
              const current = s?.stages.find((x) => x.state === "current");
              const surgery = row.tracking?.surgeries[0];
              return (
                <tr key={row.id}>
                  <td><b>{row.name || row.id}</b></td>
                  <td>
                    {row.error ? <span className="warn">{row.error}</span> : (
                      <span className={`chip-status ${s?.cancelled ? "cancelled" : current?.key ?? "none"}`}>{s?.summary}</span>
                    )}
                    {current?.detail && current.key !== "scheduled" && <div className="muted small">{current.detail}</div>}
                  </td>
                  <td className="small">{surgery ? <>{surgery.description}{surgery.start ? <div className="muted">{formatWhen(surgery.start)}{surgery.location ? ` · ${surgery.location}` : ""}</div> : null}</> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
