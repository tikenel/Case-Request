import { createRoot } from "react-dom/client";
import App from "./App";
import { connect } from "./fhir";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
connect()
  .then((session) => root.render(<App session={session} />))
  .catch((err: unknown) => {
    root.render(
      <div className="fatal">
        <h2>Open this app from the patient's chart in Epic</h2>
        <p>{err instanceof Error ? err.message : String(err)}</p>
        <p>To try it with a made-up patient, add <code>?demo=1</code> to the address.</p>
      </div>,
    );
  });
