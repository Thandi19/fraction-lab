// make-audio.mjs: makes the voice recordings for Fraction Lab
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { KokoroTTS } from "kokoro-js";
import ffmpegPath from "ffmpeg-static";

// 1. The website folder (the one with index.html). Use forward slashes.
const SITE_DIR = "C:/Users/Admin/Downloads/Tutor_App_Builder/fractions-tutor";

// 2. The two voices
const VOICES = { female: "af_heart", male: "am_michael" };

const lesson = JSON.parse(fs.readFileSync(path.join(SITE_DIR, "lesson.json"), "utf8"));

// Same function as in script.js, so file names match
function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + "-" + text.length;
}

// Say the maths in words
function speakable(text) {
  return text
    .replace(/\?\/(\d+)/g, "blank over $1")
    .replace(/([=×÷+])\s*\?/g, "$1 what?")
    .replace(/(\d+)\/(\d+)/g, "$1 over $2")
    .replace(/×/g, " times ")
    .replace(/÷/g, " divided by ")
    .replace(/=/g, " equals ")
    .replace(/\+/g, " plus ");
}

// Collect every line the tutor can say
function collectLines() {
  const lines = new Set();
  const add = (t) => { if (t) lines.add(t); };
  const t = lesson.tutor;
    [t.tryAgain, t.sameValue, t.emptyAnswer, t.zeroBottom].forEach(add);
  add(t.finish + " " + lesson.report.noSlips);
  Object.values(lesson.report.skills).forEach(s => add(t.finish + " " + s.tip));
  add(lesson.welcome.question);
  add(lesson.tracker.locked);
  lesson.explain.forEach(b => add(b.say));
  lesson.workedExample.lines.forEach(l => add(l.say));
  ["tryTogether", "onYourOwn"].forEach(key => {
    const section = lesson[key];
    section.steps.forEach((s, i) => {
      add(i === 0 ? section.intro + " " + s.ask : s.ask);
      add(s.correctSay);
      (s.alsoCorrect || []).forEach(a => add(a.say));
      (s.mistakes || []).forEach(m => add(m.say));
      (s.almost || []).forEach(a => add(a.say));
      s.hints.forEach((h, n) => {
        add(h);
        if (n >= 1) add(h + " " + t.helpTwice);
      });
    });
  });
  return [...lines];
}

const lines = collectLines();
const chars = lines.reduce((sum, l) => sum + speakable(l).length, 0);
console.log(lines.length + " lines, about " + chars + " characters per voice.");

console.log("Loading the voice model (the first time it downloads about 90 MB)...");
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "q8",
  device: "cpu",
});

for (const [name, voice] of Object.entries(VOICES)) {
  const outDir = path.join(SITE_DIR, "audio", name);
  fs.mkdirSync(outDir, { recursive: true });
  let count = 0;
  for (const line of lines) {
    count++;
    const mp3 = path.join(outDir, hashText(line) + ".mp3");
    if (fs.existsSync(mp3)) continue;                 // already made, skip
    const wav = mp3.replace(".mp3", ".wav");
    const audio = await tts.generate(speakable(line), { voice: voice });
    await audio.save(wav);
    execFileSync(ffmpegPath, ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "64k", mp3]);
    fs.unlinkSync(wav);
    console.log(name + " " + count + "/" + lines.length + ": " + line.slice(0, 45));
  }
}
console.log("Done! Your MP3 files are in " + path.join(SITE_DIR, "audio"));