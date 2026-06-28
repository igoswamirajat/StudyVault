# StudyVault Central

A personal study room built for students who organise their learning material on Google Drive. Import your Drive folders, study PDFs, videos, and documents in one place, take notes, track progress, and quiz yourself — all without leaving the app.

---

## Why This Exists

Most students dump their study material across random Drive folders and then jump between tabs to study — Drive for files, Notion for notes, YouTube for videos, some random PDF viewer, a separate flashcard app. StudyVault Central pulls everything into one focused interface so you can actually sit down and study instead of managing tools.

---

## Features

### Google Drive Integration
- Paste any public Google Drive folder URL to import all your study material
- Scans the folder and pulls in every file automatically
- Works without an API key for top-level files
- Add a Drive API key to unlock subfolder recursion and proper file type detection
- Supports PDFs, videos, markdown files, HTML, and images

### Study Room
- Dedicated viewer for each file type — PDF reader with page navigation and zoom, video player with playback controls, markdown and HTML renderer, image viewer
- Keyboard shortcuts throughout: `Space` pause/resume video, `←/→` seek, `F` fullscreen, `Shift+←/→` previous/next resource, `Ctrl+Enter` mark done and advance, `N` toggle notes panel
- Left sidebar shows all resources in the current folder so you can navigate without leaving
- Study session timer tracks how long you spend on each resource
- Pomodoro widget built in

### Notes
- Rich text editor (TipTap) with formatting toolbar — bold, italic, headings, lists, code blocks, blockquotes, links
- Undo/redo with `Ctrl+Z` / `Ctrl+Y`
- Summary note per resource — auto-populated when you save highlights from the viewer
- Timestamp linking — click "Timestamp" while watching a video to insert the current time into your note; click it later to jump back
- Page reference linking for PDFs
- Backlinks — see every note that references the current resource with `[[resource name]]` syntax
- Day notes and global notes alongside resource-specific notes

### Library
- All your imported resources in one view
- Organised by Drive folder path
- Context menu for rename, move, delete, download
- Multi-select with bulk actions
- Drag and drop to reorder
- Inline rename

### Progress Tracking
- Mark resources as not started, in progress, or completed
- Progress overview across all your material
- Streak tracking for daily study habit
- Recharts-based visual breakdown

### Flashcards
- Create flashcard decks manually
- Spaced repetition review session
- Linked to resources so you can review cards for what you're currently studying

### Organizer
- Assign resources to study days
- Plan your study schedule across a course or subject

### Workspaces
- Separate workspaces for different subjects or courses
- Each workspace has its own Drive folder, resources, notes, and progress — completely isolated

### Offline Support
- Download any resource to local storage for offline access
- Works in Chromium-based browsers with the File System Access API
- Electron desktop wrapper included for full offline capability

### Command Palette
- `Ctrl+K` / `Cmd+K` to search and jump to any resource, note, or page instantly

### Export
- Export resource summary notes as PDF

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | TanStack Start (React, SSR) |
| Routing | TanStack Router (file-based) |
| Styling | Tailwind CSS + Radix UI |
| Editor | TipTap |
| Database | Dexie (IndexedDB, runs in browser) |
| Charts | Recharts |
| PDF | react-pdf / pdfjs |
| Drag & Drop | dnd-kit |
| Desktop | Electron |

---

## Getting Started

### Prerequisites
- Node.js 18+ or Bun
- A Google account with study material in a **public** Google Drive folder

### Install & Run

```bash
# Clone the repo
git clone https://github.com/igoswamirajat/StudyVault.git
cd StudyVault

# Install dependencies
npm install
if this fails use:
npm install --legacy-peer-deps
# or
bun install

# Start the dev server
npm run dev
# or
bun dev
```

Open `http://localhost:8081` in your browser.

### First Time Setup
1. Open the app — you'll land on the Onboarding page
2. Paste a public Google Drive folder URL
3. Click **Scan Folder** — your files will be imported
4. Optionally add a Google Drive API key for subfolder support
5. Head to the Library and start studying

### Google Drive API Key (Optional)
Required only if your folder has subfolders or you want accurate file type detection.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → Enable the **Google Drive API**
3. Create an API key under Credentials
4. Paste it in the Onboarding page or Settings

---

## Notes

- All data is stored locally in your browser's IndexedDB — nothing is sent to any server
- The app is designed for personal use with your own Drive material
- AI features are planned but not yet live due to API pricing — coming in a later build
