# ADVO — UI/UX Design Brief

> **Purpose:** This document is a complete design brief for generating the frontend UI of the ADVO AI Legal Assistant platform. It describes every screen, component, interaction, and visual pattern in enough detail to produce a production-ready design.
>
> **Product:** ADVO — an AI-powered legal assistant for Pakistani law  
> **Platform:** Web (responsive, desktop-first)  
> **Style:** Clean, professional, minimal — similar to modern AI chat interfaces (ChatGPT, Claude, Perplexity) with a legal/professional tone

---

## 1. Brand & Visual Identity

### 1.1 Product Name

**ADVO** — short for "Advocate." Displayed in the top-left of every page alongside a small scale-of-justice icon. Tagline beneath: "AI Legal Assistant · Pakistan"

### 1.2 Color Palette

| Token | Light Mode | Dark Mode | Usage |
|---|---|---|---|
| Background | `#FFFFFF` | `#0A0A0A` | Page background |
| Surface | `#F9FAFB` | `#141414` | Cards, panels, sidebar |
| Border | `#E5E7EB` | `#262626` | Dividers, card borders |
| Primary | `#2563EB` (blue-600) | `#3B82F6` (blue-500) | Buttons, links, active states |
| Primary Soft | `#EFF6FF` | `#172554` | Icon backgrounds, badges |
| Text | `#111827` | `#F9FAFB` | Headings, body text |
| Muted Text | `#6B7280` | `#9CA3AF` | Descriptions, timestamps, placeholders |
| Success | `#10B981` | `#34D399` | Verified citations, online indicator |
| Warning | `#F59E0B` | `#FBBF24` | Medium confidence |
| Danger | `#EF4444` | `#F87171` | Errors, high-risk alerts, offline indicator |

### 1.3 Typography

| Usage | Font | Size | Weight |
|---|---|---|---|
| Page headings | Inter (or Geist Sans) | 28–36px | Semibold |
| Section headings | Same | 18–20px | Semibold |
| Body text | Same | 14–15px | Regular |
| Captions, timestamps | Same | 12px | Regular |
| Statute/legal text | Geist Mono (monospace) | 13px | Regular |
| Urdu text | Noto Nastaliq Urdu | 16–18px (needs more line-height) | Regular, `direction: rtl` |

### 1.4 Spacing & Radius

- **Base unit:** 4px grid
- **Card border-radius:** 12px
- **Button border-radius:** 8px
- **Badge/Chip border-radius:** 999px (pill)
- **Page max-width:** 1200px centered
- **Chat max-width:** 768px centered
- **Section padding:** 16–24px

### 1.5 Icons

Use **Lucide icons** throughout. Key icons:

| Concept | Icon |
|---|---|
| Brand | `Scale` |
| Citizen | `User` |
| Student | `GraduationCap` |
| Lawyer | `Scale` |
| Chat | `MessageSquare` |
| Projects | `FolderOpen` |
| Law Library | `BookOpen` |
| New chat | `RotateCcw` |
| History | `History` or `Clock` |
| Attach file | `Paperclip` |
| Microphone | `Mic` |
| Send | `ArrowUp` |
| Stop | `Square` |
| Delete | `Trash2` |
| Close | `X` |
| External link | `ExternalLink` |
| Search | `Search` |

---

## 2. User Roles

The same person can switch between three roles. Each role changes the tone of responses, the starter questions, and the visual density.

### Citizen

- **Icon:** `User`
- **Label:** "Citizen"
- **Tagline:** "Everyday legal help"
- **Description:** Plain-language answers about your rights and the law in Pakistan
- **Personality:** Jargon-free, conversational, reassuring. Prominent disclaimers.
- **Starter questions (shown on empty chat):**
  1. "What makes a contract valid in Pakistan?"
  2. "What are my rights as a tenant in Pakistan?"
  3. "What should I check before signing an employment contract?"
  4. "How do I file a consumer complaint about a defective product?"
- **Follow-up chips (after a response):** "Explain that in simpler terms" · "What should I do next?" · "Show me the exact legal text"

### Student

- **Icon:** `GraduationCap`
- **Label:** "Law Student"
- **Tagline:** "Study & exam prep"
- **Description:** Detailed, structured explanations with doctrine and case context
- **Personality:** Educational, framework-oriented, section-by-section breakdowns
- **Starter questions:**
  1. "Explain the essentials of a valid contract with section numbers."
  2. "Compare coercion and undue influence under the Contract Act."
  3. "What is the difference between void and voidable agreements?"
  4. "Summarize the rules regarding contingent contracts."
- **Follow-up chips:** "Give me an exam-style framework" · "Compare the related sections" · "What are common exam traps here?"

### Lawyer

- **Icon:** `Scale`
- **Label:** "Lawyer"
- **Tagline:** "Technical precision"
- **Description:** Concise, precise analysis with statutory references and citations
- **Personality:** Dense, citation-first, minimal hand-holding
- **Starter questions:**
  1. "Elements of free consent under ss. 13–22 of the Contract Act 1872."
  2. "Framework for analyzing breach-of-contract remedies."
  3. "Jurisdictional limits for specific performance in Pakistan."
  4. "How does the Qanun-e-Shahadat treat electronic evidence?"
- **Follow-up chips:** "Cite the relevant statutory text" · "What are the practical pitfalls?" · "Any recent amendments?"

---

## 3. Global Navigation

### 3.1 Site Header (persistent, sticky top)

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚖️ ADVO          Chat    Projects    Law Library       [▾Role] ●│
│  AI Legal Assistant · Pakistan                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Left:** Brand icon (Scale in a blue rounded square) + "ADVO" in semibold + tagline in muted text (hidden on mobile)

**Center — Nav links:** Three text links with active-state highlight (light background pill behind the active link):
- **Chat** — navigates to `/chat`
- **Projects** — navigates to `/projects`
- **Law Library** — navigates to `/laws`

**Right:**
- **Role switcher:** A compact segmented control with three options: `Citizen` | `Student` | `Lawyer`. The active segment has a filled/primary style. Clicking a segment instantly switches the role globally.
- **Health dot:** A small circle — green = backend online, red = backend offline, gray = checking. On hover shows a tooltip: "Backend online" or "Backend offline."

**Mobile (< 768px):** Nav links and role switcher collapse into a hamburger menu that opens a slide-down sheet with all links, the role switcher, and the health indicator.

### 3.2 Role Switching Behavior

- Changing the role updates the global active role instantly
- The chat page re-renders starter questions and follow-ups for the new role
- The current chat is NOT cleared — the role change only affects the next response
- The history sidebar filters to show only sessions from the selected role
- The role persists across page refreshes and sessions

---

## 4. Screen-by-Screen Design

---

### 4.1 Landing Page (`/`)

**Purpose:** First impression — explain the product and let the user pick a role to begin.

**Layout:** Full-width, vertically centered hero section + features grid + footer disclaimer.

#### Hero Section

```
                    ┌───────────────────────┐
                    │  ⚖ Pakistani law ·    │  ← small secondary badge
                    │  Contract Act & more  │
                    └───────────────────────┘

              Legal answers you can
              actually verify.                   ← large heading (36–48px)
                                                 "actually verify" in primary blue

         ADVO explains Pakistani law in your     ← muted description
         words — from everyday contracts to
         exam-ready analysis — always citing
         the exact sections behind every answer.

         [ Start asking → ]    [ Analyze a document ]  ← two buttons side by side
              primary               outline
```

#### Role Selection Cards

Below the hero, three equal-width cards in a row. Each card is clickable and navigates to `/chat?mode={role}`.

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  👤              │ │  🎓              │ │  ⚖️              │
│                  │ │                  │ │                  │
│  Citizen         │ │  Law Student     │ │  Lawyer          │
│  Everyday legal  │ │  Study & exam    │ │  Technical       │
│  help            │ │  prep            │ │  precision       │
│                  │ │                  │ │                  │
│  Get clear,      │ │  Structured      │ │  Dense,          │
│  jargon-free     │ │  breakdowns with │ │  citation-first  │
│  explanations…   │ │  statutory text… │ │  analysis with   │
│                  │ │                  │ │  precise…        │
│                  │ │                  │ │                  │
│  Continue as     │ │  Continue as     │ │  Continue as     │
│  Citizen →       │ │  Student →       │ │  Lawyer →        │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

**Card interaction:** On hover, card lifts slightly (translateY -2px) and gains a subtle blue ring. The arrow icon slides right 2px.

#### Features Grid

A 4-column grid of feature highlights below the cards, separated by a top border with light background:

| Icon | Title | Description |
|---|---|---|
| `BookOpen` | Cited answers | Every claim points to the exact statute and section |
| `FileText` | Document analysis | Upload contracts — ask questions about what they say |
| `Sparkles` | Three modes | Answers tuned for citizens, students, and lawyers |
| `Mic` | Voice input | Speak your question and hear the answer read back |

#### Footer

A slim footer with a `ShieldAlert` icon and the disclaimer text in small muted text:

> "ADVO provides AI-generated legal information, not legal advice. Please consult a qualified lawyer for important matters."

---

### 4.2 Chat Workspace (`/chat`)

**Purpose:** The primary interface — conversational AI with role awareness, document attachment, project context, and history.

**Layout:** Two-panel layout on desktop: a **sidebar** (280px, left) and the **main chat area** (fluid, center, max 768px). On mobile, the sidebar becomes a slide-over drawer.

```
┌────────────┬──────────────────────────────────────────────────┐
│            │                                                  │
│  SIDEBAR   │  CHAT AREA                                       │
│  (280px)   │                                                  │
│            │                                                  │
│            │                                                  │
│            │                                                  │
│            │                                                  │
│            │                                                  │
│            │                                                  │
│            │                                                  │
│            │                                                  │
└────────────┴──────────────────────────────────────────────────┘
```

#### 4.2.1 Sidebar

The sidebar has three sections stacked vertically:

**Top — New Chat button:**
A full-width button with a `RotateCcw` icon and "New Chat" label. Clicking it clears the current conversation and starts a fresh session. Style: outlined/secondary button.

**Middle — Chat History list:**
A scrollable list of past chat sessions, filtered to only show sessions from the active role. Each row shows:

```
┌────────────────────────────┐
│  What makes a contract…    │  ← truncated first message (title)
│  12 messages · 2h ago      │  ← message count + relative time
│                        [🗑] │  ← delete icon (appears on hover)
└────────────────────────────┘
```

- Active session has a highlighted background (primary soft)
- Clicking a row loads that session's messages
- Hovering reveals a trash icon on the right for deletion
- Sessions are sorted most-recent-first
- If no history exists, show a muted empty state: "No conversations yet"

**Bottom — Active Project bar (optional):**
If a project is active, a small card appears at the bottom:

```
┌────────────────────────────┐
│  📁 Tenancy Dispute Case   │
│  3 documents               │
│                     [×]    │  ← clear project
└────────────────────────────┘
```

If no project is active, this section is hidden.

#### 4.2.2 Chat Toolbar (top of main area)

A horizontal bar at the top of the chat area:

```
┌──────────────────────────────────────────────────────────────────┐
│  [Citizen | Student | Lawyer]    Project: [▾ None]    [New] [☰]│
└──────────────────────────────────────────────────────────────────┘
```

| Element | Description |
|---|---|
| **Role toggle** | Segmented control (same as header but inline). Synced with global role. |
| **Project dropdown** | Shows "No Project" or the active project name. Clicking opens a dropdown with available projects + "Create new project" option. Selecting a project attaches all its documents as context. |
| **New Chat** | Ghost button with `RotateCcw` icon |
| **History toggle** | Ghost button with `History` icon — opens the sidebar on mobile (sidebar is always visible on desktop) |

#### 4.2.3 Empty State (no messages)

When the chat has no messages, show a centered welcome screen:

```
                    ┌─────────────┐
                    │     ⚖️      │  ← icon in primary soft circle (56px)
                    └─────────────┘

                  Everyday legal help            ← role heading

         Get clear, jargon-free explanations      ← role description
         of Pakistani law — contracts, tenancy,
         family matters — with exact sections
         cited so you can verify everything.

    ┌──────────────────────────────────────────────┐
    │  What makes a contract valid in Pakistan?    │  ← clickable question card
    └──────────────────────────────────────────────┘
    ┌──────────────────────────────────────────────┐
    │  What are my rights as a tenant?             │
    └──────────────────────────────────────────────┘
    ┌──────────────────────────────────────────────┐
    │  What should I check before signing…?        │
    └──────────────────────────────────────────────┘
    ┌──────────────────────────────────────────────┐
    │  How do I file a consumer complaint…?        │
    └──────────────────────────────────────────────┘
```

These question cards change when the role changes. Clicking one sends it as a message.

#### 4.2.4 Message Bubbles

**User messages:**
- Right-aligned (or left-aligned with user avatar — choose one pattern and be consistent)
- Solid background (primary soft or surface color)
- Rounded corners (12px)
- Plain text, no markdown

**Assistant messages:**
- Left-aligned, no background (or very subtle surface background)
- Scale icon avatar on the left
- Rich text with markdown rendering (bold, lists, code blocks, headings)
- Streaming: text appears token-by-token with a subtle blinking cursor at the end
- While streaming, a small tool-status label may appear above: "🔍 Searching legal database..." in muted text

#### 4.2.5 Citations (below assistant messages)

After a response completes, citations appear as small expandable cards below the message:

```
┌──────────────────────────────────────────────────────────────┐
│  📖 Citations (3)                                            │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ✅ Contract Act 1872, §10 — "What agreements are…"   │  │
│  │    [▸ Expand]                                         │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ⚠️ Contract Act 1872, §11 — "Who are competent…"     │  │
│  │    [▸ Expand]                                         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

- **Verified** (✅ green): The citation matched a retrieved source — show green left border
- **Unverified** (⚠️ amber): The citation was generated but not confirmed in sources — show amber left border
- Clicking "Expand" reveals the statute text snippet inside the card
- Small index number (1, 2, 3) on the left of each citation

#### 4.2.6 Confidence Indicator

A small pill badge near the citations showing grounding confidence:

| Level | Color | Label |
|---|---|---|
| High | Green | "High confidence — all citations verified" |
| Medium | Amber | "Medium confidence — some citations unverified" |
| Low | Red | "Low confidence — citations could not be verified" |

#### 4.2.7 High-Risk Alert Banner

If the user's question involves high-stakes legal topics (arrest, eviction, custody, deadlines), a warning banner appears above the response:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠️  This question involves a high-stakes legal matter.      │
│     Please consult a qualified lawyer for personalized       │
│     advice.                                                  │
└──────────────────────────────────────────────────────────────┘
```

Style: amber/yellow background, warning icon, slightly larger text.

#### 4.2.8 Follow-Up Chips

After the last assistant message completes, a row of small pill buttons appears:

```
  [ Explain that in simpler terms ]  [ What should I do next? ]  [ Show me the exact legal text ]
```

Style: outlined pills with muted text, on hover they get primary border and foreground text. Clicking sends the text as a message.

#### 4.2.9 Chat Input (Composer)

Fixed at the bottom of the chat area:

```
┌──────────────────────────────────────────────────────────────┐
│  [📎]  Type your question...                       [🎤] [↑] │
│                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐           │
│  │ 📄 contract.pdf  ×  │  │ 📄 lease.docx    ×  │           │
│  └─────────────────────┘  └─────────────────────┘           │
└──────────────────────────────────────────────────────────────┘
```

| Element | Description |
|---|---|
| **Attach button (📎)** | Paperclip icon, opens file picker. Accepts PDF, DOCX, TXT. Up to 3 files. |
| **Textarea** | Auto-growing, placeholder: "Type your question...", min 1 row, max 6 rows |
| **Mic button (🎤)** | Starts voice recording. While recording, turns red with a pulse animation. On stop, transcribes audio and fills the textarea. |
| **Send button (↑)** | Circular primary button with up-arrow. Disabled when textarea is empty or files are still uploading. |
| **Stop button** | Replaces send button during streaming — shows a square icon, clicking aborts the stream. |
| **Attached file chips** | Appear below the textarea when files are attached. Show filename + × to remove. While uploading, show a spinner. |

**Keyboard shortcuts:**
- `Enter` — send message
- `Shift+Enter` — new line
- `Ctrl+Shift+N` — new chat

#### 4.2.10 Disclaimer

A small muted line at the very bottom, always visible:

> "ADVO provides AI-generated legal information, not legal advice."

---

### 4.3 Projects (`/projects`)

**Purpose:** Named workspaces that bundle reference documents with chat sessions around a specific legal matter.

#### 4.3.1 Project List Page

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Projects                                         [+ New Project]│
│  Organize your documents and conversations around                │
│  specific legal matters.                                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  📁  Tenancy Dispute Case                                    ││
│  │      3 documents · 2 chat sessions · Updated 2 hours ago    ││
│  │                                                              ││
│  │                                   [Open]  [Delete]          ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  📁  Employment Contract Review                              ││
│  │      5 documents · 1 chat session · Updated yesterday        ││
│  │                                                              ││
│  │                                   [Open]  [Delete]          ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│  │  📁  Property Transfer Docs                                  ││
│  │      1 document · 0 chat sessions · Updated 3 days ago      ││
│  │                                   [Open]  [Delete]          ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Empty state (no projects):**

```
                    ┌─────────────┐
                    │     📁      │
                    └─────────────┘

                  No projects yet

         Create a project to organize your documents
         and chat sessions around a legal matter.

              [ + Create your first project ]
```

**New Project dialog:**

```
┌────────────────────────────────────┐
│  Create Project                    │
│                                    │
│  Name                              │
│  ┌──────────────────────────────┐  │
│  │ e.g. Tenancy Dispute Case    │  │
│  └──────────────────────────────┘  │
│                                    │
│  Description (optional)            │
│  ┌──────────────────────────────┐  │
│  │                              │  │
│  └──────────────────────────────┘  │
│                                    │
│              [Cancel]  [Create]    │
└────────────────────────────────────┘
```

#### 4.3.2 Project Detail Page (`/projects/[id]`)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ← Back to Projects                                              │
│                                                                  │
│  📁 Tenancy Dispute Case                          [✏️ Edit] [💬 Chat]│
│  Created September 1, 2026                                       │
│                                                                  │
│  ┌─────────────┬─────────────────┐                               │
│  │  Documents  │  Chat Sessions  │  ← tab switcher               │
│  ├─────────────┴─────────────────┤                               │
│  │                               │                               │
│  │  [Upload Document]            │                               │
│  │                               │                               │
│  │  ┌──────────────────────────┐ │                               │
│  │  │ 📄 lease_agreement.pdf   │ │                               │
│  │  │    24 KB · Uploaded Sep 1│ │                               │
│  │  │                    [🗑]  │ │                               │
│  │  └──────────────────────────┘ │                               │
│  │  ┌──────────────────────────┐ │                               │
│  │  │ 📄 notice_letter.docx    │ │                               │
│  │  │    12 KB · Uploaded Sep 1│ │                               │
│  │  │                    [🗑]  │ │                               │
│  │  └──────────────────────────┘ │                               │
│  │  ┌──────────────────────────┐ │                               │
│  │  │ 📄 rent_receipts.txt     │ │                               │
│  │  │    8 KB · Uploaded Sep 2 │ │                               │
│  │  │                    [🗑]  │ │                               │
│  │  └──────────────────────────┘ │                               │
│  │                               │                               │
│  └───────────────────────────────┘                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Chat Sessions tab** shows all sessions associated with this project:

```
│  ┌──────────────────────────┐ │
│  │ 💬 Initial questions     │ │
│  │    12 msgs · Sep 1       │ │
│  │              [Open →]    │ │
│  └──────────────────────────┘ │
│  ┌──────────────────────────┐ │
│  │ 💬 Follow-up on notice   │ │
│  │    8 msgs · Sep 2        │ │
│  │              [Open →]    │ │
│  └──────────────────────────┘ │
```

Clicking "Open" on a session navigates to the chat page with that session loaded and the project context active.

Clicking "Chat" in the project header navigates to `/chat?project={id}` — opens a new chat with all project documents as context.

---

### 4.4 Law Library (`/laws`)

**Purpose:** A browsable, bilingual database of Pakistani statutes. Especially important for the Lawyer role but available to all users.

#### 4.4.1 Library Landing Page

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Law Library                                              [EN|UR]│
│  Browse Pakistani statutes in English and Urdu                   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  🔍  Search by act name, section number, or keyword…        ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ── Contract Law ──────────────────────────────────────────────  │
│                                                                  │
│  ┌────────────────────┐ ┌────────────────────┐ ┌──────────────┐ │
│  │ Contract Act 1872  │ │ Partnership Act    │ │ Sale of Goods│ │
│  │ 75 sections        │ │ 1932 · 30 sections │ │ Act 1930     │ │
│  │ [Browse →]         │ │ [Browse →]         │ │ [Browse →]   │ │
│  └────────────────────┘ └────────────────────┘ └──────────────┘ │
│                                                                  │
│  ── Criminal Law ──────────────────────────────────────────────  │
│                                                                  │
│  ┌────────────────────┐ ┌────────────────────┐                  │
│  │ Pakistan Penal     │ │ Criminal Procedure │                  │
│  │ Code 1860          │ │ Code 1898          │                  │
│  │ 511 sections       │ │ 564 sections       │                  │
│  │ [Browse →]         │ │ [Browse →]         │                  │
│  └────────────────────┘ └────────────────────┘                  │
│                                                                  │
│  ── Family Law ────────────────────────────────────────────────  │
│                                                                  │
│  ┌────────────────────┐ ┌────────────────────┐                  │
│  │ Muslim Family Laws │ │ Dissolution of     │                  │
│  │ Ordinance 1961     │ │ Muslim Marriages   │                  │
│  │ [Browse →]         │ │ [Browse →]         │                  │
│  └────────────────────┘ └────────────────────┘                  │
│                                                                  │
│  ── Property Law ──────────────────────────────────────────────  │
│  ┌────────────────────┐ ┌────────────────────┐                  │
│  │ Transfer of        │ │ Registration Act   │                  │
│  │ Property Act 1882  │ │ 1908               │                  │
│  │ [Browse →]         │ │ [Browse →]         │                  │
│  └────────────────────┘ └────────────────────┘                  │
│                                                                  │
│  ── Constitutional Law ─── Evidence ─── Labour ─── Tax ── etc.  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Language toggle (top right):** A pill toggle `[EN | UR]`. When switched to UR, all act names, descriptions, and category labels switch to Urdu text (rendered RTL). The toggle persists across pages.

**Search bar:** A large text input with search icon. Typing filters acts in real-time, or shows section-level search results:

```
│  Search results for "free consent":                               │
│                                                                  │
│  Contract Act 1872                                               │
│    §13 — "Consent" defined                                       │
│      Two or more persons are said to consent when…               │
│    §14 — "Free consent" defined                                  │
│      Consent is said to be free when it is not caused by…        │
│                                                                  │
```

Each search result is clickable and navigates to the section detail page.

**Act cards:** Each card shows the act name, section count (or year), and a "Browse →" link. On hover, card lifts and gets primary border.

#### 4.4.2 Act Detail Page (`/laws/[act-slug]`)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ← Back to Law Library                                           │
│                                                                  │
│  Contract Act 1872                                        [EN|UR]│
│  An Act to define and amend the law relating to contracts.       │
│                                                                  │
│  ↗ Official source: na.gov.pk — Full Act PDF                    │
│                                                                  │
│  ── Table of Contents ────────────────────────────────────────── │
│                                                                  │
│   §1   Short title                                        [→]   │
│   §2   Interpretation-clause                              [→]   │
│   §3   Communication, acceptance and revocation            [→]   │
│   §4   Communication when complete                        [→]   │
│   §5   Revocation of proposals and acceptances            [→]   │
│  §10   What agreements are contracts                      [→]   │
│  §11   Who are competent to contract                      [→]   │
│  §12   What is a sound mind for contracting               [→]   │
│  §13   "Consent" defined                                  [→]   │
│  §14   "Free consent" defined                             [→]   │
│  §15   "Coercion" defined                                 [→]   │
│  §16   "Undue influence" defined                          [→]   │
│  §17   "Fraud" defined                                    [→]   │
│  §23   What considerations and objects are lawful          [→]   │
│  §37   Obligation of parties to contracts                 [→]   │
│  §39   Effect of refusal of party to perform              [→]   │
│  §73   Compensation for breach of contract                [→]   │
│  §74   Compensation where penalty stipulated              [→]   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Each row in the table of contents is a clickable link that navigates to the section detail page. The section number is in monospace font, the title is regular font. Hover highlights the row.

The "Official source" link is an external link (opens in new tab) to the government website hosting the official document.

#### 4.4.3 Section Detail Page (`/laws/[act-slug]/[section]`)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ← Back to Contract Act 1872                                     │
│                                                                  │
│  Section 10 — What agreements are contracts               [EN|UR]│
│  Contract Act 1872                                               │
│                                                                  │
│  ── English ──────────────────────────────────────────────────── │
│                                                                  │
│  All agreements are contracts if they are made by the free       │
│  consent of parties competent to contract, for a lawful          │
│  consideration and with a lawful object, and are not hereby      │
│  expressly declared to be void to which it is made.              │
│                                                                  │
│  ── اردو ────────────────────────────────────────────────────── │
│                                                                  │
│  تمام معاہدے معاہدے ہیں اگر وہ آزادانہ رضامندی سے فریقین کی   │
│  جانب سے بنائے جائیں جو معاہدہ کرنے کے قابل ہوں…               │
│                                                                  │
│  ── Related Sections ────────────────────────────────────────── │
│                                                                  │
│   §11   Who are competent to contract                     [→]   │
│   §13   "Consent" defined                                 [→]   │
│   §14   "Free consent" defined                            [→]   │
│                                                                  │
│  ── Ask ADVO about this section ─────────────────────────────── │
│                                                                  │
│  [ 💬 Open in Chat → ]                                           │
│                                                                  │
│  ── Official Source ─────────────────────────────────────────── │
│                                                                  │
│  [ ↗ Download official PDF from na.gov.pk ]                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Key design details:**
- The English section uses LTR text, the Urdu section uses RTL text with Noto Nastaliq Urdu font
- Both languages are shown simultaneously (one below the other), each with a subtle heading
- "Related Sections" links navigate to other section detail pages
- "Open in Chat" button navigates to `/chat` with a pre-filled question like "Explain Section 10 of the Contract Act 1872"
- "Official Source" is an external link to the government PDF

---

## 5. Interactions & Flows

### 5.1 Starting a New Chat

1. User clicks "New Chat" button (toolbar, sidebar, or Ctrl+Shift+N)
2. Messages clear, a new session ID is generated
3. The empty state appears with the current role's starter questions
4. The active project is preserved (if any)

### 5.2 Sending a Message with Attachments

1. User types in the textarea
2. User clicks 📎 to attach a file — file picker opens
3. User selects a file — upload begins immediately, chip shows spinner
4. Upload completes — chip shows filename with green check
5. User can attach up to 3 files total
6. User clicks Send (or presses Enter)
7. User message appears with text (attachment info shown as subtle label)
8. Assistant streams a response with context from the attached documents
9. After response, citations and confidence appear

### 5.3 Switching Roles

1. User clicks a different role in the header switcher, chat toolbar, or landing page
2. The global role updates instantly
3. Starter questions update (if on empty state)
4. Follow-up chips update (if on a completed conversation)
5. History sidebar filters to show only sessions from the new role
6. The current chat messages remain visible (they are NOT cleared)
7. The next message sent uses the new role's system prompt

### 5.4 Using a Project in Chat

1. User clicks the project dropdown in the chat toolbar
2. Dropdown shows available projects + "Create new project"
3. User selects a project
4. A project context bar appears below the toolbar: "📁 Tenancy Dispute Case · 3 docs [×]"
5. All documents from the project are sent as context with subsequent messages
6. New chat sessions created while a project is active are automatically linked to that project

### 5.5 Browsing the Law Library

1. User navigates to Law Library from the header
2. Sees categories and acts
3. Can toggle language (EN/UR) — all labels and names switch
4. Can search by keyword — results appear inline
5. Clicks an act → sees all sections in a table of contents
6. Clicks a section → sees bilingual text, related sections, and option to ask in chat
7. "Open in Chat" pre-fills a question about that section

### 5.6 Voice Input

1. User clicks mic button — button turns red with pulse animation
2. Browser requests microphone permission
3. User speaks — recording indicator shows duration
4. User clicks mic again (or it auto-stops after silence)
5. Audio is transcribed and text fills the textarea
6. User can edit the text before sending

---

## 6. States & Edge Cases

### 6.1 Loading States

| Screen | Pattern |
|---|---|
| Chat history loading | Skeleton rows (3 placeholder bars with shimmer animation) |
| Project list loading | Skeleton cards (2-3 placeholder cards with shimmer) |
| Law library loading | Skeleton act cards in grid layout |
| Section detail loading | Skeleton text lines for English and Urdu sections |
| File uploading | Spinner on the attachment chip, send button disabled |
| Backend offline | Health dot turns red, toast notification: "Backend is offline. Please start the API server." |

### 6.2 Error States

| Scenario | UI Treatment |
|---|---|
| Chat error | Last message shows error text in red, with a "Retry" button |
| File upload fails | Chip turns red with error text, × to dismiss, retry option |
| Session load fails | Toast: "Could not load conversation" |
| Law library load fails | Error card with retry button in the center |
| Voice transcription fails | Toast: "Could not transcribe audio. Please try again." |

### 6.3 Empty States

| Screen | Message |
|---|---|
| No chat messages | Role-specific welcome with icon + heading + 4 starter questions |
| No chat history | "No conversations yet" in muted text |
| No projects | Illustration + "No projects yet" + "Create your first project" button |
| No project documents | "No documents uploaded yet" + "Upload Document" button |
| No law search results | "No results found for '{query}'" + suggestion to browse by category |

### 6.4 Responsive Behavior

| Breakpoint | Layout |
|---|---|
| **Desktop (> 1024px)** | Sidebar visible, 3–4 column grids, full nav |
| **Tablet (768–1024px)** | Sidebar as overlay drawer, 2-column grids, condensed nav |
| **Mobile (< 768px)** | No sidebar (hamburger to open drawer), single column, hamburger menu for nav |

On mobile, the chat composer sticks to the bottom of the viewport with safe-area-inset-bottom for iOS keyboards.

---

## 7. Page Summary

| Route | Page | Key Components |
|---|---|---|
| `/` | Landing | Hero, role cards, feature grid, disclaimer |
| `/chat` | Chat workspace | Sidebar (history), toolbar, messages, citations, composer |
| `/projects` | Project list | Project cards, create button |
| `/projects/[id]` | Project detail | Tabs (documents, sessions), upload, edit |
| `/laws` | Law library | Search, category grid, language toggle |
| `/laws/[slug]` | Act detail | Table of contents, official link |
| `/laws/[slug]/[section]` | Section detail | Bilingual text, related sections, ask-in-chat |

---

## 8. Design Constraints

1. **No separate Documents page** — document upload happens inline in chat (via attach button) and within project pages
2. **All statutes must have official source links** — every act detail page links to the official government PDF
3. **Bilingual parity** — the Law Library must support both English and Urdu for every piece of content
4. **Urdu text must be RTL** — use `direction: rtl` and Noto Nastaliq Urdu font
5. **Citations are mandatory** — every assistant response must show its citations, verified or unverified
6. **Disclaimer always visible** — the footer disclaimer must appear on every page
7. **Role is global** — the role switcher in the header affects the entire app, not just the current page

---

*End of design brief.*
