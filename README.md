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

## Hosting

The pages are static and deploy to Vercel from `main` (`vercel.json`). That
gives the https addresses Epic requires:

- Launch URL: `https://<host>/launch.html`
- Redirect URI: `https://<host>/index.html`
- Public documentation URL: `https://<host>/docs.html`

The AI endpoint (`server/`) isn't part of the Vercel deploy. Without it, the
app runs with AI off. Host the server under a BAA when AI is wanted.

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

## Locations

Cases can be booked at **UMH Main OR, Hybrid OR, Sole Mia, Lennar or Doral**.
The list is in `shared/locations.ts`. Main OR procedures default to UMH Main
OR and hybrid procedures to Hybrid OR. Angio/IR, office-lab and procedure-room
cases have no default, so the clinician must pick the site before sending. The
scheduler sheet shows the room type when the site name doesn't make it obvious
("Doral · Angio/IR suite").

## Medications and medical history

The patient's active medications, problem list and allergies come from the
chart. Every medication that needs a peri-operative decision gets a
**Continue / Hold for [X] days** choice:

- **Anticoagulants:** apixaban, rivaroxaban, dabigatran, edoxaban, warfarin,
  enoxaparin, dalteparin, fondaparinux, heparin. A decision is required before
  sending.
- **Antiplatelets:** aspirin, clopidogrel, ticagrelor, prasugrel, cilostazol,
  dipyridamole, vorapaxar.
- **Kidney risk:** NSAIDs, ACE inhibitors and ARBs (including Entresto),
  aminoglycosides, vancomycin, amphotericin, tacrolimus, cyclosporine,
  lithium, methotrexate.

Brand names (Eliquis, Plavix, Toradol…) are recognized, and heparin flushes
are ignored.

**Favorites:** ★ saves the current choice as your usual for that drug
("apixaban: hold 3 days", "aspirin: continue"). It's applied automatically for
your next patients, and you can change it for any patient. Favorites are saved
in the browser per signed-in user, so they don't follow you to another
computer until the app has a server under a BAA.

**On the scheduler sheet:** HOLD and CONTINUE lines. When the surgery date is
fixed, the last dose date is worked out too (hold 3 days before a surgery on
the 20th means the last dose is on the 16th). Other medications, medical
problems and allergies are listed as well. The app records the surgeon's
decision; it never suggests a hold length. A plan dictated or written in the
note ("hold Eliquis 3 days, continue aspirin") fills in the choices, which the
clinician then confirms.

## Surgical team roster

The operating-surgeon list comes from `public/team.json`, which the practice
edits without touching code:

```json
{ "members": [
  { "name": "Jane Smith, MD", "role": "Surgeon", "npi": "1234567890" },
  { "name": "Ana Lopez, NP", "role": "NP", "npi": "2345678901" }
] }
```

- `role` is one of Surgeon, Fellow, Resident, NP or PA. Only Surgeons appear
  in the operating-surgeon list.
- `npi` is optional but makes matching exact. Without it, the app matches by
  name.
- **Signed-in surgeon or physician:** when the person who launched the app is
  a Surgeon on the roster, or an MD/DO according to their Epic Practitioner
  record, they're pre-selected as operating surgeon, marked "(you)". They can
  pick someone else or type a name.
- **Signed-in NP or PA:** they're recorded as "requested by" and choose the
  surgeon.
- The file is served with the app, so list only names and NPIs, which are
  public. Commit changes to `main` and Vercel redeploys.

## Live scheduling status

The app asks Epic, rather than keeping its own records, where each request
stands. It refreshes every minute while open, and right after a request is
sent:

| Step | Comes from Epic |
|---|---|
| Requested | Case request order (ServiceRequest) signed, or the request sent from this app |
| With scheduler | Order active with no case yet, or a case created but not scheduled (Epic: Pending, Not Scheduled or Missing Information). The scheduler's comment is shown. |
| Scheduled | Surgery booked in OpTime (Appointment, Scheduled Surgeries): date, time, OR, surgeon, length |
| Day of surgery / Completed | Arrived / Completed in OpTime |
| Cancelled | Canceled in OpTime |

**"My cases" board:** every patient on an Epic patient list, with each
request's status. Your Epic team creates the list, for example a shared
"Vascular surgery: pending cases" system list or each surgeon's My List, and
gives you its ID. Set it as `VITE_TRACKING_LIST=urn:oid:<org list OID>|<list
id>`. The tab appears once it's set.

**Optional:** `VITE_CASE_REQUEST_CATEGORY=<system>|<code>` is your Epic order
category for case requests. Without it, the app recognizes case request
orders by their wording or a vascular CPT code.

**Epic APIs to add to the app registration** (add them all in one save):
- Practitioner.Read (R4)
- Appointment.Search (Scheduled Surgeries) (R4)
- Appointment.Read (Scheduled Surgeries) (R4)
- ServiceRequest.Search (Orders) (R4)
- List.Search (Patient List) (R4)
- Coverage.Search (R4)

Your organization may also need to expose case request orders through
ServiceRequest (Epic's Perioperative Workflows Playbook says so).

## Resources

- **open.epic MCP server** (`https://mcp.open.epic.com`, no sign-in): it
  searches Epic's interoperability documentation (Epic on FHIR, open.epic,
  Showroom) from an AI assistant. It's configured in `.mcp.json`, so Claude Code
  sessions on this repository load it. In claude.ai, add it as a custom
  connector. It only reads documentation; it never touches patient data.
- **Epic on FHIR sandbox:**
  `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4`. The test data
  is under Documentation → Sandbox Test Data.
- **Launch simulator** (signed in to fhir.epic.com): Documentation → Launching
  Your App. It opens the app as if from a patient's chart, with no test-user
  login.

### What Epic's documentation says about case requests

From Epic's Perioperative Workflows Playbook and API specifications (found
through the MCP server):

- **Case request orders** are how surgeons ask OR schedulers to add a case.
  Apps can *read* them through ServiceRequest (Orders), identified by category.
  The organization may need extra setup to expose them. Outgoing Surgical Case
  Scheduling (SIU) HL7v2 messages can also send them out when signed.
- **Creating an order** for the surgeon to sign: CDS Hooks
  ServiceRequest.Create (Unsigned Order) adds unsigned procedure orders. It is
  only for CDS Hooks integrations. This is the likely route to a real case
  request order that the surgeon signs in Epic, so the request lands in the
  schedulers' normal workflow.
- **Status after booking:** Appointment.Read (Scheduled Surgeries) returns
  cases scheduled in OpTime, with times, procedure and staff. That lets the app
  show "requested → scheduled" without keeping its own database.
- **Filing the scheduler sheet as a note:** DocumentReference.Create (Clinical
  Notes) files a plain-text note to an open or closed encounter. That matches
  the app's optional "File note in Epic".

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
