// Assembles the recorded scenes + generated cards into a finished MP4.
// Usage: node scripts/video-edit.mjs [wide|vert|story]
//   wide  1920x1080 full walkthrough for LinkedIn
//   vert  1080x1920 full walkthrough, vertical
//   story 1080x1920 tight ~55s cut that fits one Instagram/Snap story
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ARG = process.argv[2] || "wide";
const MODE = ARG === "vert" || ARG === "story" ? "vert" : "wide";
const TIGHT = ARG === "story";
const ROOT = process.cwd();
const V = path.join(ROOT, ".video");
const CLIPS = path.join(V, "clips", MODE === "wide" ? "raw-desktop" : "raw-mobile");
const CARDS = path.join(V, "cards");
const SEG = path.join(V, "segments", ARG);
const OUT = path.join(V, "out");
fs.rmSync(SEG, { recursive: true, force: true });
fs.mkdirSync(SEG, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const CANVAS = MODE === "wide" ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };
// ffmpeg's filter parser breaks on a Windows drive-letter colon, so the font is
// copied next to the project and referenced by a relative path.
const FONT = ".video/fonts/segoeuib.ttf";
const CAP_SIZE = MODE === "wide" ? 46 : 44;
// A full-width band rather than a floating plate: a plate the same width as the
// caption left the page's own headline readable right beside it.
const BAND = MODE === "wide" ? 200 : 210;
const CAP_X = MODE === "wide" ? 96 : 64;
const CAP_Y = CANVAS.h - BAND + Math.round((BAND - CAP_SIZE) / 2) - 6;
const BG = "0x071c33";

// in: "auth" cuts in as soon as the sign-in preamble ends (measured at record time);
// a number is a fixed offset in seconds. `story` marks the beats that survive the tight cut.
const ALL = [
  { card: "title", story: true, dur: MODE === "wide" ? 3.4 : 2.8 },
  { clip: "01-landing", in: 0.4, story: true, dur: MODE === "wide" ? 9 : 7, cap: "One workspace for the whole class" },
  { card: "teachers", story: true, dur: MODE === "wide" ? 2.6 : 2.2 },
  { clip: "02-teacher-login", in: 1.2, dur: MODE === "wide" ? 11 : 9, cap: "Teachers sign in with their own account" },
  { clip: "03-teacher-dashboard", in: "auth", dur: MODE === "wide" ? 7 : 6, cap: "Courses, work and students on one screen" },
  { clip: "04-create-course", in: "auth", story: true, dur: MODE === "wide" ? 17 : 12, cap: "Create a course - a share code is made for you" },
  { clip: "05-publish-assignment", in: "auth", story: true, dur: MODE === "wide" ? 14 : 10, cap: "Publish assignments: text, link or file" },
  { clip: "06-attendance-qr", in: "auth", story: true, dur: MODE === "wide" ? 12 : 9, cap: "Take attendance with a code or a QR" },
  { clip: "07-analytics", in: "auth", dur: MODE === "wide" ? 8 : 6, cap: "Analytics show who is falling behind" },
  { card: "students", story: true, dur: MODE === "wide" ? 2.6 : 2.2 },
  { clip: "08-student-dashboard", in: "auth", story: true, dur: MODE === "wide" ? 9 : 7, cap: "Students see their streak and heatmap" },
  { clip: "09-join-by-code", in: "auth", story: true, dur: MODE === "wide" ? 11 : 8, cap: "Join a course with the code from the board" },
  { clip: "10-submit-assignment", in: "auth", dur: MODE === "wide" ? 11 : 8, cap: "Hand in work before the deadline" },
  { clip: "11-student-profile", in: "auth", dur: MODE === "wide" ? 8 : 6, cap: "A public profile that proves the work" },
  { card: "end", story: true, dur: MODE === "wide" ? 3.6 : 3.0 },
];
// Tight Stories cut: title, landing, one card per role, the four money moments, end.
const PLAN = TIGHT
  ? ALL.filter((s) => s.story).map((s) => ({ ...s, dur: Math.min(s.dur, s.card ? s.dur : 8.5) }))
  : ALL;

const manifestPath = path.join(CLIPS, "manifest.json");
const AUTH = fs.existsSync(manifestPath)
  ? Object.fromEntries(JSON.parse(fs.readFileSync(manifestPath, "utf8")).results.filter((r) => r.id).map((r) => [r.id, r.authDone || 0]))
  : {};

const esc = (s) => s.replace(/[\\:%,']/g, "\\$&");
const show = (b) => (b ? b.toString() : "").split("\n").filter(Boolean).slice(-10).join("\n");
const run = (args, opts = {}) => {
  try { return execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"], ...opts }); }
  catch (e) { console.error("FFMPEG FAILED:\n" + (e.stderr ? show(e.stderr) : e.message)); throw e; }
};
const probe = (f) => {
  try { return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim()); }
  catch (e) { console.error("FFPROBE FAILED for " + f + "\n" + (e.stderr ? show(e.stderr) : e.message)); throw e; }
};

/** Lower third: opaque band, a hairline of brand sky along its top edge, then the caption. */
function lowerThird(text) {
  return [
    `drawbox=x=0:y=ih-${BAND}:w=iw:h=${BAND}:color=0x04101f@0.95:t=fill`,
    `drawbox=x=0:y=ih-${BAND}:w=iw:h=5:color=0x62b0f5@0.9:t=fill`,
    `drawtext=fontfile=${FONT}:text='${esc(text)}':fontcolor=white:fontsize=${CAP_SIZE}:x=${CAP_X}:y=${CAP_Y}`,
  ].join(",");
}

const base = `scale=${CANVAS.w}:${CANVAS.h}:force_original_aspect_ratio=decrease,pad=${CANVAS.w}:${CANVAS.h}:(ow-iw)/2:(oh-ih)/2:color=${BG},fps=30,format=yuv420p`;
const files = [];
let total = 0;

PLAN.forEach((step, i) => {
  const id = String(i).padStart(2, "0");
  const target = path.join(SEG, `seg-${id}.mp4`);
  if (step.card) {
    const src = path.join(CARDS, `${step.card}-${MODE}.png`);
    if (!fs.existsSync(src)) throw new Error(`missing card ${src}`);
    run(["-y", "-loop", "1", "-t", String(step.dur), "-i", src, "-vf", base, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-an", target]);
  } else {
    const src = path.join(CLIPS, `${step.clip}.webm`);
    if (!fs.existsSync(src)) throw new Error(`missing clip ${src}`);
    const start = step.in === "auth" ? (AUTH[step.clip.slice(0, 2)] ?? 8) + 0.6 : step.in;
    // Never run past the end of the recording — a short clip loses seconds, not frames.
    const dur = Math.min(step.dur, Math.max(2, probe(src) - start - 0.3));
    run(["-y", "-ss", start.toFixed(2), "-t", dur.toFixed(2), "-i", src, "-vf", `${base},${lowerThird(step.cap)}`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-an", target]);
  }
  const dur = probe(target);
  total += dur;
  files.push(target);
  console.log(`seg ${id} ${step.card || step.clip} -> ${dur.toFixed(1)}s`);
});

const list = path.join(SEG, "concat.txt");
// Relative names only: the project path contains an apostrophe, which the
// concat demuxer would treat as a quote character.
fs.writeFileSync(list, files.map((f) => `file '${path.basename(f)}'`).join("\n"));

const NAMES = { wide: "albasrawie-linkedin-16x9.mp4", vert: "albasrawie-vertical-9x16.mp4", story: "albasrawie-stories-9x16.mp4" };
const finalPath = path.join(OUT, NAMES[ARG]);
const fadeOut = Math.max(0, total - 0.9);
run([
  "-y", "-f", "concat", "-safe", "0", "-i", "concat.txt",
  "-vf", `fade=t=in:st=0:d=0.6,fade=t=out:st=${fadeOut.toFixed(2)}:d=0.9`,
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", "-an", finalPath,
], { cwd: SEG });
const mb = (fs.statSync(finalPath).size / 1048576).toFixed(1);
console.log(`\n${ARG}: ${finalPath}\n  ${total.toFixed(1)}s  ${CANVAS.w}x${CANVAS.h}  ${mb} MB`);
