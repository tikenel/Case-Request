// The vascular procedure catalog: every procedure the app can request, with
// what a scheduler needs to book it.
//
// DRAFT. Every code, time and default here needs sign-off from the practice's
// coding team and the surgeons before clinical use. Names are written in our
// own words; they are not the AMA CPT descriptors (CPT is licensed by the AMA).
// Durations are typical skin-to-skin estimates for booking, not billing data.

export type Category =
  | "Aortic – endovascular"
  | "Aortic – open"
  | "Thoracic aorta"
  | "Carotid & arch vessels"
  | "Lower extremity – open"
  | "Lower extremity – endovascular"
  | "Angiography & catheter work"
  | "Visceral & renal"
  | "Thrombus & embolism"
  | "Dialysis access – open"
  | "Dialysis access – endovascular"
  | "Central lines & catheters"
  | "Venous"
  | "Thoracic outlet"
  | "Amputation & wound"
  | "Other vascular";

/** Room type a procedure needs. Angio and catheter work is done in the Hybrid OR. */
export type Setting = "Main OR" | "Hybrid OR";
export type Anesthesia = "General" | "MAC/sedation" | "Regional" | "Local";
export type Admission = "Outpatient" | "Overnight (23 h)" | "Inpatient" | "ICU";
export type Blood = "None" | "Type & screen" | "Type & cross";

export interface Procedure {
  /** Stable id. Usually the CPT code; a suffix when two entries share one code. */
  id: string;
  cpt: string;
  name: string;
  category: Category;
  /** Other ways surgeons say it: abbreviations, eponyms, device names. Lowercase. */
  synonyms: string[];
  /** Needs left/right/bilateral. */
  sided: boolean;
  /** Add-on code: only billed with a primary procedure. */
  addOn: boolean;
  setting: Setting;
  anesthesia: Anesthesia;
  minutes: number;
  admission: Admission;
  contrast: boolean;
  blood: Blood;
  /** Imaging the surgeon usually wants on file before booking. */
  imaging: string[];
  /** Equipment and devices the scheduler must request with the room. */
  equipment: string[];
  /** A vendor rep or device order is normally needed. */
  vendor: boolean;
  /** Shown as a warning wherever the procedure appears. */
  verify?: string;
}

export const CATALOG_STATUS =
  "Draft catalog. Codes, times and defaults must be confirmed by your coding team and surgeons before clinical use.";

const LER_2026 =
  "CPT 2026 restructured lower-extremity endovascular revascularization coding. Confirm the current code with your coding team before submitting.";

type Opts = Partial<Omit<Procedure, "id" | "cpt" | "name" | "category" | "synonyms">> & { id?: string };

// Defaults per category so each entry only states what differs.
const BASE: Record<Category, Omit<Procedure, "id" | "cpt" | "name" | "category" | "synonyms">> = {
  "Aortic – endovascular": { sided: false, addOn: false, setting: "Hybrid OR", anesthesia: "General", minutes: 180, admission: "Inpatient", contrast: true, blood: "Type & cross", imaging: ["CTA chest/abdomen/pelvis with thin cuts (for graft sizing)"], equipment: ["Fixed imaging or C-arm", "Endograft (sized from CTA)", "Large-bore sheaths", "Power injector"], vendor: true },
  "Aortic – open": { sided: false, addOn: false, setting: "Main OR", anesthesia: "General", minutes: 300, admission: "ICU", contrast: false, blood: "Type & cross", imaging: ["CTA abdomen/pelvis"], equipment: ["Cell saver", "Aortic clamps and retractor system (Omni/Bookwalter)", "Aortic graft"], vendor: false },
  "Thoracic aorta": { sided: false, addOn: false, setting: "Hybrid OR", anesthesia: "General", minutes: 240, admission: "ICU", contrast: true, blood: "Type & cross", imaging: ["CTA chest/abdomen/pelvis with thin cuts"], equipment: ["Fixed imaging", "Thoracic endograft (sized from CTA)", "Large-bore sheaths", "Spinal drain availability (discuss with anesthesia)"], vendor: true },
  "Carotid & arch vessels": { sided: true, addOn: false, setting: "Main OR", anesthesia: "General", minutes: 150, admission: "Overnight (23 h)", contrast: false, blood: "Type & screen", imaging: ["Carotid duplex", "CTA or MRA neck"], equipment: ["Shunt available", "Patch (bovine pericardium or Dacron)", "Neuro-monitoring (EEG) if surgeon uses it"], vendor: false },
  "Lower extremity – open": { sided: true, addOn: false, setting: "Main OR", anesthesia: "General", minutes: 240, admission: "Inpatient", contrast: false, blood: "Type & screen", imaging: ["Arterial duplex or angiogram/CTA runoff", "ABI/PVR"], equipment: ["C-arm for completion angiogram"], vendor: false },
  "Lower extremity – endovascular": { sided: true, addOn: false, setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 120, admission: "Outpatient", contrast: true, blood: "None", imaging: ["ABI/PVR", "Arterial duplex or CTA runoff"], equipment: ["Fluoroscopy", "Balloons, stents and wires per surgeon preference"], vendor: false, verify: LER_2026 },
  "Angiography & catheter work": { sided: false, addOn: false, setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 60, admission: "Outpatient", contrast: true, blood: "None", imaging: [], equipment: ["Fluoroscopy"], vendor: false },
  "Visceral & renal": { sided: false, addOn: false, setting: "Hybrid OR", anesthesia: "General", minutes: 150, admission: "Inpatient", contrast: true, blood: "Type & screen", imaging: ["CTA abdomen with mesenteric/renal protocol"], equipment: ["Fluoroscopy", "Balloon-expandable covered stents per surgeon preference"], vendor: false },
  "Thrombus & embolism": { sided: true, addOn: false, setting: "Hybrid OR", anesthesia: "General", minutes: 120, admission: "Inpatient", contrast: true, blood: "Type & screen", imaging: ["Arterial or venous duplex, or CTA"], equipment: ["Fluoroscopy", "Fogarty embolectomy catheters", "Mechanical thrombectomy system per surgeon preference"], vendor: false },
  "Dialysis access – open": { sided: true, addOn: false, setting: "Main OR", anesthesia: "Regional", minutes: 90, admission: "Outpatient", contrast: false, blood: "None", imaging: ["Vein mapping (upper-extremity duplex)"], equipment: ["Ultrasound in room"], vendor: false },
  "Dialysis access – endovascular": { sided: true, addOn: false, setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 60, admission: "Outpatient", contrast: true, blood: "None", imaging: ["Fistula/graft duplex if available"], equipment: ["Fluoroscopy", "High-pressure balloons"], vendor: false },
  "Central lines & catheters": { sided: true, addOn: false, setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 45, admission: "Outpatient", contrast: false, blood: "None", imaging: [], equipment: ["Fluoroscopy", "Ultrasound"], vendor: false },
  "Venous": { sided: true, addOn: false, setting: "Hybrid OR", anesthesia: "Local", minutes: 60, admission: "Outpatient", contrast: false, blood: "None", imaging: ["Venous reflux duplex (standing) within payer window"], equipment: ["Ultrasound"], vendor: false },
  "Thoracic outlet": { sided: true, addOn: false, setting: "Main OR", anesthesia: "General", minutes: 180, admission: "Inpatient", contrast: false, blood: "Type & screen", imaging: ["Chest X-ray (cervical rib)", "Positional duplex or venogram/arteriogram as indicated"], equipment: ["Rib instruments (rib shears, rongeurs)"], vendor: false },
  "Amputation & wound": { sided: true, addOn: false, setting: "Main OR", anesthesia: "General", minutes: 90, admission: "Inpatient", contrast: false, blood: "Type & screen", imaging: ["Arterial perfusion assessment (ABI/TBI or angiogram)"], equipment: ["Power saw"], vendor: false },
  "Other vascular": { sided: false, addOn: false, setting: "Main OR", anesthesia: "General", minutes: 120, admission: "Inpatient", contrast: false, blood: "Type & screen", imaging: [], equipment: [], vendor: false },
};

function make(category: Category) {
  return (cpt: string, name: string, synonyms: string[], o: Opts = {}): Procedure => {
    const { id, ...rest } = o;
    return { ...BASE[category], ...rest, id: id ?? cpt, cpt, name, category, synonyms };
  };
}

const evar = make("Aortic – endovascular");
const open = make("Aortic – open");
const tho = make("Thoracic aorta");
const car = make("Carotid & arch vessels");
const leo = make("Lower extremity – open");
const lee = make("Lower extremity – endovascular");
const ang = make("Angiography & catheter work");
const vis = make("Visceral & renal");
const thr = make("Thrombus & embolism");
const dao = make("Dialysis access – open");
const dae = make("Dialysis access – endovascular");
const cvc = make("Central lines & catheters");
const ven = make("Venous");
const tos = make("Thoracic outlet");
const amp = make("Amputation & wound");
const oth = make("Other vascular");

const ADD = { addOn: true } as const;

export const CATALOG: Procedure[] = [
  // ── Aortic, endovascular ───────────────────────────────────────────────
  evar("34701", "EVAR, infrarenal aorto-aortic tube endograft", ["evar tube", "aorto-aortic endograft", "tube graft evar"]),
  evar("34702", "EVAR, aorto-aortic tube endograft, for rupture", ["ruptured evar tube", "revar tube"], { minutes: 150 }),
  evar("34703", "EVAR, aorto-uni-iliac endograft", ["aui", "aorto uni iliac", "aorto-uniiliac"]),
  evar("34704", "EVAR, aorto-uni-iliac endograft, for rupture", ["ruptured aui", "revar aui"], { minutes: 180 }),
  evar("34705", "EVAR, bifurcated aorto-bi-iliac endograft", ["evar", "bifurcated evar", "endovascular aneurysm repair", "aaa repair endovascular", "stent graft aaa", "endologix", "gore excluder", "endurant", "zenith"]),
  evar("34706", "EVAR, bifurcated endograft, for rupture", ["ruptured evar", "revar", "ruptured aaa evar", "raaa evar"], { minutes: 180 }),
  evar("34707", "Endovascular repair of iliac artery aneurysm, ilio-iliac endograft", ["iliac endograft", "iliac aneurysm stent graft"], { minutes: 150 }),
  evar("34708", "Endovascular repair of iliac artery, ilio-iliac endograft, for rupture", ["ruptured iliac endograft"], { minutes: 150 }),
  evar("34709", "Extension limb or cuff at the time of EVAR, each additional vessel", ["extension limb", "evar extension", "iliac extension"], ADD),
  evar("34710", "Delayed proximal or distal extension of a prior endograft, first vessel", ["evar revision extension", "type 1 endoleak repair", "proximal cuff", "distal extension delayed"], { minutes: 120, admission: "Overnight (23 h)" }),
  evar("34711", "Delayed extension of a prior endograft, each additional vessel", ["additional extension delayed"], ADD),
  evar("34712", "Endoanchor or other enhanced fixation device placement", ["endoanchors", "heli-fx", "staples endograft"], ADD),
  evar("34713", "Percutaneous large-bore (≥12 Fr) femoral access with closure, per side", ["perclose", "percutaneous access", "pevar access", "large bore access", "preclose"], { ...ADD, sided: true }),
  evar("34812", "Open femoral artery exposure for endograft delivery, per side", ["femoral cutdown", "open femoral exposure", "groin cutdown"], { ...ADD, sided: true }),
  evar("34820", "Open iliac artery exposure for endograft delivery, per side", ["iliac exposure", "retroperitoneal iliac exposure"], { ...ADD, sided: true }),
  evar("34833", "Open iliac exposure with creation of a conduit for endograft delivery, per side", ["iliac conduit", "conduit for evar"], { ...ADD, sided: true }),
  evar("34834", "Open brachial artery exposure for endovascular device delivery, per side", ["brachial cutdown", "brachial exposure"], { ...ADD, sided: true }),
  evar("34808", "Endovascular iliac artery occlusion device (plug)", ["iliac plug", "internal iliac embolization evar", "amplatzer plug iliac"], ADD),
  evar("34841", "Fenestrated EVAR (FEVAR), visceral aorta, 1 visceral artery endoprosthesis", ["fevar 1 fenestration"], { minutes: 300, admission: "ICU" }),
  evar("34842", "Fenestrated EVAR (FEVAR), visceral aorta, 2 visceral artery endoprostheses", ["fevar 2 fenestrations"], { minutes: 330, admission: "ICU" }),
  evar("34843", "Fenestrated EVAR (FEVAR), visceral aorta, 3 visceral artery endoprostheses", ["fevar 3 fenestrations"], { minutes: 360, admission: "ICU" }),
  evar("34844", "Fenestrated EVAR (FEVAR), visceral aorta, 4 or more visceral artery endoprostheses", ["fevar 4 fenestrations"], { minutes: 390, admission: "ICU" }),
  evar("34845", "Fenestrated EVAR including infrarenal aorta, 1 visceral artery endoprosthesis", ["fevar", "zfen", "fenestrated evar", "fenestrated endograft"], { minutes: 300, admission: "ICU" }),
  evar("34846", "Fenestrated EVAR including infrarenal aorta, 2 visceral artery endoprostheses", ["zfen 2", "fevar 2 vessel"], { minutes: 330, admission: "ICU" }),
  evar("34847", "Fenestrated EVAR including infrarenal aorta, 3 visceral artery endoprostheses", ["fevar 3 vessel"], { minutes: 360, admission: "ICU" }),
  evar("34848", "Fenestrated EVAR including infrarenal aorta, 4 or more visceral artery endoprostheses", ["fevar 4 vessel"], { minutes: 390, admission: "ICU" }),

  // ── Aortic, open ───────────────────────────────────────────────────────
  open("35081", "Open repair of infrarenal abdominal aortic aneurysm", ["open aaa", "open aaa repair", "aortic aneurysm open repair", "tube graft aaa", "transperitoneal aaa", "retroperitoneal aaa"]),
  open("35082", "Open repair of ruptured abdominal aortic aneurysm", ["ruptured aaa open", "raaa open"], { minutes: 240 }),
  open("35091", "Open repair of abdominal aortic aneurysm involving visceral vessels", ["juxtarenal aaa open", "suprarenal aaa open", "pararenal aneurysm open"], { minutes: 360 }),
  open("35092", "Open repair of ruptured abdominal aortic aneurysm involving visceral vessels", ["ruptured juxtarenal open"], { minutes: 360 }),
  open("35102", "Open repair of abdominal aortic aneurysm involving the iliac arteries", ["aortobiiliac aneurysm repair", "aorto-bi-iliac graft aneurysm", "bifurcated graft aaa"]),
  open("35103", "Open repair of ruptured abdominal aortic aneurysm involving the iliac arteries", ["ruptured aaa bifurcated graft"], { minutes: 300 }),
  open("35131", "Open repair of iliac artery aneurysm", ["iliac aneurysm open"], { sided: true, minutes: 240 }),
  open("35646", "Aortobifemoral bypass", ["abf", "aorto-bifemoral bypass", "aortobifemoral", "aorto bifem"], { imaging: ["CTA abdomen/pelvis with runoff"] }),
  open("35647", "Aortofemoral bypass, single side", ["aortofemoral bypass", "aorto-femoral"], { sided: true, imaging: ["CTA abdomen/pelvis with runoff"] }),
  open("35621", "Axillary-femoral bypass", ["ax-fem", "axfem", "axillofemoral"], { sided: true, minutes: 210, admission: "Inpatient", imaging: ["CTA or duplex of inflow and outflow"] }),
  open("35654", "Axillary-bifemoral bypass", ["ax-bifem", "axillobifemoral", "ax bi fem"], { sided: true, minutes: 240, admission: "Inpatient", imaging: ["CTA or duplex of inflow and outflow"] }),
  open("35661", "Femoral-femoral crossover bypass", ["fem-fem", "fem fem", "femorofemoral", "crossover bypass"], { minutes: 180, admission: "Inpatient", blood: "Type & screen", imaging: ["CTA runoff or angiogram"] }),
  open("35907", "Excision of infected aortic or abdominal graft", ["infected aortic graft explant", "aortic graft explant"], { minutes: 360 }),

  // ── Thoracic aorta ─────────────────────────────────────────────────────
  tho("33880", "TEVAR covering the left subclavian origin", ["tevar covering subclavian", "tevar zone 2", "thoracic stent graft zone 2"]),
  tho("33881", "TEVAR not covering the left subclavian origin", ["tevar", "thoracic endovascular aortic repair", "thoracic stent graft", "tbad tevar", "type b dissection tevar", "gore tag", "valiant", "zenith alpha"]),
  tho("33883", "Delayed proximal extension of a thoracic endograft, first extension", ["tevar proximal extension"], { minutes: 150 }),
  tho("33884", "Delayed proximal thoracic endograft extension, each additional", ["additional tevar extension"], ADD),
  tho("33886", "Delayed distal extension of a thoracic endograft", ["tevar distal extension"], { minutes: 150 }),
  tho("33889", "Open subclavian-to-carotid transposition through a neck incision, with TEVAR", ["subclavian transposition for tevar", "lsa revascularization"], { ...ADD, sided: true }),
  tho("33891", "Open carotid-carotid bypass through neck incisions, with TEVAR", ["carotid-carotid bypass tevar", "debranching carotid"], ADD),
  tho("33877", "Open repair of thoracoabdominal aortic aneurysm with graft", ["taaa open", "thoracoabdominal aneurysm", "crawford"], { setting: "Main OR", minutes: 480, contrast: false, equipment: ["Cell saver", "Left heart bypass / perfusion team", "Spinal drain", "Neuromonitoring (MEP/SSEP)"], vendor: false, verify: "Usually booked with cardiac surgery and perfusion. Confirm with the coding team." }),
  tho("33859", "Open ascending aorta graft (not for dissection)", ["ascending aortic aneurysm repair", "ascending aorta replacement"], { setting: "Main OR", minutes: 360, contrast: false, equipment: ["Cardiopulmonary bypass / perfusion team"], vendor: false, verify: "Cardiac surgery case. Confirm the code and the team with the coding team." }),
  tho("33858", "Open ascending aorta graft for acute type A dissection", ["type a dissection repair", "taad repair", "ascending dissection repair"], { setting: "Main OR", minutes: 360, contrast: false, equipment: ["Cardiopulmonary bypass / perfusion team", "Hypothermic circulatory arrest setup"], vendor: false, verify: "Cardiac surgery case. Confirm the code and the team with the coding team." }),
  tho("33871", "Open transverse aortic arch graft", ["arch replacement", "hemiarch", "total arch"], { setting: "Main OR", minutes: 420, contrast: false, equipment: ["Cardiopulmonary bypass / perfusion team", "Hypothermic circulatory arrest setup"], vendor: false, verify: "Cardiac surgery case. Hemiarch is often an add-on; confirm with the coding team." }),

  // ── Carotid and arch vessels ──────────────────────────────────────────
  car("35301", "Carotid endarterectomy", ["cea", "carotid endarterectomy", "carotid tea", "carotid cleanout", "endarterectomy carotid"]),
  car("37215", "Carotid artery stent with embolic protection", ["cas", "carotid stent", "transfemoral carotid stent", "tf-cas"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 90, contrast: true, equipment: ["Fluoroscopy", "Embolic protection device", "Carotid stent"], vendor: true }),
  car("37215", "TCAR (transcarotid artery revascularization with flow reversal)", ["tcar", "transcarotid", "enroute", "flow reversal carotid stent", "silk road"], { id: "37215-tcar", setting: "Hybrid OR", minutes: 90, contrast: true, equipment: ["Fluoroscopy", "ENROUTE flow-reversal system and stent"], vendor: true, verify: "TCAR is reported with the carotid stent code family. Confirm with the coding team." }),
  car("37216", "Carotid artery stent without embolic protection", ["carotid stent no protection"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 90, contrast: true, equipment: ["Fluoroscopy", "Carotid stent"], vendor: true }),
  car("35601", "Carotid bypass with prosthetic graft", ["carotid bypass", "carotid interposition graft"]),
  car("35606", "Carotid-subclavian bypass with prosthetic graft", ["carotid subclavian bypass", "carotid-subclavian bypass", "cs bypass"], { minutes: 150 }),
  car("35694", "Subclavian-to-carotid transposition", ["subclavian carotid transposition", "subclavian transposition"], { minutes: 150 }),
  car("60600", "Excision of carotid body tumor, carotid artery preserved", ["carotid body tumor", "paraganglioma excision"], { minutes: 180, imaging: ["CTA or MRI neck"] }),
  car("60605", "Excision of carotid body tumor with excision of carotid artery", ["carotid body tumor with carotid resection"], { minutes: 240, imaging: ["CTA or MRI neck"] }),

  // ── Lower extremity, open ─────────────────────────────────────────────
  leo("35371", "Common femoral endarterectomy", ["femoral endarterectomy", "cfa endarterectomy", "fem tea", "cfe", "groin endarterectomy", "femoral cleanout"], { minutes: 150, admission: "Overnight (23 h)" }),
  leo("35372", "Profunda (deep femoral) endarterectomy", ["profundaplasty", "profunda endarterectomy", "deep femoral endarterectomy"], { minutes: 150 }),
  leo("35556", "Femoral-popliteal bypass with vein", ["fem-pop vein", "fem pop bypass vein", "femoropopliteal bypass gsv", "fem-pop with saphenous vein", "above knee fem pop vein", "below knee fem pop vein"], { imaging: ["Arterial duplex or angiogram/CTA runoff", "Vein mapping (GSV duplex)"] }),
  leo("35656", "Femoral-popliteal bypass with prosthetic graft", ["fem-pop ptfe", "fem pop bypass", "femoropopliteal bypass", "fem-pop graft", "above knee fem pop", "ak fem pop", "fem pop prosthetic"], { minutes: 180, equipment: ["C-arm for completion angiogram", "PTFE/Dacron graft"] }),
  leo("35566", "Femoral-tibial or peroneal bypass with vein", ["fem-tib", "fem tib bypass", "femoral tibial bypass", "fem-peroneal", "fem-at", "fem-pt", "distal bypass vein"], { minutes: 300, imaging: ["Angiogram/CTA runoff", "Vein mapping (GSV duplex)"] }),
  leo("35666", "Femoral-tibial or peroneal bypass with prosthetic graft", ["fem-tib ptfe", "distal bypass prosthetic"], { minutes: 270, equipment: ["C-arm for completion angiogram", "PTFE graft (often with vein cuff)"] }),
  leo("35571", "Popliteal-tibial or peroneal bypass with vein", ["pop-tib", "popliteal tibial bypass", "pop-pedal", "popliteal-peroneal"], { minutes: 240, imaging: ["Angiogram/CTA runoff", "Vein mapping (GSV duplex)"] }),
  leo("35671", "Popliteal-tibial or peroneal bypass with prosthetic graft", ["pop-tib ptfe"], { minutes: 240 }),
  leo("35570", "Tibial-tibial, peroneal-tibial or tibial-pedal bypass with vein", ["tibial-tibial bypass", "pedal bypass", "dp bypass", "tib-pedal"], { minutes: 270, imaging: ["Angiogram with foot views", "Vein mapping"] }),
  leo("35583", "In-situ vein femoral-popliteal bypass", ["in situ fem pop", "in-situ bypass popliteal"], { imaging: ["Angiogram/CTA runoff", "Vein mapping (GSV duplex)"], equipment: ["C-arm", "Valvulotome"] }),
  leo("35585", "In-situ vein femoral-tibial or peroneal bypass", ["in situ fem tib", "in-situ distal bypass"], { minutes: 300, imaging: ["Angiogram/CTA runoff", "Vein mapping"], equipment: ["C-arm", "Valvulotome"] }),
  leo("35500", "Harvest of upper-extremity vein for bypass", ["arm vein harvest", "cephalic vein harvest", "basilic vein harvest"], { ...ADD, sided: true }),
  leo("35572", "Harvest of femoropopliteal vein for bypass", ["femoral vein harvest", "deep vein harvest"], { ...ADD, sided: true }),
  leo("35700", "Reoperation on a femoral-popliteal or distal bypass more than a month after the original", ["redo bypass", "reoperative bypass"], { ...ADD, sided: true }),
  leo("35151", "Open repair of popliteal artery aneurysm", ["popliteal aneurysm repair", "popliteal aneurysm bypass and ligation", "paa repair"], { minutes: 210 }),
  leo("35141", "Open repair of common femoral artery aneurysm or pseudoaneurysm", ["femoral aneurysm repair", "femoral pseudoaneurysm repair open", "open pseudoaneurysm repair"], { minutes: 150 }),
  leo("35226", "Direct repair of lower-extremity blood vessel", ["arterial repair leg", "vessel repair leg", "femoral artery repair", "arteriotomy repair"], { minutes: 120 }),
  leo("35875", "Thrombectomy of an arterial or venous bypass graft", ["graft thrombectomy", "bypass graft thrombectomy"], { minutes: 150, equipment: ["C-arm", "Fogarty catheters"] }),
  leo("35876", "Thrombectomy of a bypass graft with revision", ["graft thrombectomy with revision", "graft revision"], { minutes: 180, equipment: ["C-arm", "Fogarty catheters"] }),
  leo("35903", "Excision of infected extremity graft", ["infected graft excision leg", "graft explant extremity"], { minutes: 180 }),

  // ── Lower extremity, endovascular ─────────────────────────────────────
  lee("37220", "Iliac artery angioplasty, first vessel", ["iliac angioplasty", "iliac pta", "iliac balloon"]),
  lee("37221", "Iliac artery stent (with any angioplasty), first vessel", ["iliac stent", "kissing iliac stents", "cia stent", "eia stent"]),
  lee("37222", "Iliac angioplasty, each additional vessel", ["additional iliac pta"], ADD),
  lee("37223", "Iliac stent, each additional vessel", ["additional iliac stent"], ADD),
  lee("37224", "Femoral-popliteal angioplasty", ["sfa angioplasty", "sfa pta", "fem pop angioplasty", "popliteal angioplasty", "drug coated balloon sfa", "dcb sfa"]),
  lee("37225", "Femoral-popliteal atherectomy (with any angioplasty)", ["sfa atherectomy", "fem pop atherectomy", "jetstream", "hawkone", "rotarex sfa", "orbital atherectomy sfa"], { vendor: true }),
  lee("37226", "Femoral-popliteal stent (with any angioplasty)", ["sfa stent", "popliteal stent", "supera", "zilver ptx", "eluvia", "viabahn sfa", "fem pop stent"]),
  lee("37227", "Femoral-popliteal stent and atherectomy", ["sfa atherectomy and stent"], { vendor: true }),
  lee("37228", "Tibial or peroneal angioplasty, first vessel", ["tibial angioplasty", "tibial pta", "at angioplasty", "pt angioplasty", "peroneal angioplasty", "bk angioplasty"], { minutes: 150 }),
  lee("37229", "Tibial or peroneal atherectomy (with any angioplasty), first vessel", ["tibial atherectomy"], { minutes: 150, vendor: true }),
  lee("37230", "Tibial or peroneal stent (with any angioplasty), first vessel", ["tibial stent"], { minutes: 150 }),
  lee("37231", "Tibial or peroneal stent and atherectomy, first vessel", ["tibial stent and atherectomy"], { minutes: 150, vendor: true }),
  lee("37232", "Tibial or peroneal angioplasty, each additional vessel", ["additional tibial pta"], ADD),
  lee("37233", "Tibial or peroneal atherectomy, each additional vessel", ["additional tibial atherectomy"], ADD),
  lee("37234", "Tibial or peroneal stent, each additional vessel", ["additional tibial stent"], ADD),
  lee("37235", "Tibial or peroneal stent and atherectomy, each additional vessel", ["additional tibial stent and atherectomy"], ADD),

  // ── Angiography and catheter work ─────────────────────────────────────
  ang("75710", "Extremity angiogram, one side (supervision and interpretation)", ["leg angiogram", "lower extremity angiogram", "runoff angiogram unilateral", "arm angiogram"], { sided: true }),
  ang("75716", "Extremity angiogram, both sides (supervision and interpretation)", ["bilateral runoff", "bilateral leg angiogram", "bilateral lower extremity angiogram"]),
  ang("75625", "Abdominal aortogram (supervision and interpretation)", ["aortogram", "abdominal aortogram"]),
  ang("75630", "Abdominal aortogram with bilateral iliofemoral runoff (supervision and interpretation)", ["aortogram with runoff", "aortogram bilateral runoff", "abdominal aortogram runoff"]),
  ang("36200", "Catheter placed in the aorta", ["aortic catheterization", "flush aortogram catheter"]),
  ang("36245", "Selective catheter, first-order abdominal/pelvic/leg artery", ["selective first order", "contralateral iliac catheter"], { sided: true }),
  ang("36246", "Selective catheter, second-order abdominal/pelvic/leg artery", ["selective second order", "selective sfa catheter"], { sided: true }),
  ang("36247", "Selective catheter, third-order or beyond abdominal/pelvic/leg artery", ["selective third order", "tibial selective"], { sided: true }),
  ang("37252", "Intravascular ultrasound (IVUS), first vessel", ["ivus", "intravascular ultrasound"], { ...ADD, vendor: true }),
  ang("37253", "Intravascular ultrasound (IVUS), each additional vessel", ["additional ivus"], { ...ADD, vendor: true }),
  ang("36002", "Ultrasound-guided thrombin injection of pseudoaneurysm", ["thrombin injection", "pseudoaneurysm injection", "femoral pseudoaneurysm thrombin"], { sided: true, setting: "Hybrid OR", anesthesia: "Local", minutes: 30, contrast: false, equipment: ["Ultrasound", "Thrombin"] }),
  ang("37242", "Arterial embolization (not for hemorrhage or tumor)", ["arterial embolization", "endoleak embolization", "aneurysm embolization", "coil embolization artery", "type 2 endoleak embolization"], { minutes: 120, vendor: true }),
  ang("37243", "Embolization for tumor, organ ischemia or infarction", ["tumor embolization", "organ embolization"], { minutes: 120 }),
  ang("37244", "Embolization for hemorrhage or lymphatic leak", ["bleeding embolization", "hemorrhage embolization", "lymphatic embolization"], { minutes: 120 }),
  ang("37236", "Stent in an artery other than leg, carotid or coronary, first artery", ["subclavian stent", "renal stent", "sma stent", "mesenteric stent", "innominate stent", "visceral stent", "covered stent branch"], { minutes: 120, admission: "Overnight (23 h)" }),
  ang("37237", "Stent in another such artery, each additional", ["additional visceral stent"], ADD),
  ang("37246", "Angioplasty of an artery other than leg, carotid or coronary, first artery", ["subclavian angioplasty", "renal angioplasty", "visceral angioplasty", "brachial angioplasty"], { minutes: 90 }),
  ang("37247", "Angioplasty of another such artery, each additional", ["additional arterial angioplasty"], ADD),

  // ── Visceral and renal (open) ─────────────────────────────────────────
  vis("35531", "Aorto-celiac or aorto-mesenteric bypass with vein", ["mesenteric bypass vein", "aorto-sma bypass vein"], { setting: "Main OR", minutes: 300, admission: "ICU", contrast: false, equipment: ["Cell saver"] }),
  vis("35631", "Aorto-celiac, aorto-mesenteric or aorto-renal bypass with prosthetic graft", ["mesenteric bypass", "aorto-sma bypass", "aortorenal bypass", "visceral bypass"], { setting: "Main OR", minutes: 300, admission: "ICU", contrast: false, equipment: ["Cell saver", "Prosthetic graft"] }),

  // ── Thrombus and embolism ─────────────────────────────────────────────
  thr("34201", "Femoral or popliteal embolectomy/thrombectomy through a groin incision", ["femoral embolectomy", "fogarty embolectomy", "leg embolectomy", "acute limb ischemia embolectomy", "ali thrombectomy groin"]),
  thr("34203", "Popliteal-tibial embolectomy/thrombectomy through a leg incision", ["popliteal embolectomy", "below knee embolectomy", "tibial embolectomy"]),
  thr("34101", "Axillary, brachial or subclavian embolectomy through an arm incision", ["brachial embolectomy", "arm embolectomy", "upper extremity embolectomy"], { anesthesia: "MAC/sedation", minutes: 90 }),
  thr("34111", "Radial or ulnar embolectomy through an arm incision", ["radial embolectomy", "ulnar embolectomy"], { anesthesia: "MAC/sedation", minutes: 90 }),
  thr("37184", "Percutaneous mechanical arterial thrombectomy, first vessel", ["mechanical thrombectomy artery", "penumbra artery", "lightning", "angiojet artery", "aspiration thrombectomy artery"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", vendor: true }),
  thr("37185", "Percutaneous mechanical arterial thrombectomy, each additional vessel", ["additional arterial thrombectomy"], { ...ADD, vendor: true }),
  thr("37186", "Secondary mechanical thrombectomy during another endovascular procedure", ["secondary thrombectomy", "distal embolus aspiration"], ADD),
  thr("37187", "Percutaneous mechanical venous thrombectomy", ["venous thrombectomy", "dvt thrombectomy", "clottriever", "clot triever", "angiojet vein", "iliofemoral dvt thrombectomy", "mechanical thrombectomy dvt"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 120, vendor: true, imaging: ["Venous duplex or CT venogram"] }),
  thr("37188", "Repeat mechanical venous thrombectomy on a later day", ["repeat venous thrombectomy"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 90 }),
  thr("37211", "Catheter-directed arterial thrombolysis, first day", ["arterial thrombolysis", "cdt artery", "tpa infusion artery", "lysis catheter artery"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", admission: "ICU" }),
  thr("37212", "Catheter-directed venous thrombolysis, first day", ["venous thrombolysis", "cdt dvt", "catheter directed thrombolysis vein", "ekos", "paget schroetter lysis"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", admission: "ICU", imaging: ["Venous duplex or CT venogram"] }),
  thr("37213", "Thrombolysis, later day (with or without stopping)", ["lysis check", "lysis follow-up"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 60, admission: "ICU" }),
  thr("37214", "Thrombolysis, final day with cessation", ["stop lysis", "lysis completion"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 60, admission: "ICU" }),
  thr("34421", "Open venous thrombectomy, iliac/femoral/popliteal, through a leg incision", ["open venous thrombectomy", "iliofemoral venous thrombectomy open"], { minutes: 180 }),
  thr("27602", "Fasciotomy of the leg, anterior/lateral and posterior compartments", ["four compartment fasciotomy", "4 compartment fasciotomy", "leg fasciotomy", "fasciotomy"], { setting: "Main OR", contrast: false, minutes: 60, equipment: [] }),

  // ── Dialysis access, open ─────────────────────────────────────────────
  dao("36821", "Direct AV fistula (e.g., radiocephalic or brachiocephalic)", ["av fistula", "avf", "radiocephalic fistula", "brachiocephalic fistula", "cimino", "rcf", "bcf", "wrist fistula", "snuffbox fistula"]),
  dao("36818", "AV fistula with upper-arm cephalic vein transposition", ["cephalic vein transposition", "cephalic transposition fistula"], { minutes: 120 }),
  dao("36819", "AV fistula with upper-arm basilic vein transposition", ["bvt", "basilic vein transposition", "brachiobasilic fistula", "bbavf", "basilic transposition"], { minutes: 150, anesthesia: "General" }),
  dao("36820", "AV fistula with forearm vein transposition", ["forearm transposition fistula", "forearm basilic transposition"], { minutes: 120 }),
  dao("36825", "AV fistula using an autogenous graft (not direct)", ["autogenous graft fistula", "vein graft access"], { minutes: 150 }),
  dao("36830", "AV graft (prosthetic) for dialysis", ["avg", "av graft", "dialysis graft", "ptfe graft dialysis", "forearm loop graft", "upper arm graft", "thigh graft", "acuseal", "flixene"], { minutes: 120, equipment: ["Ultrasound in room", "PTFE dialysis graft"] }),
  dao("36831", "Open thrombectomy of AV fistula or graft, without revision", ["open graft thrombectomy dialysis", "open avg declot"], { minutes: 90 }),
  dao("36832", "Open revision of AV fistula or graft, without thrombectomy", ["fistula revision", "graft revision dialysis", "jump graft", "interposition graft fistula", "superficialization", "fistula superficialization"], { minutes: 120 }),
  dao("36833", "Open revision of AV fistula or graft with thrombectomy", ["fistula revision with thrombectomy"], { minutes: 120 }),
  dao("36838", "DRIL (distal revascularization and interval ligation) for steal", ["dril", "steal syndrome", "hand ischemia access"], { minutes: 180, anesthesia: "General" }),
  dao("37607", "Ligation or banding of an AV fistula", ["fistula ligation", "fistula banding", "milr", "banding for high flow", "access ligation"], { minutes: 60 }),
  dao("49421", "Peritoneal dialysis catheter placement, open", ["pd catheter", "peritoneal dialysis catheter", "tenckhoff"], { sided: false, anesthesia: "General", minutes: 60, imaging: [], equipment: ["PD catheter"] }),

  // ── Dialysis access, endovascular ─────────────────────────────────────
  dae("36901", "Dialysis circuit fistulagram (diagnostic)", ["fistulagram", "fistulogram", "shuntogram", "dialysis circuit angiogram"], { minutes: 45 }),
  dae("36902", "Dialysis circuit fistulagram with angioplasty", ["fistula angioplasty", "fistulaplasty", "access pta", "venous outflow angioplasty"]),
  dae("36903", "Dialysis circuit fistulagram with stent", ["fistula stent", "access stent graft", "covera", "viabahn access"], { minutes: 75, vendor: true }),
  dae("36904", "Dialysis circuit thrombectomy", ["declot", "fistula declot", "graft declot", "access thrombectomy", "thrombosed fistula"], { minutes: 90 }),
  dae("36905", "Dialysis circuit thrombectomy with angioplasty", ["declot with angioplasty", "thrombectomy and pta access"], { minutes: 90 }),
  dae("36906", "Dialysis circuit thrombectomy with stent", ["declot with stent"], { minutes: 105, vendor: true }),
  dae("36907", "Central vein angioplasty during dialysis circuit work", ["central venoplasty", "central vein angioplasty", "subclavian vein angioplasty dialysis", "brachiocephalic vein angioplasty"], ADD),
  dae("36908", "Central vein stent during dialysis circuit work", ["central vein stent", "central venous stent dialysis"], ADD),
  dae("36909", "Embolization or occlusion of accessory veins/side branches of the circuit", ["side branch coiling", "accessory vein embolization", "competing vein coil"], ADD),
  dae("36836", "Percutaneous AV fistula creation, single catheter", ["ellipsys", "pavf", "percutaneous fistula", "endoavf single"], { minutes: 75, vendor: true, imaging: ["Vein mapping (upper-extremity duplex)"], equipment: ["Ultrasound", "Fluoroscopy", "Percutaneous AVF system"] }),
  dae("36837", "Percutaneous AV fistula creation, two catheters", ["wavelinq", "endoavf", "two catheter pavf"], { minutes: 90, vendor: true, imaging: ["Vein mapping (upper-extremity duplex)"], equipment: ["Fluoroscopy", "Percutaneous AVF system"] }),

  // ── Central lines and catheters ───────────────────────────────────────
  cvc("36558", "Tunneled central venous catheter without port (age 5+), e.g. dialysis catheter", ["tunneled dialysis catheter", "tdc", "permcath", "hd catheter", "tunneled line", "palindrome", "tunneled cvc"]),
  cvc("36589", "Removal of tunneled central venous catheter without port", ["tdc removal", "permcath removal", "tunneled catheter removal"], { anesthesia: "Local", minutes: 30, equipment: [] }),
  cvc("36581", "Exchange of tunneled catheter without port, through the same access", ["tdc exchange", "catheter exchange"], { minutes: 30 }),
  cvc("36561", "Port placement (tunneled central catheter with subcutaneous port, age 5+)", ["port", "mediport", "port-a-cath", "chemo port", "portacath"]),
  cvc("36590", "Port removal", ["port removal", "mediport removal"], { anesthesia: "Local", minutes: 30, equipment: [] }),

  // ── Venous ────────────────────────────────────────────────────────────
  ven("36475", "Radiofrequency ablation of a truncal vein, first vein", ["rfa", "radiofrequency ablation", "venefit", "closurefast", "gsv ablation", "ssv ablation", "saphenous ablation", "vein ablation", "endovenous ablation"], { equipment: ["Ultrasound", "RF generator and catheter"] }),
  ven("36476", "Radiofrequency ablation, each additional vein in the same leg", ["additional rfa", "second vein rfa", "accessory saphenous rfa"], { ...ADD, equipment: ["RF catheter"] }),
  ven("36478", "Laser ablation of a truncal vein, first vein", ["evla", "evlt", "laser ablation", "endovenous laser"], { equipment: ["Ultrasound", "Laser generator and fiber", "Laser safety eyewear"] }),
  ven("36479", "Laser ablation, each additional vein in the same leg", ["additional evla"], ADD),
  ven("36482", "Cyanoacrylate adhesive closure of a truncal vein, first vein", ["venaseal", "glue ablation", "cyanoacrylate", "vein glue"], { vendor: true, equipment: ["Ultrasound", "VenaSeal system"] }),
  ven("36483", "Cyanoacrylate adhesive closure, each additional vein in the same leg", ["additional venaseal"], ADD),
  ven("36465", "Ultrasound-guided foam sclerotherapy (manufactured foam), single truncal vein", ["varithena", "polidocanol foam", "foam sclerotherapy truncal"], { minutes: 45, vendor: true }),
  ven("36466", "Ultrasound-guided foam sclerotherapy (manufactured foam), multiple truncal veins", ["varithena multiple"], { minutes: 60, vendor: true }),
  ven("36470", "Sclerotherapy, single vein", ["sclerotherapy", "spider vein injection"], { minutes: 30, imaging: [], verify: "Cosmetic sclerotherapy is usually not covered. Confirm coverage and self-pay rules." }),
  ven("36471", "Sclerotherapy, multiple veins in the same leg", ["sclerotherapy multiple"], { minutes: 30, imaging: [], verify: "Cosmetic sclerotherapy is usually not covered. Confirm coverage and self-pay rules." }),
  ven("37765", "Stab phlebectomy, 10–20 incisions in one leg", ["stab phlebectomy", "microphlebectomy", "ambulatory phlebectomy", "varicose vein excision"], { minutes: 60 }),
  ven("37766", "Stab phlebectomy, more than 20 incisions in one leg", ["extensive phlebectomy"], { minutes: 90 }),
  ven("37722", "Ligation, division and stripping of the great saphenous vein", ["vein stripping", "gsv stripping", "high ligation and stripping"], { setting: "Main OR", anesthesia: "General", minutes: 90 }),
  ven("37718", "Ligation, division and stripping of the small saphenous vein", ["ssv stripping"], { setting: "Main OR", anesthesia: "General", minutes: 90 }),
  ven("37191", "IVC filter placement", ["ivc filter", "vena cava filter", "greenfield filter", "filter placement"], { sided: false, setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 45, contrast: true, imaging: [], equipment: ["Fluoroscopy", "IVC filter"] }),
  ven("37192", "IVC filter repositioning", ["filter repositioning"], { sided: false, setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 60, contrast: true, imaging: [] }),
  ven("37193", "IVC filter retrieval", ["ivc filter removal", "filter retrieval", "filter removal"], { sided: false, setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 60, contrast: true, imaging: ["CT abdomen if filter tilted or embedded"], equipment: ["Fluoroscopy", "Snares and retrieval kit", "Forceps for complex retrieval"] }),
  ven("37238", "Venous stent, first vein (e.g., iliac vein stent for May-Thurner)", ["iliac vein stent", "may thurner stent", "venous stent", "vici", "abre", "venovo", "nicv", "iliocaval stent"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 120, contrast: true, vendor: true, imaging: ["Venous duplex", "CT or MR venogram"], equipment: ["Fluoroscopy", "IVUS", "Dedicated venous stents"] }),
  ven("37239", "Venous stent, each additional vein", ["additional venous stent"], { ...ADD, contrast: true }),
  ven("37248", "Venous angioplasty, first vein", ["venoplasty", "venous angioplasty", "vein balloon"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", contrast: true }),
  ven("37249", "Venous angioplasty, each additional vein", ["additional venoplasty"], { ...ADD, contrast: true }),
  ven("37241", "Venous embolization (not for hemorrhage), e.g., pelvic or gonadal vein", ["ovarian vein embolization", "gonadal vein embolization", "pelvic congestion embolization", "varicocele embolization"], { sided: false, setting: "Hybrid OR", anesthesia: "MAC/sedation", minutes: 90, contrast: true }),
  ven("75820", "Venogram of one extremity (supervision and interpretation)", ["venogram", "leg venogram", "arm venogram"], { setting: "Hybrid OR", anesthesia: "MAC/sedation", contrast: true }),
  ven("75822", "Venogram of both extremities (supervision and interpretation)", ["bilateral venogram"], { sided: false, setting: "Hybrid OR", anesthesia: "MAC/sedation", contrast: true }),
  ven("75825", "Inferior vena cavogram (supervision and interpretation)", ["cavogram", "ivc venogram"], { sided: false, setting: "Hybrid OR", anesthesia: "MAC/sedation", contrast: true }),

  // ── Thoracic outlet ───────────────────────────────────────────────────
  tos("21615", "First rib and/or cervical rib resection", ["first rib resection", "frr", "tos decompression", "thoracic outlet decompression", "transaxillary rib resection", "supraclavicular decompression", "cervical rib resection", "paget schroetter surgery", "vtos surgery", "ntos surgery"]),
  tos("21616", "First rib resection with sympathectomy", ["first rib resection with sympathectomy"], { minutes: 210 }),
  tos("21700", "Anterior scalenectomy without cervical rib resection", ["scalenectomy", "scalenotomy", "anterior scalene division"], { minutes: 150 }),
  tos("21705", "Anterior scalenectomy with cervical rib resection", ["scalenectomy with cervical rib"], { minutes: 180 }),

  // ── Amputation and wound ──────────────────────────────────────────────
  amp("27590", "Above-knee amputation", ["aka", "above knee amputation", "transfemoral amputation"]),
  amp("27598", "Knee disarticulation", ["knee disartic", "through knee amputation"]),
  amp("27880", "Below-knee amputation", ["bka", "below knee amputation", "transtibial amputation"]),
  amp("27882", "Guillotine (open circular) below-knee amputation", ["guillotine amputation", "guillotine bka", "open bka", "staged bka"], { minutes: 60 }),
  amp("27888", "Ankle amputation (Syme)", ["syme amputation", "ankle disarticulation"]),
  amp("28800", "Midfoot amputation (Chopart/Lisfranc)", ["chopart", "lisfranc amputation", "midfoot amputation"]),
  amp("28805", "Transmetatarsal amputation", ["tma", "transmetatarsal amputation", "forefoot amputation"]),
  amp("28810", "Ray amputation (single metatarsal with toe)", ["ray amputation", "ray resection", "partial ray"], { minutes: 60 }),
  amp("28820", "Toe amputation at the MTP joint", ["toe amputation", "toe amp mtp"], { minutes: 45, anesthesia: "MAC/sedation" }),
  amp("28825", "Toe amputation at the IP joint", ["partial toe amputation", "toe tip amputation"], { minutes: 45, anesthesia: "MAC/sedation" }),
  amp("11042", "Debridement to subcutaneous tissue, first 20 sq cm", ["debridement", "wound debridement", "i&d wound", "subcutaneous debridement"], { minutes: 45, anesthesia: "MAC/sedation", equipment: [] }),
  amp("11043", "Debridement to muscle/fascia, first 20 sq cm", ["muscle debridement", "fascial debridement", "deep debridement"], { minutes: 60, equipment: [] }),
  amp("11044", "Debridement to bone, first 20 sq cm", ["bone debridement", "osteomyelitis debridement"], { minutes: 60, equipment: ["Rongeurs"] }),
  amp("97605", "Negative-pressure wound therapy (VAC), 50 sq cm or less", ["wound vac", "npwt", "vac placement"], { ...ADD, equipment: ["Wound VAC"] }),
  amp("97606", "Negative-pressure wound therapy (VAC), more than 50 sq cm", ["large wound vac"], { ...ADD, equipment: ["Wound VAC"] }),

  // ── Other vascular ────────────────────────────────────────────────────
  oth("35860", "Exploration for postoperative bleeding, thrombosis or infection, extremity", ["groin exploration", "wound exploration bleeding", "hematoma evacuation extremity", "return to or groin"], { sided: true, minutes: 60 }),
  oth("35800", "Exploration for postoperative bleeding, thrombosis or infection, neck", ["neck exploration", "neck hematoma evacuation", "post cea hematoma"], { minutes: 60 }),
  oth("35840", "Exploration for postoperative bleeding, thrombosis or infection, abdomen", ["abdominal exploration bleeding", "re-look laparotomy vascular"], { minutes: 120, admission: "ICU" }),
  oth("37609", "Temporal artery biopsy", ["temporal artery biopsy", "tab", "giant cell arteritis biopsy"], { sided: true, setting: "Hybrid OR", anesthesia: "Local", minutes: 45, admission: "Outpatient", blood: "None", verify: "Pathology must know it is a temporal artery specimen (GCA protocol)." }),
];

const BY_ID = new Map(CATALOG.map((p) => [p.id, p]));

export function procedureById(id: string): Procedure | undefined {
  return BY_ID.get(id);
}

export const CATEGORIES: Category[] = Object.keys(BASE) as Category[];
