<div align="center">
  <img src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzJmZTBhYmRjMWJkZTRiZTcwNjBkZGU3NGE2MjBiYWRmZmZlNWFlMCZlcD12MV9pbnRlcm5hbF9naWZzX2dpZklkJmN0PWc/3o7TKSjRrfIPjeiVyM/giphy.gif" width="160" alt="Cute Anime Study Gif" />
  
  # 🌟 StudyVault Central 🌟
  
  **Your magical, local-first, AI-powered study universe! 🚀✨**

  [![Status](https://img.shields.io/badge/Status-Active%20%26%20Stable-purple.svg)]()
  [![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20%7C%20Mac%20%7C%20Linux-blue.svg)]()
  [![AI Powered](https://img.shields.io/badge/AI-Universal%20BYO--Key-FF69B4.svg)]()
  [![License](https://img.shields.io/badge/License-MIT-green.svg)]()
</div>

---

## 🌸 What is StudyVault & Why do I need it?

Let's be 100% real for a second. We've all been there:
You sit down to study for "just 30 minutes", and 2 hours later you have **47 Chrome tabs open**, 4 different PDF viewers, a YouTube lecture playing at 2x speed in the background, a Notion page that looks like an aggressive digital spiderweb 🕸️, and 5 monthly subscriptions just to get AI to summarize a single lecture. *Ew.* 🤢

**Enter StudyVault Central!** 🎉

StudyVault is an all-in-one, **local-first desktop & web application** built to make learning *unreasonably fast*, *absurdly effective*, and *completely private*. 

Instead of juggling 10 different apps, StudyVault brings your entire academic life into one gorgeous, hyper-optimized vault that lives on **your machine**. No cloud lock-ins, no corporate tracking, no forced subscriptions — just pure, unadulterated productivity! 🧈✨

---

## ⚡ 2 Ways to Run StudyVault

### 🅰️ Method 1: Instant One-Click Browser Mode (Zero Installation!) 🚀
Don't want to install anything? No problem!
1. Download or clone this repository.
2. Double-click **`run.bat`** in the project folder!
3. Boom! Your default browser will instantly open StudyVault with full local speed! 🌐

---

### 🅱️ Method 2: Standalone Desktop App (`.exe` / Build from Source) 🖥️

#### Option A: Download Pre-Built Windows Installer (`.exe`)
Head over to the **[Releases](../../releases)** tab and download `StudyVault Setup 1.0.0.exe`! Double-click to install and launch your app directly on Windows 10/11.

> 💡 *Note: The pre-built `.exe` is built for Windows x64. If you are on Mac, Linux, or prefer running from source, follow Option B below!*

#### Option B: Build From Source (Works on Windows, Mac & Linux!) 🛠️
```bash
# 1. Clone the repository
git clone https://github.com/igoswamirajat/StudyVault.git
cd StudyVault

# 2. Install magic dependencies 🪄
npm install

# 3. Run developer preview
npm run dev

# 4. Build your own standalone Desktop App! 📦
npm run build:electron
```
Your custom installer will be generated inside `dist-electron/`!

---

## ✨ The Superpower Features!

### 🎯 1. Active Recall & Spaced Repetition (SuperMemo SM-2 Algorithm) 🧠
Notion tables don't prepare you for exams — **active recall does**! 
StudyVault features a built-in flashcard engine powered by the **SM-2 Spaced Repetition algorithm**. 
- Cards automatically calculate ease factors (`E-Factor`), repetition counts, and due dates based on your quality rating (`1-5`).
- Never waste time reviewing cards you already know — study only what your brain is about to forget!

### 🎙️ 2. The Feynman Technique AI Examiner 🗣️
"If you can't explain it simply, you don't understand it well enough."
- Speak or type your explanation of any topic into the **Feynman Assessment Modal**.
- Our strict AI examiner evaluates your response out of 10, identifies your exact misconceptions, and highlights knowledge gaps you missed in the source material!

### 📥 3. Local `yt-dlp` YouTube Transcript Extraction 🍿
Tired of AI apps breaking because YouTube blocked their datacenter IP addresses? 
- StudyVault bundles a local **`yt-dlp` executable** directly in the app!
- Transcripts are extracted **directly from your home IP address** with zero rate-limit bans, zero third-party dependencies, and zero maintenance.

### 🤖 4. Bring-Your-Own-AI Universal Engine (120k Context Window!) 🔑
You control the keys! Plug in **Gemini 3.6 Flash**, **Claude Sonnet 4.6**, **GPT-4o**, **DeepSeek**, or **Local Ollama**.
- **Universal Resilient Parser:** Never crashes with `No object generated: response did not match schema`.
- **120,000 Character Context Window:** Feed entire lecture transcripts and textbook chapters without getting cut off!
- **Auto-Summaries & Auto-Notes:** Generate structured markdown notes with bullet points and key takeaways in seconds.
- **Doubt Buster Tutor:** Ask questions in real-time grounded strictly in your study material.

### 🕸️ 5. Interactive 2D/3D Knowledge Graph 🌌
Visualize your brain! The interactive network graph links your resources, notes, notebooks, and tags in a floating 2D/3D force-directed layout. Click any node to instantly jump to that note or video.

### 🧈 6. Cinematic 60 FPS Canvas Splash & Lerp Smooth Scrolling 🎨
- **60 FPS Canvas Splash Screen:** Powered by a dual-canvas rendering loop with zero frame drops (`BootScreen.tsx`).
- **Butter-Smooth Momentum Scroll (`useButterScroll`):** Cinematic lerp scrolling for mouse wheel, trackpad, and touch inputs.
- **Non-Blocking Panel Transitions:** Fast 220ms GPU route transitions in `AppShell.tsx` — zero white-screen freeze bugs when switching tabs!

### 📌 7. Floating Focus Box & Daily Organizer 📅
- A draggable, sticky **Focus Box** stays with you across the app, tracking your session intentions, Pomodoro timers, and awarding XP for completed tasks.
- A smart **Organizer** that schedules your study days automatically.

---

## 🛠️ The Tech Stack (Built for Speed!)

- **Framework:** TanStack Start & React ⚛️
- **Styling:** TailwindCSS & Framer Motion ✨
- **Database:** Dexie.js & IndexedDB (100% Local-First Architecture) 💾
- **Local Binary:** `yt-dlp` bundled via Electron `extraResources` 🛠️
- **Desktop Wrapper:** Electron 🖥️

---

## 🛡️ Privacy & Automatic Backups

Because StudyVault is **local-first**, your data belongs to **YOU**. No corporate telemetry, no cloud selling, no forced logins. 

We also built an **Encrypted Automatic Daily Backup** system! Set a master password, and your entire database (notes, flashcards, resources, graph) is safely backed up every single day. 🔒

---

<div align="center">
  <i>Built with ❤️ for students everywhere who want to crush their exams!</i>
  <br/><br/>
  <img src="https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif" width="180" alt="Hugging Gif" />
</div>
