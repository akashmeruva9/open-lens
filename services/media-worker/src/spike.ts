import { renderVideo } from "./render.js";
import { registerFont } from "./scenes.js";

// Local macOS Indic fonts; in Docker we install Noto Sans Telugu/Devanagari instead.
registerFont("/System/Library/Fonts/KohinoorTelugu.ttc", "OLTelugu");

const out = process.argv[2] ?? "out/spike";
const r = await renderVideo({
  outDir: out,
  name: "demo-te",
  hls: true,
  brand: { title: "Metro fare story (FICTIONAL)", disclosure: "AI-generated presenter / narration", fontFamily: "OLTelugu, sans-serif" },
  scenes: [
    { label: "ఏమి జరిగింది", text: "మెట్రో ఛార్జీలు జనవరి 1 నుంచి 20 శాతం పెరుగుతాయి.", seconds: 4, claimIds: ["c1"] },
    { label: "మూలాలు ఏమంటున్నాయి", text: "అధికారులు విద్యుత్ ఖర్చులను కారణంగా చెబుతున్నారు.", seconds: 4, claimIds: ["c2", "c3"] },
    { label: "తెలియనివి", text: "ప్రభుత్వ సబ్సిడీ పరిశీలనలో ఉందో లేదో స్పష్టంగా లేదు.", seconds: 4, claimIds: ["c5"] },
  ],
});
console.log(r);
