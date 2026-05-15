# AIRO — FINAL PRODUCT + DESIGN ENGINEERING SPEC

IMPORTANT:
This document is the FINAL SOURCE OF TRUTH for the AIRO application.

AIRO is a premium football intelligence mobile application.

AIRO IS NOT:
- a betting app
- a gambling product
- a casino interface
- a spreadsheet dashboard

AIRO MUST FEEL:
- premium
- cinematic
- realtime
- elegant
- futuristic
- Apple-like
- intelligent
- addictive
- minimal
- fluid

The app should feel like:
Apple Sports
+
ChatGPT
+
TradingView
for football.

====================================================
1. MVP SCOPE
====================================================

FULLY FUNCTIONAL IN MVP:

1. Splash
2. Home
3. Matches
4. Match Analysis
5. AI Chat
6. Alerts
7. Profile
8. Favorites

PARTIAL / VISUAL ONLY:
- Live Momentum
- Advanced Stats
- Reports
- AIRO+

DO NOT fully implement advanced realtime systems in MVP.

====================================================
2. TECH STACK
====================================================

Frontend:
- React Native
- Expo
- TypeScript
- React Navigation
- Zustand
- Reanimated
- Moti

Backend:
- Node.js
- NestJS
- Prisma ORM
- PostgreSQL
- Socket.io

Deployment:
- Docker
- docker-compose
- nginx
- Ubuntu VPS ready

====================================================
3. PROVIDER ARCHITECTURE
====================================================

DO NOT hardcode providers.

Create modular provider layer.

Structure:

providers/
 ├── provider.interface.ts
 ├── football.provider.ts
 ├── secondary.provider.ts
 ├── mock.provider.ts
 └── provider.factory.ts

Must support:
- provider switching
- fallback providers
- caching
- normalization
- aggregation

Use ONLY:
- free
- public
- no-cost
football data sources.

====================================================
4. DESIGN SYSTEM
====================================================

PRIMARY BACKGROUND:
#05070A

SECONDARY BACKGROUND:
#0B1118

CARD BACKGROUND:
#101722

PRIMARY ACCENT:
#2EEA7A

SECONDARY ACCENT:
#00D9FF

NEGATIVE METRICS:
#7A1F1F

SECONDARY NEGATIVE:
#8B2323

WARNING:
#FFB84D

PRIMARY TEXT:
#FFFFFF

SECONDARY TEXT:
#A8B3C2

DIVIDER:
rgba(255,255,255,0.05)

CARD GLASS:
rgba(16,23,34,0.82)

====================================================
5. SPACING SYSTEM
====================================================

SPACE_XXS = 4
SPACE_XS = 8
SPACE_SM = 12
SPACE_MD = 16
SPACE_LG = 24
SPACE_XL = 32
SPACE_XXL = 48
SPACE_HUGE = 64

Use consistent spacing everywhere.

====================================================
6. BORDER RADIUS SYSTEM
====================================================

RADIUS_SMALL = 12
RADIUS_MEDIUM = 18
RADIUS_LARGE = 24
RADIUS_XL = 32
RADIUS_PILL = 999

Cards:
24px radius

Buttons:
18px radius

Inputs:
16px radius

====================================================
7. TYPOGRAPHY SYSTEM
====================================================

FONT:
- SF Pro
or
- Inter

H1:
34px
700 weight

H2:
28px
700 weight

H3:
22px
600 weight

TITLE:
18px
600 weight

BODY:
15px
400 weight

CAPTION:
12px
400 weight

TINY:
10px
400 weight

LINE HEIGHT:
1.35

====================================================
8. SHADOW SYSTEM
====================================================

CARD SHADOW:
shadowColor: #000
shadowOpacity: 0.25
shadowRadius: 20
shadowOffset:
 width: 0
 height: 8

Glow:
emerald subtle only

NO aggressive neon.

====================================================
9. GLASSMORPHISM RULES
====================================================

Cards:
background:
rgba(16,23,34,0.82)

border:
1px solid rgba(255,255,255,0.05)

blur:
24px

Use:
- floating feel
- premium depth
- subtle transparency

====================================================
10. ICONOGRAPHY
====================================================

STYLE:
- outline icons only
- minimal
- modern
- thin strokes

ICON SIZE:
22px

STROKE WIDTH:
1.8

NO filled icons.

====================================================
11. TAB BAR SYSTEM
====================================================

Floating bottom navigation.

HEIGHT:
78px

BOTTOM OFFSET:
22px

HORIZONTAL PADDING:
20px

ICON SIZE:
22px

LABEL SIZE:
11px

STYLE:
- floating
- glassmorphism
- emerald active glow
- rounded
- premium shadows

TABS:
1. Home
2. Matches
3. AI
4. Alerts
5. Profile

====================================================
12. SAFE AREA RULES
====================================================

TOP SAFE PADDING:
54px

BOTTOM SAFE PADDING:
22px

Cards must never touch screen edges.

====================================================
13. ANIMATION SYSTEM
====================================================

Use:
- Reanimated
- Moti

Animation durations:

FAST:
180ms

NORMAL:
250ms

SLOW:
420ms

Momentum pulse:
1800ms loop

Card spring:
damping 0.7

Use:
- smooth fades
- floating transitions
- pulse indicators
- loading skeletons
- AI typing animation

NO aggressive motion.

====================================================
14. SPLASH SCREEN
====================================================

BACKGROUND:
- cinematic football stadium
- emerald floodlights
- dark atmosphere
- slight fog
- glowing football

CENTER:
AIRO logo

TEXT:
AIRO
See Football Smarter

BUTTONS:
- Get Started
- Sign In

FEATURES:
- Smart Insights
- Live Momentum
- Advanced Analytics
- Tactical Intelligence

====================================================
15. HOME SCREEN
====================================================

PURPOSE:
AI football feed.

COMPONENTS:
- HomeHeader
- InsightCard
- MomentumCard
- ValueCard

HOME HEADER:
- avatar
- greeting
- notifications
- search

INSIGHT CARD:
HEIGHT:
170px

CONTENT:
- club logos
- AI confidence
- prediction
- AI explanation
- CTA button

Use:
- confidence rings
- emerald highlights
- premium spacing

====================================================
16. MATCHES SCREEN
====================================================

TOP:
- search
- filters
- calendar

TABS:
- Today
- Live
- AI Picks
- Upcoming

MATCH CARD:
HEIGHT:
120px

CONTENT:
- official club logos
- time
- live badge
- confidence %
- favorite button
- momentum line

====================================================
17. MATCH ANALYSIS SCREEN
====================================================

MOST IMPORTANT SCREEN.

TOP:
- logos
- score
- timer
- league

INNER TABS:
- Overview
- AI Insight
- Stats
- Timeline
- Lineups

COMPONENTS:
- ProbabilityRing
- AIInsightBox
- PredictionGrid
- StatsComparison
- FormDisplay

PROBABILITY RING:
SIZE:
140px

Use:
- animated percentages
- smooth transitions

FEATURES:
- Over/Under
- BTTS
- corners
- cards
- first half goal
- H2H
- form analysis

====================================================
18. LIVE MOMENTUM
====================================================

MVP:
visual simulation only.

DO NOT build full Opta-level engine.

Use:
- event-based calculations
- lightweight momentum simulation

GRAPH:
HEIGHT:
240px

COLOR LOGIC:
dominant:
emerald green

weaker:
dark crimson red

====================================================
19. ADVANCED STATS
====================================================

NO ugly tables.

ONLY:
- premium charts
- animated metrics
- elegant bars
- radar chart
- heatmaps

COMPONENTS:
- RadarChart
- Heatmap
- ComparisonBars

====================================================
20. AI CHAT
====================================================

PURPOSE:
Football AI assistant.

LAYOUT:
- chat bubbles
- AI typing
- suggested prompts

IMPORTANT:
Never hallucinate stats.

FLOW:
User question
↓
Football data fetch
↓
Context builder
↓
Safe AI prompt
↓
AI response

SAFE AI RULE:
Never invent:
- scores
- injuries
- statistics
- lineups
- events

If missing:
say:
"Data unavailable."

====================================================
21. ALERTS
====================================================

ALERT TYPES:
- momentum shift
- domination
- goal probability
- late goal risk
- red card danger

MVP:
in-app alerts only.

====================================================
22. FAVORITES
====================================================

FEATURES:
- favorite clubs
- favorite matches
- saved AI picks

====================================================
23. REPORTS
====================================================

MVP:
basic reports only.

====================================================
24. AIRO+
====================================================

NO pricing tables.

NO:
- subscriptions
- discounts
- sales cards

STYLE:
- ultra premium
- minimalist
- Apple-like

BUTTON:
Unlock AIRO+

====================================================
25. PROFILE
====================================================

FEATURES:
- avatar
- notifications
- timezone
- preferences
- theme
- support

====================================================
26. LOADING STATES
====================================================

ALL SCREENS MUST SUPPORT:
- loading
- empty
- stale
- no connection
- error

====================================================
27. DATABASE
====================================================

Use PostgreSQL + Prisma.

TABLES:
- users
- matches
- teams
- fixtures
- predictions
- favorites
- alerts
- ai_history
- reports

====================================================
28. REALTIME STRATEGY
====================================================

MVP:
polling only.

Refresh:
15s
or
30s

Websocket architecture:
skeleton only.

====================================================
29. BACKEND MODULES
====================================================

Create:
- auth.module.ts
- matches.module.ts
- stats.module.ts
- ai.module.ts
- alerts.module.ts
- reports.module.ts

====================================================
30. DEPLOYMENT
====================================================

Everything must run with:

docker-compose up

Create:
- Docker setup
- nginx config
- production env
- VPS deployment guide

====================================================
31. COMPONENT CONTRACTS
====================================================

Example:

<InsightCard
 teamA="Manchester City"
 teamB="Arsenal"
 confidence={78}
 prediction="Over 2.5"
/>

====================================================
32. IMPORTANT FINAL RULE
====================================================

Build the application EXACTLY like the provided designs.

The app must feel:
- premium
- cinematic
- intelligent
- modern
- realtime
- elegant
- addictive

NOT:
- gambling
- betting
- spreadsheet-like
- overly corporate
