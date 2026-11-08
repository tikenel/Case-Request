# OR Request — vascular surgery scheduling from the Epic chart

A SMART on FHIR app that opens inside the patient's chart in Epic. The surgeon
or NP/PA builds a complete surgery request in about a minute. The scheduler
then gets a step-by-step sheet with nothing missing.

## The problem it targets

Requests reach new schedulers incomplete: no side, no CPT code, no equipment,
no anticoagulation plan, no prior-auth details. The request then bounces back
and forth or gets lost. This app makes it impossible to send a request with
those gaps. It also tells the scheduler exactly what to book and in what
order.

## What the clinician does

1. **Describe the case.** Use any of these:
   - type it ("R fem-pop PTFE, 2–3 weeks, hold Eliquis 3 days")
   - dictate it (microphone button)
   - pick a clinic note from the chart and press **Read note**

   The AI proposes procedures, side, diagnosis, timing, equipment and the
   medication plan, quoting the words it used. Nothing is applied until the
   clinician ticks it. Low-confidence guesses start unticked.
2. **Procedures.** Search the vascular catalog by name, abbreviation (fem-pop,
   BKA, TCAR, BVT) or CPT code, or browse a category. Sided procedures must
   have a side.
3. **Diagnosis.** Pick from the patient's problem list in one click, or search.
4. **When.** Choose urgency, then: first available, on a date, no later than,
   or a window.
5. **Room, time and equipment.** These default from the procedures: the most
   demanding room and anesthetic win, and time is added for extra procedures.
   Each can be overridden.
6. **Before the date.** A pre-op checklist built from the chart. It covers:
   - anticoagulants, antiplatelets, SGLT2 inhibitors, GLP-1 agonists,
     insulin and metformin
   - eGFR and contrast allergy for contrast cases
   - blood bank, beds and vendors
   - prior auth and venous-ablation payer criteria
   - access-arm protection

   An anticoagulant plan is required before sending.
7. **Review and send.** You get:
   - the scheduler sheet and a one-line OR posting
   - copy and print
   - optionally, file it as a note or send it as orders in Epic

## What the scheduler gets

A numbered sheet:

1. Patient, phone and insurance
2. Case: each procedure with side and CPT, diagnosis, surgeon
3. When
4. Room, minutes, anesthesia, post-op bed, blood bank
5. Equipment and vendor/device
6. Prior authorization, with the exact CPT and ICD-10 codes to submit
7. The pre-op checklist to work through

## Procedure catalog (`shared/catalog.ts`)

206 entries (169 primary procedures plus add-on codes), including:

- **Aortic:** EVAR and FEVAR, open AAA, TEVAR
- **Carotid:** CEA, CAS, TCAR, carotid body tumor
- **Lower extremity:** open bypass and endarterectomy, endovascular
  revascularization
- **Angiography and catheter work:** embolization, IVUS
- **Visceral and renal** bypass and stents
- **Thrombus and embolism:** embolectomy, mechanical thrombectomy, lysis,
  fasciotomy
- **Dialysis access:** open and endovascular, including percutaneous AVF
- **Central lines and ports**
- **Venous:** ablation, phlebectomy, IVC filter, venous stent
- **Thoracic outlet**
- **Amputations and debridement**
- **Postoperative re-exploration**

Each entry carries:

- plain-language name and synonyms
- whether it is sided
- add-on status
- usual location, anesthesia and minutes
- post-op stay
- contrast use and blood bank needs
- imaging needed
- equipment and vendor needs

**It is a draft and needs sign-off before clinical use:**

- **Coding team:** confirm every code against the current CPT year. Entries
  that need attention carry a visible warning. In particular, CPT 2026
  restructured lower-extremity endovascular revascularization codes, so the
  37220–37235 entries are flagged until coding confirms the replacements.
- **Surgeons:** adjust the default minutes, rooms, equipment and synonyms to
  match how your group works.
- Names are our own wording, not AMA descriptors. CPT is licensed by the AMA,
  so confirm that your institution's license covers showing codes in an
  internal tool. It almost certainly does.

The ICD-10 list in `shared/diagnoses.ts` is a short helper list. The problem
list and the AI cover most cases.

## The AI

- `server/claude.ts` sends the phrase or the note text to Claude. It also
  sends the patient's age, sex and problem list, but no name or MRN.
- Claude must choose from the catalog. The server then:
  - drops any procedure that isn't in the catalog
  - drops malformed ICD-10 codes and dates
  - adds a question whenever a side is missing
- The note text is treated as data, not instructions.
- **PHI goes to the AI provider, so a BAA with Anthropic covering this use
  must be in place before production.** Without `ANTHROPIC_API_KEY`, the app
  still works: "Find matches" uses the offline matcher, and notes can't be
  read automatically.
- The AI endpoint only answers live Epic sessions. The server checks the
  user's SMART token by reading the open patient from an allowlisted Epic
  server. It never logs request bodies.

## Running it

```bash
cd or-request
npm install
cp .env.example .env   # fill in as needed
npm run dev            # web on http://localhost:5173, API on :8787
```

- **Try it without Epic:** open `http://localhost:5173/?demo=1`. You get a
  made-up patient on apixaban with eGFR 38, a contrast allergy, and a clinic
  note to read. Demo mode needs `ALLOW_DEMO=1`; turn it off in production.
- **Checks:** run `npm test` (catalog, matcher, chart parsing, request rules,
  AI clean-up, session check) and `npm run typecheck`.
- **Production:** run `npm run build && npm start`. The server serves the app
  and `/launch`. It needs HTTPS, and the host must sign a BAA because AI
  requests carry PHI. The page itself talks to Epic directly from the browser.

## Getting it into Epic: steps for the Epic super user and IT

1. **Register the app** at fhir.epic.com → Build Apps. Choose:
   - Audience: Clinicians/Administrative Users
   - SMART on FHIR version: R4
   - Launch type: EHR launch
   - Redirect URI: `https://<host>/index.html`
   - Launch URL: `https://<host>/launch`
2. **Request these read APIs:** Patient, Condition (problem list),
   MedicationRequest, AllergyIntolerance, Observation (labs), Coverage,
   DocumentReference (Clinical Notes), Binary, Encounter. Put the client ID in
   `VITE_SMART_CLIENT_ID`.
3. **Test in Epic's sandbox.** Set
   `FHIR_ISS_ALLOWLIST=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4`
   and launch from the sandbox's launch tester.
4. **At your organization, the Epic team:**
   - activates the client ID for your instance
   - adds the app as an activity tab or toolbar button in Hyperspace/Hyperdrive
     for vascular surgeons and APPs
   - gives you your instance's FHIR base URL to add to `FHIR_ISS_ALLOWLIST`
5. **Write-back (optional; turn on only what the Epic team approves):**
   - `VITE_WRITE_NOTE=1` files the scheduler sheet as a clinical note. It
     needs DocumentReference.Create. Set `VITE_NOTE_TYPE_*` to the note type
     your Epic team assigns, and route that note type to the scheduling work
     queue or In Basket pool.
   - `VITE_WRITE_ORDERS=1` sends each procedure as a ServiceRequest. Many
     organizations don't enable ServiceRequest.Create for third-party apps.
     Ask whether it can feed the OpTime case request workflow.

**Questions for the Epic super user:**

- How do case requests reach schedulers today: a case request order, an In
  Basket pool, or a work queue?
- Which note type or order could carry this sheet there?
- Will the organization activate DocumentReference.Create (Clinical Notes)?
- Will it activate ServiceRequest.Create, or a case request API?
- Should the app be an activity tab or a toolbar button, and for which roles?

## Toward automation

The request is already structured data (`SurgeryRequest`), so later steps can
build on it without changing what the clinician does:

- **Scheduler queue and status tracking:** submitted → auth pending →
  scheduled. This needs a small database under the BAA.
- **Auto-starting prior authorization** from the CPT/ICD pair. Epic has
  payer-platform options for this.
- **Matching against OR block availability,** if the organization exposes
  OpTime or scheduling APIs.
- **Pre-filling the request automatically** when a clinic note with a surgical
  plan is signed, using a CDS Hooks or note-sign trigger, if Epic enables one.

## Layout

```
client/   React UI, SMART launch, Epic reads/writes (fhir.ts), dictation
server/   Express: AI interpreter (claude.ts), Epic session check (auth.ts)
shared/   catalog, diagnoses, matcher, chart parsing, request rules, FHIR builders, demo data
tests/    vitest
```
