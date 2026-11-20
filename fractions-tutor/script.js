// ---------- Grab the parts of the page we will change ----------
const app = document.getElementById("app");
const card = document.getElementById("card");
const bubble = document.getElementById("bubble");
const avatar = document.getElementById("avatar");
const inputArea = document.getElementById("inputArea");
const backBtn = document.getElementById("backBtn");
const nextBtn = document.getElementById("nextBtn");
const soundBtn = document.getElementById("soundBtn");
const tracker = document.getElementById("tracker");
const nowLine = document.getElementById("nowLine");

// ---------- Where we are in the lesson ----------
let lesson = null;             // everything from lesson.json
let screens = [];              // the list of screens, in order
let current = 0;               // which screen we are on
let watchStep = 0;             // which line of the worked example we are on
let practice = null;           // the learner's progress in Part 3 or Part 4
const completed = new Set();   // which parts (1 to 4) the learner has finished

// ---------- What the learner slipped on (for the learning report) ----------
let stats = freshStats();

function freshStats() {
  return { skills: {}, steps: {}, stepsSeen: new Set(), hintedSteps: new Set() };
}

function skillStat(skill) {
  if (!stats.skills[skill]) stats.skills[skill] = { slips: 0, hints: 0 };
  return stats.skills[skill];
}

function stepStat(skill) {
  const key = stepKey() + ":" + skill;
  if (!stats.steps[key]) {
    stats.steps[key] = {
      practiceKey: practice.key,
      stepIndex: practice.stepIndex,
      skill: skill,
      prompt: currentStep().ask,
      slips: 0,
      hints: 0,
      lastSlipMessage: ""
    };
  }
  return stats.steps[key];
}

const HINT_NAMES = ["Hint", "Bigger hint", "Show me"];

const FLASK_SVG =
  '<svg width="20" height="22" viewBox="0 0 24 26" aria-hidden="true">' +
  '<path d="M9 2h6M10 2v7l-5.5 10a2.2 2.2 0 0 0 2 3.2h11a2.2 2.2 0 0 0 2-3.2L14 9V2" fill="none" stroke="#4B2A8A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M7 16h10l2.4 4.3a1.2 1.2 0 0 1-1 1.7H5.6a1.2 1.2 0 0 1-1-1.7z" fill="#C9B6FF"/></svg>';

const LOCK_SVG =
  '<svg width="11" height="12" viewBox="0 0 12 14" aria-hidden="true">' +
  '<rect x="1.5" y="6" width="9" height="7" rx="1.5" fill="none" stroke="#5B4A7A" stroke-width="1.6"/>' +
  '<path d="M3.5 6V4.2a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="#5B4A7A" stroke-width="1.6"/></svg>';

// ---------- The tutor's face (4 moods) ----------
const FACES = {
  calm:
    '<circle cx="23" cy="27" r="3.5" fill="#2A1B4D"/><circle cx="41" cy="27" r="3.5" fill="#2A1B4D"/>' +
    '<path d="M22 40 Q32 46 42 40" fill="none" stroke="#2A1B4D" stroke-width="3" stroke-linecap="round"/>',
  cheering:
    '<path d="M19 29 Q23 22 27 29" fill="none" stroke="#2A1B4D" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M37 29 Q41 22 45 29" fill="none" stroke="#2A1B4D" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M20 38 Q32 52 44 38 Z" fill="#2A1B4D"/>',
  thinking:
    '<circle cx="25" cy="28" r="3.5" fill="#2A1B4D"/><circle cx="43" cy="28" r="3.5" fill="#2A1B4D"/>' +
    '<path d="M36 19 L48 17" stroke="#2A1B4D" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M25 42 L40 41" stroke="#2A1B4D" stroke-width="3" stroke-linecap="round"/>',
  proud:
    '<path d="M19 28 Q23 33 27 28" fill="none" stroke="#2A1B4D" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M37 28 Q41 33 45 28" fill="none" stroke="#2A1B4D" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M21 39 Q32 50 43 39" fill="none" stroke="#2A1B4D" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="17" cy="38" r="4" fill="#ED93B1"/><circle cx="47" cy="38" r="4" fill="#ED93B1"/>'
};

function faceSvg(mood) {
  return '<svg viewBox="0 0 64 64" role="img" aria-label="Your tutor looks ' + mood + '">' +
    '<circle cx="32" cy="32" r="29" fill="#C9B6FF" stroke="#4B2A8A" stroke-width="3"/>' +
    FACES[mood] + "</svg>";
}

// ---------- The tutor's voice (off until the learner chooses) ----------
let voiceChoice = "off";     // "off", "female" or "male"
let lastVoice = "female";    // what the Sound button turns on
let voices = [];

const FEMALE = /female|zira|samantha|susan|hazel|karen|moira|tessa|fiona|victoria|aria|jenny|libby|sonia|natasha|catherine|heather|ava|allison|joanna|emma|amy|zoe|olivia/i;
const MALE = /\bmale\b|david|daniel|alex|fred|george|james|ryan|guy|oliver|richard|mark|tom|davis|brian|christopher|eric|roger|thomas|aaron/i;

function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith("en"));
}
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

// A score for how natural a browser voice sounds (higher is better)
function voiceScore(v) {
  let score = 0;
  if (/natural|neural|online|premium|enhanced/i.test(v.name)) score += 10;
  if (/google/i.test(v.name)) score += 6;
  if (/^en[-_]za/i.test(v.lang)) score += 3;        // South African English
  else if (/^en[-_]gb/i.test(v.lang)) score += 2;
  else if (/^en[-_]us/i.test(v.lang)) score += 1;
  if (/compact|espeak/i.test(v.name)) score -= 10;
  return score;
}

// Find the best matching browser voice. If the device has none, change the pitch instead.
function pickVoice(kind) {
  const wanted = voices.filter(v =>
    kind === "female" ? FEMALE.test(v.name) : (MALE.test(v.name) && !FEMALE.test(v.name))
  );
  wanted.sort((a, b) => voiceScore(b) - voiceScore(a));
  if (wanted.length > 0) return { voice: wanted[0], pitch: 1 };

  const best = voices.slice().sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
  return { voice: best, pitch: kind === "female" ? 1.15 : 0.85 };
}

// Say maths out loud in words (browser voice only)
function speakable(text) {
  return text
    .replace(/(\d+)\/(\d+)/g, "$1 over $2")
    .replace(/×/g, " times ")
    .replace(/÷/g, " divided by ")
    .replace(/=/g, " equals ")
    .replace(/\+/g, " plus ");
}

// The backup voice: used only when there is no MP3 file for a line
function browserSpeak(text) {
  if (voiceChoice === "off" || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const pick = pickVoice(voiceChoice);
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  sentences.forEach(sentence => {
    const utterance = new SpeechSynthesisUtterance(speakable(sentence.trim()));
    if (pick.voice) {
      utterance.voice = pick.voice;
      utterance.lang = pick.voice.lang;
    }
    utterance.pitch = pick.pitch;
    utterance.rate = 0.95;
    speechSynthesis.speak(utterance);
  });
}

// ---------- Pre-made voice recordings (MP3 files) ----------
// The audio maker uses this same function, so a file name always matches the text on screen
function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + "-" + text.length;
}

let currentAudio = null;

function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

// Play the recording for this text. If there is no file, use the browser voice instead.
function speak(text) {
  if (voiceChoice === "off") return;
  stopSpeaking();
  const audio = new Audio("audio/" + voiceChoice + "/" + hashText(text) + ".mp3");
  currentAudio = audio;
  audio.addEventListener("error", () => {
    if (currentAudio === audio) { currentAudio = null; browserSpeak(text); }
  });
  audio.play().catch(() => {});
}

function updateSoundButton() {
  const isOn = voiceChoice !== "off";
  soundBtn.setAttribute("aria-pressed", String(isOn));
  soundBtn.textContent = isOn ? "Sound on" : "Sound off";
}

function setVoice(choice) {
  voiceChoice = choice;
  if (choice !== "off") lastVoice = choice;
  else stopSpeaking();
  updateSoundButton();
  document.querySelectorAll("#voiceChoices .choice").forEach(btn => {
    btn.setAttribute("aria-pressed", String(btn.dataset.voice === choice));
  });
}

// ---------- The tutor says something, with a face ----------
function setBubble(text, mood) {
  bubble.textContent = text;
  avatar.innerHTML = faceSvg(mood || "calm");
  speak(text);
}

// ---------- Start from embedded data for file://, or fetch lesson.json on a server ----------
async function start() {
  const embeddedLesson = document.getElementById("lesson-data");
  if (location.protocol === "file:" && embeddedLesson) {
    lesson = JSON.parse(embeddedLesson.textContent);
  } else {
    try {
      const response = await fetch("lesson.json");
      if (!response.ok) throw new Error("lesson.json returned " + response.status);
      lesson = await response.json();
    } catch (error) {
      if (embeddedLesson) {
        console.warn("Could not load lesson.json; using the embedded lesson copy.", error);
        lesson = JSON.parse(embeddedLesson.textContent);
      } else {
        console.error("Could not load lesson.json:", error);
        card.innerHTML = "<h2>Could not load the lesson</h2><p>Keep lesson.json beside index.html and open this folder with Live Server, or use the embedded lesson copy when opening index.html directly.</p>";
        avatar.innerHTML = faceSvg("thinking");
        return;
      }
    }
  }
  buildScreens();
  render();
}

// ---------- Make the list of screens from the lesson file ----------
function buildScreens() {
  screens.push({ type: "welcome", part: 0 });
  lesson.explain.forEach((block, i) => {
    screens.push({ type: "explain", part: 1, index: i });
  });
  screens.push({ type: "watch", part: 2 });
  screens.push({ type: "practice", part: 3, key: "tryTogether" });
  screens.push({ type: "practice", part: 4, key: "onYourOwn" });
  screens.push({ type: "finish", part: 4 });
}

// ---------- Turn "2/3" into a stacked fraction ----------
function fractions(text) {
  return text.replace(
    /(\d+)\/(\d+)/g,
    '<span class="frac"><span class="top">$1</span><span class="bottom">$2</span></span>'
  );
}

// ---------- The tutor "points" at part of a line ----------
function highlightLine(lineEl, type) {
  if (!type) return;
  const fracs = lineEl.querySelectorAll(".frac");
  if (fracs.length === 0) { lineEl.classList.add("hl-line"); return; }
  if (type === "bottoms") lineEl.classList.add("hl-bottoms");
  else if (type === "tops") lineEl.classList.add("hl-tops");
  else if (type === "first") fracs[0].classList.add("hl");
  else if (type === "second") fracs[1].classList.add("hl");
  else fracs[fracs.length - 1].classList.add("hl");
}

// ---------- The part tracker in the header ----------
function drawTracker(screen) {
  const labels = lesson.tracker.parts;
  const finished = screen.type === "finish";

  tracker.innerHTML = labels.map((p, i) => {
    const n = i + 1;
    const isNow = n === screen.part && !finished;
    const isDone = completed.has(n) && !isNow;
    const locked = n === 4 && !completed.has(3);
    const cls = "tp" + (isNow ? " now" : "") + (isDone ? " done" : "") + (locked ? " locked" : "");
    const mark = isDone ? "✓ " : (locked ? LOCK_SVG : "");
    return '<button class="' + cls + '" data-part="' + n + '"' +
      (isNow ? ' aria-current="step"' : "") +
      (locked ? ' aria-disabled="true"' : "") + ">" +
      "<i></i><span>" + mark + p.short + "</span></button>";
  }).join("");

  if (finished) {
    nowLine.textContent = lesson.tracker.finished;
    return;
  }
  let line = "Part " + screen.part + " of 4 · " + labels[screen.part - 1].name;
  if (screen.type === "practice") {
    line += " · Step " + (practice.stepIndex + 1) + " of " + currentSteps().length;
  }
  nowLine.textContent = line;
}

// Tap a part to go back to it (Solo stays locked until Together is done)
tracker.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const part = Number(btn.dataset.part);
  const screen = screens[current];
  if (part === screen.part && screen.type !== "finish") return;
  if (part === 4 && !completed.has(3)) {
    setBubble(lesson.tracker.locked, "calm");
    return;
  }
  current = screens.findIndex(s => s.part === part);
  watchStep = 0;
  enterIfPractice(false);
  render();
});

// ---------- Show the current screen ----------
function render() {
  const screen = screens[current];
  const home = screen.type === "welcome";

  app.classList.toggle("landing", home);
  card.classList.toggle("home", home);
  inputArea.hidden = true;
  if (!home) drawTracker(screen);

  // buttons
  backBtn.style.visibility = "visible";
  nextBtn.textContent = "Next";
  nextBtn.disabled = false;

  // content
  if (screen.type === "welcome") showWelcome();
  if (screen.type === "explain") showExplain(screen.index);
  if (screen.type === "watch") showWatch();
  if (screen.type === "practice") showPractice(openingMessage(), "calm");
  if (screen.type === "finish") showFinish();

  card.scrollTop = 0;
  window.scrollTo(0, 0);
}

// ---------- Welcome (landing page) ----------
function showWelcome() {
  const w = lesson.welcome;

  let voiceHtml = "";
  if ("speechSynthesis" in window) {
    voiceHtml =
      '<p class="voice-label">' + w.voiceHeading + "</p>" +
      '<div class="choices" id="voiceChoices">' +
      ["off", "female", "male"].map(v =>
        '<button class="choice" data-voice="' + v + '" aria-pressed="' + (voiceChoice === v) + '">' +
        w.voiceOptions[v] + "</button>"
      ).join("") +
      "</div>" +
      '<p class="note">' + w.voiceNote + "</p>";
  }

  card.innerHTML =
    '<div class="home-head">' +
      '<div class="home-top"><div class="wordmark">' + FLASK_SVG + w.appName + "</div></div>" +
      '<h1 class="headline">' + w.headline.replace(/\*(.+?)\*/, "<em>$1</em>") + "</h1>" +
      '<p class="sub">' + w.tagline + "</p>" +
    "</div>" +
    '<div class="home-mid">' +
      '<div class="ask-row"><div class="ask-face">' + faceSvg("cheering") + '</div>' +
        '<div class="ask-bubble">' + w.question + "</div></div>" +
      '<div class="start-options">' +
        w.options.map((o, i) =>
          '<button class="start-option" data-option="' + i + '"><span>' + o.label + "</span><small>" + o.note + "</small></button>"
        ).join("") +
      "</div>" +
    "</div>" +
    '<div class="home-foot">' +
      voiceHtml +
      '<p class="home-footer">' + w.footer + "</p>" +
    "</div>";

  // each option starts the lesson at a different place
  document.querySelectorAll(".start-option").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = w.options[Number(btn.dataset.option)].startAt;
      current = screens.findIndex(s => s.type === target);
      watchStep = 0;
      enterIfPractice(false);
      render();
    });
  });

  document.querySelectorAll("#voiceChoices .choice").forEach(btn => {
    btn.addEventListener("click", () => {
      setVoice(btn.dataset.voice);
      if (btn.dataset.voice !== "off") speak(w.question);   // a short sample
    });
  });
}

// ---------- Part 1: Explain (the voice explains, the card shows) ----------
function showExplain(i) {
  const block = lesson.explain[i];
  setBubble(block.say, "calm");
  let html = "<h2>" + block.title + "</h2>";
  if (block.lines) {
    html += block.lines.map(l =>
      '<div class="ex-line"><div class="math-line">' + fractions(l.show) + '</div><div class="ex-label">' + l.label + "</div></div>"
    ).join("");
  }
  if (block.steps) html += '<ol class="moves">' + block.steps.map(s => "<li>" + s + "</li>").join("") + "</ol>";
  card.innerHTML = html;
  card.querySelectorAll(".ex-line").forEach((el, n) => {
    if (block.lines[n].highlight) highlightLine(el.querySelector(".math-line"), block.lines[n].highlight);
  });
}

// ---------- Part 2: Watch ----------
function showWatch() {
  const lines = lesson.workedExample.lines;
  setBubble(lines[watchStep].say, "calm");
  card.innerHTML = "";
  for (let i = 0; i <= watchStep; i++) {
    const div = document.createElement("div");
    div.className = "math-line" + (i < watchStep ? " past" : "");
    div.innerHTML = fractions(lines[i].show);
    if (i === watchStep) {
      const type = lines[i].highlight.replace("-fraction", "");
      highlightLine(div, type);
    }
    card.appendChild(div);
  }
  card.scrollTop = card.scrollHeight;
}

// ---------- Parts 3 and 4: the learner types ----------
function startPractice(key, atEnd) {
  practice = { key: key, stepIndex: atEnd ? lesson[key].steps.length - 1 : 0 };
  resetStep();
}

function resetStep() {
  practice.status = "asking";   // asking, wrong, hint or correct
  practice.fields = ["", ""];
  practice.active = 0;
  practice.hintLevel = 0;
  practice.hintStreak = 0;
  practice.lastHint = 0;
}

function currentSteps() { return lesson[practice.key].steps; }
function currentStep() { return currentSteps()[practice.stepIndex]; }
function stepKey() { return practice.key + ":" + practice.stepIndex; }

function openingMessage() {
  const data = lesson[practice.key];
  return (practice.stepIndex === 0 ? data.intro + " " : "") + currentStep().ask;
}

function showPractice(message, mood) {
  const p = practice;
  const data = lesson[p.key];
  const steps = data.steps;
  const step = steps[p.stepIndex];
  const t = lesson.tutor;
  const lastStep = p.stepIndex === steps.length - 1;

  // remember that the learner has seen this step (for the learning report)
  stats.stepsSeen.add(stepKey());
  skillStat(step.skill);

  drawTracker(screens[current]);

  let html =
    '<p class="kicker">' + data.title + " · Step " + (p.stepIndex + 1) + " of " + steps.length + "</p>" +
    '<div class="math-line">' + fractions(data.problem) + "</div>";

  const finished = p.status === "correct" ? p.stepIndex + 1 : p.stepIndex;
  for (let i = 0; i < finished; i++) {
    html += '<div class="work-line">' + fractions(steps[i].works) + "</div>";
  }

  if (p.status === "correct") html += '<div class="badge good">✓ ' + t.correctBadge + "</div>";
  if (p.status === "wrong") html += '<div class="badge try">↻ ' + t.wrongBadge + "</div>";
  if (p.status === "hint") {
    html += '<div class="badge hint">' + HINT_NAMES[Math.min(p.lastHint, 2)] + " " + (p.lastHint + 1) + " of " + step.hints.length + "</div>";
  }
  card.innerHTML = html;

  // the tutor points at the numbers it is talking about
  if (p.status !== "correct") highlightLine(card.querySelector(".math-line"), step.point);

  nextBtn.disabled = p.status !== "correct";
  nextBtn.textContent = lastStep ? "Continue" : "Next step";
  inputArea.hidden = p.status === "correct";
  if (p.status !== "correct") drawInput();

  setBubble(message, mood);
}

function boxHtml(i, wide, label) {
  const active = practice.active === i;
  return '<button class="box' + (wide ? " wide" : "") + (active ? " active" : "") +
    '" data-box="' + i + '" aria-label="' + label + '" aria-pressed="' + active + '">' +
    practice.fields[i] + "</button>";
}

function drawInput() {
  const p = practice;
  const step = currentStep();
  const isFraction = step.input === "fraction";

  let boxes, note;
  if (isFraction) {
    boxes =
      '<span class="entry-frac">' + boxHtml(0, false, "Top number") +
      '<span class="vinculum"></span>' + boxHtml(1, false, "Bottom number") + "</span>";
    note = p.active === 0 ? "Top number selected" : "Bottom number selected";
  } else {
    boxes = '<span class="entry-frac">' + boxHtml(0, true, "Your answer") + "</span>";
    note = "Type your answer";
  }

  const hintLabel = p.hintLevel >= step.hints.length
    ? "Show me again"
    : HINT_NAMES[Math.min(p.hintLevel, 2)] + " " + (p.hintLevel + 1) + " of " + step.hints.length;

  const keys = ["1", "2", "3", "4", "5", "del", "6", "7", "8", "9", "0", "check"].map(k => {
    const text = k === "del" ? "Del" : k === "check" ? "Check" : k;
    const cls = k === "del" ? " del" : k === "check" ? " check" : "";
    return '<button class="key' + cls + '" data-key="' + k + '">' + text + "</button>";
  }).join("");

  inputArea.innerHTML =
    '<div class="entry-row">' +
      "<div>" +
        '<div class="entry-label">' + fractions(step.label) + "</div>" +
        '<div class="entry-note">' + note + "</div>" +
        '<button class="btn hint-btn" data-hint="1">' + hintLabel + "</button>" +
      "</div>" +
      boxes +
    "</div>" +
    '<div class="keypad">' + keys + "</div>";
}

function pressKey(k) {
  const p = practice;
  if (p.status === "correct") return;
  if (k === "check") { checkAnswer(); return; }
  const i = p.active;
  if (k === "del") p.fields[i] = p.fields[i].slice(0, -1);
  else if (p.fields[i].length < 3) p.fields[i] = (p.fields[i] === "0" ? "" : p.fields[i]) + k;
  drawInput();
}

function sameValue(a, b) {
  const x = a.split("/");
  const y = b.split("/");
  if (x.length < 2 || y.length < 2) return false;
  return Number(x[0]) * Number(y[1]) === Number(y[0]) * Number(x[1]);
}

function markCorrect(say) {
  practice.status = "correct";
  if (practice.stepIndex === currentSteps().length - 1) completed.add(screens[current].part);
  showPractice(say, "cheering");
}

// A wrong answer counts as a slip on a skill (the mistake's own skill, or the step's skill)
function markWrong(say, skill) {
  const missedSkill = skill || currentStep().skill;
  skillStat(missedSkill).slips++;
  const step = stepStat(missedSkill);
  step.slips++;
  step.lastSlipMessage = say;
  practice.status = "wrong";
  showPractice(say, "thinking");
}

function checkAnswer() {
  const p = practice;
  const step = currentStep();
  const t = lesson.tutor;
  const isFraction = step.input === "fraction";
  const top = p.fields[0];
  const bottom = p.fields[1];

  if (!top || (isFraction && !bottom)) { showPractice(t.emptyAnswer, "calm"); return; }
  if (isFraction && Number(bottom) === 0) { showPractice(t.zeroBottom, "calm"); return; }

  const given = isFraction ? Number(top) + "/" + Number(bottom) : String(Number(top));
  p.hintStreak = 0;

  if (step.correct.includes(given)) { markCorrect(step.correctSay); return; }

  const also = (step.alsoCorrect || []).find(a => a.answer === given);
  if (also) { markCorrect(also.say); return; }

  const mistake = (step.mistakes || []).find(m => m.answer === given);
  if (mistake) { markWrong(mistake.say, mistake.skill); return; }

  const almost = (step.almost || []).find(a => a.answer === given);
  if (almost) { markWrong(almost.say, almost.skill); return; }

  if (isFraction && sameValue(given, step.correct[0])) { markWrong(t.sameValue); return; }

  markWrong(t.tryAgain);
}

function giveHint() {
  const p = practice;
  const step = currentStep();
  const hints = step.hints;
  const level = Math.min(p.hintLevel, hints.length - 1);
  let text = hints[level];

  skillStat(step.skill).hints++;
  stepStat(step.skill).hints++;
  stats.hintedSteps.add(stepKey());

  p.hintStreak++;
  if (p.hintStreak >= 2) text += " " + lesson.tutor.helpTwice;
  p.lastHint = level;
  if (p.hintLevel < hints.length) p.hintLevel++;
  p.status = "hint";
  showPractice(text, "calm");
}

// Taps on the boxes, keypad and hint button
inputArea.addEventListener("click", (e) => {
  const el = e.target.closest("button");
  if (!el || !practice) return;
  if (el.dataset.box !== undefined) { practice.active = Number(el.dataset.box); drawInput(); }
  else if (el.dataset.key) pressKey(el.dataset.key);
  else if (el.dataset.hint) giveHint();
});

// Laptop keyboard: digits, Backspace, Enter, and "/" jumps to the bottom box
document.addEventListener("keydown", (e) => {
  const screen = screens[current];
  if (!screen || screen.type !== "practice" || !practice || practice.status === "correct") return;
  if (/^\d$/.test(e.key)) { pressKey(e.key); e.preventDefault(); }
  else if (e.key === "Backspace") { pressKey("del"); e.preventDefault(); }
  else if (e.key === "/") {
    if (currentStep().input === "fraction") { practice.active = 1; drawInput(); }
    e.preventDefault();
  }
  else if (e.key === "Enter" && e.target.tagName !== "BUTTON") { pressKey("check"); }
});

// ---------- Finish: the learning report ----------
function buildReport() {
  const order = Object.keys(lesson.report.skills);
  const used = order.filter(id => stats.skills[id]);
  const strong = used.filter(id => stats.skills[id].slips === 0 && stats.skills[id].hints === 0);
  const supported = Object.values(stats.steps)
    .filter(step => step.slips > 0 || step.hints > 0)
    .sort((a, b) => {
      const score = step => step.slips * 2 + step.hints;
      return score(b) - score(a) || b.slips - a.slips;
    });
  return { strong: strong, focus: supported[0] || null };
}

function listSkills(ids) {
  if (ids.length < 2) return ids[0] || "";
  if (ids.length === 2) return ids[0] + " and " + ids[1];
  return ids.slice(0, -1).join(", ") + ", and " + ids[ids.length - 1];
}

function skillTopic(id) {
  return {
    "match-bottoms": "matching bottoms",
    convert: "converting fractions",
    "add-tops": "adding the tops",
    simplify: "simplifying"
  }[id] || lesson.report.skills[id].strong;
}

function supportMessage(report) {
  const step = report.focus;
  const prefix = step.hints > 0 && step.slips > 0
    ? "You used a hint and needed another try on: "
    : step.hints > 0
      ? "You used a hint on: "
      : "You needed another try on: ";
  const reminder = step.lastSlipMessage && step.lastSlipMessage !== lesson.tutor.tryAgain
    ? step.lastSlipMessage
    : lesson.report.skills[step.skill].tip;
  if (step.slips > 0) {
    return prefix + step.prompt + " Remember: " + reminder;
  }
  return prefix + step.prompt + " " + reminder;
}

// What the tutor says at the end: the finish line plus one tip (all lines are pre-recorded)
function finishMessage(report) {
  const t = lesson.tutor;
  const r = lesson.report;
  if (!report.focus) return t.finish + " " + r.noSlips;
  return t.finish + " " + r.skills[report.focus.skill].tip;
}

function showFinish() {
  const f = lesson.finish;
  const r = lesson.report;
  const report = buildReport();
  setBubble(finishMessage(report), "proud");

  let html =
    "<h2>" + f.heading + "</h2>" +
    '<div class="work-line finish-equation"></div>' +
    '<div class="report"><h3>' + r.heading + "</h3>";

  if (report.strong.length > 0) {
    html += '<div class="rep good">✓ You\'re getting comfortable with ' +
      listSkills(report.strong.map(skillTopic)) + ".</div>";
  }
  if (report.focus) {
    html += '<div class="rep try">' + supportMessage(report) + "</div>" +
      '<p><strong>Next:</strong> Practice this exact step again.</p>' +
      '<button class="rep-btn no-print" data-practice-section="' + report.focus.practiceKey +
        '" data-practice-index="' + report.focus.stepIndex + '">Practice this step again</button>';
  } else {
    html += '<div class="rep good">✓ ' + r.noSlipsShort + "</div>" +
      "<p><strong>Next:</strong> Start again and see if you can solve the steps without hints.</p>";
  }
  html += '<p class="rep-note">' +
    r.hintsLine.replace("{n}", stats.hintedSteps.size).replace("{total}", stats.stepsSeen.size) + "</p></div>" +
    '<button class="btn save-btn no-print" id="saveBtn">' + r.save + "</button>";

  card.innerHTML = html;
  card.querySelector(".finish-equation").textContent = f.working.join(" ");
  nextBtn.textContent = f.again || "Start again";

  // Return to the exact step that needed support.
  card.querySelectorAll("[data-practice-section]").forEach(btn => {
    btn.addEventListener("click", () => {
      const sectionKey = btn.dataset.practiceSection;
      const stepIndex = Number(btn.dataset.practiceIndex);
      const targetIndex = screens.findIndex(screen =>
        screen.type === "practice" && screen.key === sectionKey);
      if (targetIndex < 0) return;
      current = targetIndex;
      watchStep = 0;
      practice = {
        key: sectionKey,
        stepIndex: stepIndex
      };
      resetStep();
      render();
    });
  });

  // Save my report: opens the print screen, where the learner can choose Save as PDF
  document.getElementById("saveBtn").addEventListener("click", () => window.print());
}

// ---------- Moving forward and back ----------
function enterIfPractice(atEnd) {
  const screen = screens[current];
  if (screen.type === "practice") startPractice(screen.key, atEnd);
}

function next() {
  const screen = screens[current];

  if (screen.type === "practice") {
    if (practice.status !== "correct") return;
    if (practice.stepIndex < currentSteps().length - 1) {
      practice.stepIndex++;
      resetStep();
      showPractice(openingMessage(), "calm");
      return;
    }
  }

  if (screen.type === "watch" && watchStep < lesson.workedExample.lines.length - 1) {
    watchStep++;
    render();
    return;
  }

  if (screen.type === "finish") {      // Start again
    current = 0;
    watchStep = 0;
    practice = null;
    completed.clear();
    stats = freshStats();
    stopSpeaking();
    render();
    return;
  }

  if (current < screens.length - 1) {
    const upcoming = screens[current + 1];
    if ((screen.type === "explain" || screen.type === "watch") && upcoming.part !== screen.part) {
      completed.add(screen.part);
    }
    current++;
    watchStep = 0;
    enterIfPractice(false);
    render();
  }
}

function back() {
  const screen = screens[current];

  if (screen.type === "practice" && practice.stepIndex > 0) {
    practice.stepIndex--;
    resetStep();
    showPractice(openingMessage(), "calm");
    return;
  }

  if (screen.type === "watch" && watchStep > 0) {
    watchStep--;
    render();
    return;
  }

  if (current > 0) {
    current--;
    if (screens[current].type === "watch") watchStep = lesson.workedExample.lines.length - 1;
    enterIfPractice(true);
    render();
  }
}

nextBtn.addEventListener("click", next);
backBtn.addEventListener("click", back);

// ---------- Sound button in the header: turns the voice on or off ----------
soundBtn.addEventListener("click", () => {
  setVoice(voiceChoice === "off" ? lastVoice : "off");
});

start();