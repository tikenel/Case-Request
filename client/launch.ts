import { authorize } from "./fhir";

authorize().catch((err: unknown) => {
  document.body.textContent = `Couldn't start the Epic sign-in: ${err instanceof Error ? err.message : String(err)}`;
});
