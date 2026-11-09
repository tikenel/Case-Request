// Epic opens this page with ?iss=<FHIR server>&launch=<token>. Opened any other
// way (a link in an email, typed in a browser) there's no Epic server to sign in
// to, so explain that and offer the demo or a test sign-in to Epic's sandbox.
import { authorize } from "./fhir";

const SANDBOX_ISS = "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4";
const params = new URLSearchParams(location.search);

function explain() {
  document.title = "OR Request";
  document.body.innerHTML = `
    <main style="max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5">
      <h1 style="font-size:22px;margin:0 0 8px">OR <span style="color:#1f5fa8">Request</span></h1>
      <p>This is the app's <b>Epic launch address</b>. Epic opens it from a patient's chart and passes in the
      Epic server and the patient, so opening it directly doesn't start a sign-in.</p>
      <p>To look at the app:</p>
      <p style="display:flex;gap:10px;flex-wrap:wrap">
        <a href="./index.html?demo=1" style="background:#1f5fa8;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:600">Try the demo (made-up patient)</a>
        <a href="./launch.html?iss=${encodeURIComponent(SANDBOX_ISS)}" style="border:1px solid #dde3ea;padding:8px 14px;border-radius:6px;text-decoration:none;color:#1d2733">Sign in to Epic's sandbox (developers)</a>
      </p>
      <p style="color:#66727f;font-size:14px">For Epic configuration: Launch URL <code>${location.origin}/launch.html</code>,
      redirect URI <code>${location.origin}/index.html</code>. Details: <a href="./docs.html">documentation</a>.</p>
    </main>`;
}

if (!params.get("iss") && !params.get("fhirServiceUrl")) {
  explain();
} else {
  authorize().catch((err: unknown) => {
    document.body.textContent = `Couldn't start the Epic sign-in: ${err instanceof Error ? err.message : String(err)}`;
  });
}
