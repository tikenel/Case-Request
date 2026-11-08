// A short reference list of common vascular ICD-10-CM diagnoses, used when the
// chart's problem list doesn't already carry the right one. ICD-10-CM is
// published by CMS/NCHS. Confirm the final code in Epic's diagnosis picker.

export interface Diagnosis { code: string; display: string; terms: string[] }

const d = (code: string, display: string, ...terms: string[]): Diagnosis => ({ code, display, terms });

export const DIAGNOSES: Diagnosis[] = [
  d("I71.43", "Infrarenal abdominal aortic aneurysm, without rupture", "aaa", "abdominal aortic aneurysm", "infrarenal aneurysm"),
  d("I71.42", "Juxtarenal abdominal aortic aneurysm, without rupture", "juxtarenal"),
  d("I71.41", "Pararenal abdominal aortic aneurysm, without rupture", "pararenal", "suprarenal"),
  d("I71.33", "Infrarenal abdominal aortic aneurysm, ruptured", "ruptured aaa", "raaa"),
  d("I71.23", "Aneurysm of the descending thoracic aorta, without rupture", "descending thoracic aneurysm", "taa"),
  d("I71.21", "Aneurysm of the ascending aorta, without rupture", "ascending aneurysm"),
  d("I71.60", "Thoracoabdominal aortic aneurysm, without rupture, unspecified", "thoracoabdominal aneurysm", "taaa"),
  d("I71.010", "Dissection of the ascending aorta", "type a dissection", "ascending dissection"),
  d("I71.012", "Dissection of the descending thoracic aorta", "type b dissection", "tbad", "descending dissection"),
  d("I72.3", "Aneurysm of iliac artery", "iliac aneurysm"),
  d("I72.4", "Aneurysm of artery of lower extremity", "popliteal aneurysm", "femoral aneurysm"),
  d("I65.21", "Occlusion and stenosis of right carotid artery", "right carotid stenosis"),
  d("I65.22", "Occlusion and stenosis of left carotid artery", "left carotid stenosis"),
  d("I65.23", "Occlusion and stenosis of bilateral carotid arteries", "bilateral carotid stenosis"),
  d("I70.211", "Atherosclerosis of native arteries, right leg, with intermittent claudication", "right claudication", "pad claudication right"),
  d("I70.212", "Atherosclerosis of native arteries, left leg, with intermittent claudication", "left claudication", "pad claudication left"),
  d("I70.213", "Atherosclerosis of native arteries, bilateral legs, with intermittent claudication", "bilateral claudication"),
  d("I70.221", "Atherosclerosis of native arteries, right leg, with rest pain", "right rest pain", "clti right"),
  d("I70.222", "Atherosclerosis of native arteries, left leg, with rest pain", "left rest pain", "clti left"),
  d("I70.235", "Atherosclerosis of native arteries, right leg, with ulceration of other part of foot", "right foot ulcer", "right toe ulcer"),
  d("I70.245", "Atherosclerosis of native arteries, left leg, with ulceration of other part of foot", "left foot ulcer", "left toe ulcer"),
  d("I70.261", "Atherosclerosis of native arteries, right leg, with gangrene", "right gangrene"),
  d("I70.262", "Atherosclerosis of native arteries, left leg, with gangrene", "left gangrene"),
  d("E11.51", "Type 2 diabetes with diabetic peripheral angiopathy without gangrene", "diabetic pad"),
  d("E11.52", "Type 2 diabetes with diabetic peripheral angiopathy with gangrene", "diabetic gangrene"),
  d("I74.3", "Embolism and thrombosis of arteries of the lower extremities", "acute limb ischemia leg", "ali", "leg embolus"),
  d("I74.2", "Embolism and thrombosis of arteries of the upper extremities", "arm embolus", "brachial embolus"),
  d("K55.1", "Chronic vascular disorders of intestine", "chronic mesenteric ischemia", "cmi"),
  d("I70.1", "Atherosclerosis of renal artery", "renal artery stenosis"),
  d("N18.6", "End stage renal disease", "esrd", "dialysis dependent"),
  d("N18.5", "Chronic kidney disease, stage 5", "ckd 5", "pre-dialysis"),
  d("T82.858A", "Stenosis of vascular prosthetic devices, implants and grafts, initial encounter", "fistula stenosis", "graft stenosis", "access stenosis"),
  d("T82.868A", "Thrombosis of vascular prosthetic devices, implants and grafts, initial encounter", "thrombosed graft", "clotted fistula", "access thrombosis"),
  d("I87.2", "Venous insufficiency (chronic) (peripheral)", "venous insufficiency", "venous reflux", "cvi"),
  d("I83.811", "Varicose veins of right lower extremity with pain", "right varicose veins"),
  d("I83.812", "Varicose veins of left lower extremity with pain", "left varicose veins"),
  d("I83.813", "Varicose veins of bilateral lower extremities with pain", "bilateral varicose veins"),
  d("I87.1", "Compression of vein", "may thurner", "iliac vein compression", "nutcracker"),
  d("I82.411", "Acute embolism and thrombosis of right femoral vein", "right femoral dvt"),
  d("I82.412", "Acute embolism and thrombosis of left femoral vein", "left femoral dvt"),
  d("I82.A11", "Acute embolism and thrombosis of right axillary vein", "right paget schroetter", "right effort thrombosis"),
  d("I82.A12", "Acute embolism and thrombosis of left axillary vein", "left paget schroetter", "left effort thrombosis"),
  d("G54.0", "Brachial plexus disorders", "neurogenic thoracic outlet", "ntos"),
  d("D44.6", "Neoplasm of uncertain behavior of carotid body", "carotid body tumor", "paraganglioma"),
  d("M31.6", "Other giant cell arteritis", "giant cell arteritis", "temporal arteritis", "gca"),
];

export function searchDiagnoses(query: string, limit = 8): Diagnosis[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return DIAGNOSES.filter(
    (x) => x.code.toLowerCase().startsWith(q) || x.display.toLowerCase().includes(q) || x.terms.some((t) => t.includes(q)),
  ).slice(0, limit);
}
