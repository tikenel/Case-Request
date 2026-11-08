import { useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { connect, isSandbox, pickTestPatient, SANDBOX_PATIENTS, type Session } from "./fhir";
import "./styles.css";

/** Shown only when Epic opens the app without a patient (standalone testing). */
function PatientPicker({ session, onPick }: { session: Session; onPick: (s: Session) => void }) {
  const [id, setId] = useState("");
  return (
    <div className="fatal">
      <h2>No patient is open</h2>
      <p>In Epic the app opens from a patient's chart. For testing, choose a patient.</p>
      {isSandbox(session) && (
        <ul className="results">
          {SANDBOX_PATIENTS.map((p) => (
            <li key={p.id}>
              <button onClick={() => onPick(pickTestPatient(session, p.id))}>
                <b>{p.name}</b> <span className="muted">· Epic sandbox test patient · {p.has}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label>Or enter a FHIR patient ID</label>
      <div className="row">
        <input className="grow" value={id} onChange={(e) => setId(e.target.value.trim())} />
        <button className="primary" disabled={!id} onClick={() => onPick(pickTestPatient(session, id))}>Open</button>
      </div>
    </div>
  );
}

function Root({ initial }: { initial: Session }) {
  const [session, setSession] = useState(initial);
  if (session.kind === "epic" && !session.patientId) return <PatientPicker session={session} onPick={setSession} />;
  return <App session={session} />;
}

const root = createRoot(document.getElementById("root")!);
connect()
  .then((session) => root.render(<Root initial={session} />))
  .catch((err: unknown) => {
    root.render(
      <div className="fatal">
        <h2>Open this app from the patient's chart in Epic</h2>
        <p>{err instanceof Error ? err.message : String(err)}</p>
        <p>To try it with a made-up patient, add <code>?demo=1</code> to the address.</p>
      </div>,
    );
  });
