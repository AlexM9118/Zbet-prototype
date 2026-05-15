# AIRO MVP Spec

## Product Core

AIRO is a premium football analytics and match intelligence mobile app.

AIRO is **not**:
- a betting app
- a casino app
- a gambling product
- a spreadsheet-like dashboard

AIRO should feel:
- premium
- cinematic
- intelligent
- minimal
- realtime
- Apple-like
- AI-native
- modern
- smooth
- futuristic

Positioning:
- Apple Sports
- ChatGPT
- TradingView
- for football

Brand tagline:
- `See Football Smarter`

## Design Direction

### Visual Tone
- Dark mode only
- Cinematic football atmosphere
- Premium SaaS finish
- Minimal clutter
- Elegant spacing
- Glassmorphism where useful, not everywhere
- Subtle glow only on important live/AI signals

### Palette
- Primary background: `#05070A`
- Secondary background: `#0B1118`
- Card background: `#101722`
- Primary accent: `#2EEA7A`
- Secondary accent: `#00D9FF`
- Negative metrics: `#7A1F1F`
- Text primary: `#FFFFFF`
- Text secondary: `#A8B3C2`

### UX Rules
- Insight-first, not table-first
- Never feel like a betting product
- Never feel like Excel
- Thumb-friendly interactions
- Bottom navigation always visible
- Smooth transitions and lightweight motion
- Strong hierarchy, low noise

## MVP Scope

This spec separates the product into three layers:
- `Must Have`: production MVP
- `Should Have`: second wave after MVP is stable
- `Later`: advanced product direction

---

## Must Have

### 1. Foundation

#### Mobile stack
- React Native
- Expo
- TypeScript
- React Navigation
- Zustand
- Reanimated

#### Backend stack
- Node.js
- NestJS
- PostgreSQL
- Prisma ORM
- Socket.io

#### Deployment baseline
- Docker
- Docker Compose
- Ubuntu VPS ready

#### Auth
- JWT
- Email/password authentication

### 2. App Navigation

Bottom navigation with 5 tabs:
1. Home
2. Matches
3. AI
4. Alerts
5. Profile

Style requirements:
- floating bar
- dark glass feel
- emerald active state
- rounded
- minimal outlined icons

### 3. Production MVP Screens

#### Splash Screen
Purpose:
- brand entry
- app loading
- onboarding gateway

Must include:
- AIRO logo
- `AIRO`
- `See Football Smarter`
- `Get Started`
- `Sign In`
- short feature bullets

#### Home
Purpose:
- AI feed
- daily football intelligence dashboard

Must include:
- greeting header
- top AI insight card
- momentum-style card
- value/signal style cards
- club crests
- confidence %
- short AI explanation
- CTA to full analysis

#### Matches
Purpose:
- smart fixture explorer

Must include:
- search
- tabs:
  - Today
  - Live
  - AI Picks
  - Upcoming
- fixture cards
- club crests
- time
- confidence %
- live status when available
- favorite action

#### Match Analysis
Purpose:
- core product screen

Must include:
- team crests
- score / timer area
- competition label
- tabs:
  - Overview
  - AI Insight
  - Stats
  - Timeline
  - Lineups

Must include these analytical blocks:
- home/draw/away probabilities
- AI insight summary
- smart predictions:
  - over/under
  - BTTS
  - corners
  - cards
  - first half goal probability
- recent form
- core comparison stats

Primary actions:
- Ask AI
- Create Alert
- Full Stats

#### AI Chat
Purpose:
- football-native assistant

Must include:
- chat bubbles
- suggested prompts
- structured football answers
- concise, realistic, data-grounded replies

AI safety rule:
- never invent statistics
- every stat in a response must come from structured fetched context

#### Alerts
Purpose:
- in-app smart alerts center

Must include:
- goal probability spike
- momentum change
- domination shift
- red card risk
- late goal probability

MVP level:
- in-app alert center first
- optional push notifications later

#### Profile
Purpose:
- account and preferences

Must include:
- avatar
- account
- notifications
- preferences
- timezone
- privacy
- support
- language switcher:
  - Romanian
  - English

### 4. Data Architecture

#### Non-negotiable rule
Use only:
- free
- public
- no-cost
- replaceable
football data sources

#### Must-have architecture
- provider abstraction layer
- normalization layer
- caching layer
- aggregation layer
- ability to swap providers later

Create backend abstraction around:
- fixtures
- teams
- standings
- match statistics
- live events
- predictions context

### 5. Backend Modules

Must create:
- `match.service.ts`
- `stats.service.ts`
- `momentum.service.ts`
- `ai.service.ts`
- `alerts.service.ts`
- `reports.service.ts`

### 6. Database

Prisma models required for MVP:
- users
- teams
- matches
- fixtures
- predictions
- alerts
- favorites
- ai_history

Optional in MVP but ready in schema:
- reports

### 7. Realtime MVP

MVP realtime must be modest and reliable.

Required:
- websocket connection layer
- live fixture refresh events
- alert trigger events

Allowed realtime events for MVP:
- `live_update`
- `momentum_change`
- `goal_probability`

Advanced realtime like true xG waves can be approximated later if data quality is weak.

### 8. Charts and Motion

Frontend libraries:
- `react-native-svg`
- `victory-native`
- `moti`

Required motion:
- fade transitions
- loading skeletons
- pulse states on live indicators
- lightweight animated confidence rings

---

## Should Have

### 1. Live Momentum Screen
- animated momentum graph
- xG style progression if supported by provider
- possession swings
- dangerous attacks
- live event timeline

### 2. Advanced Stats Screen
- elegant charts only
- no raw ugly tables
- radar chart
- comparison bars
- passing accuracy
- pressing intensity
- corners
- form and tactical comparisons

### 3. Favorites Screen
- favorite clubs
- favorite matches
- saved AI picks
- followed leagues

This can live either:
- inside Profile
- or as a drill-down from Home/Profile

### 4. Reports Screen
- daily report
- weekly report
- trend view
- performance cards
- AI summaries

### 5. AIRO+
- no pricing
- no subscription tables
- no discount language

Purpose:
- advanced mode
- deeper intelligence layer

Must feel:
- premium
- restrained
- product-tier
- not sales-page-like

---

## Later

### 1. Advanced Momentum Engine
- richer live momentum visuals
- better live event modeling
- higher fidelity xG-like progression

### 2. Tactical Layer
- lineups intelligence
- matchup notes
- pressing profile
- transition threat

### 3. Enhanced AIRO+
- deeper reports
- tactical summaries
- richer AI explanations

### 4. Push Notification System
- mobile push alerts
- user thresholds
- notification priority logic

### 5. Better Crest Strategy
- fully reliable official crest pipeline
- normalized local cache for team crests

---

## Decisions Already Made

- Product name: `AIRO`
- Tagline: `See Football Smarter`
- Bottom nav stays fixed with 5 tabs
- No premium pricing language
- `AIRO+` is a product capability layer, not a subscription sales page
- Design must remain mobile-first
- Romanian and English are both supported

---

## Open Decisions Before Full Build

These must be resolved before production implementation goes deep:

### 1. Free Data Provider Stack
We still need to define:
- primary provider
- fallback provider
- crest strategy
- live stats strategy
- lineup strategy

### 2. AI Provider
We still need to define:
- which model powers AI answers
- where model calls happen
- token/cost boundaries
- exact football context builder format

### 3. Realtime Depth
We still need to decide:
- true websocket realtime
- or polling + event synthesis
- or hybrid approach

### 4. MVP Boundary
We should confirm whether these are in MVP or wave 2:
- Timeline tab
- Lineups tab
- Live Momentum dedicated screen
- Reports screen
- Favorites dedicated screen

---

## Recommended MVP Build Order

### Phase 1
- app shell
- theme system
- navigation
- auth skeleton
- provider abstraction
- database schema

### Phase 2
- Splash
- Home
- Matches
- Match Analysis

### Phase 3
- AI Chat
- Alerts
- Profile
- language switching

### Phase 4
- backend data provider integration
- caching
- normalization
- websocket baseline

### Phase 5
- AIRO+ screen
- reports foundation
- favorites foundation

---

## Acceptance Criteria For MVP

AIRO MVP is considered successful when:
- it looks like a premium football intelligence app
- it does not resemble a betting or spreadsheet product
- Home, Matches, Match Analysis, AI, Alerts and Profile are all usable
- data comes through a provider abstraction layer
- no paid provider is required to run the MVP
- app can run in a VPS-ready stack using Docker-based services
- design feels polished on mobile first

---

## Immediate Next Step

Convert the current prototype into an `AIRO mobile shell` and rebuild the UI around this spec before going deeper on backend complexity.
