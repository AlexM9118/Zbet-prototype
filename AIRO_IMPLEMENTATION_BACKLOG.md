# AIRO Implementation Backlog

This file turns the final AIRO spec into an execution backlog for the MVP.

## Must Have

### Product shell
- [x] AIRO branding in current PWA shell
- [x] Dark cinematic palette applied
- [ ] Five-tab attached bottom navigation
- [x] Safe-area aware top header
- [ ] Floating glass tab bar matched 1:1 with final design

### MVP screens
- [ ] Splash screen
- [x] Home screen shell
- [x] Matches screen shell
- [x] Match Analysis shell
- [x] AI Chat shell
- [x] Profile shell
- [x] Favorites surfaced in Profile

### Match Analysis
- [x] Overview tab
- [x] AI Insight tab
- [x] Stats tab
- [x] Timeline tab
- [x] Lineups tab placeholder
- [ ] Probability ring component
- [ ] Prediction grid closer to final mockup

### UX states
- [ ] Loading state on all screens
- [x] Empty state support
- [x] Stale snapshot messaging
- [ ] No connection state
- [ ] Error state

### Data layer
- [ ] Provider abstraction folder
- [ ] Primary free provider selection
- [ ] Fallback provider selection
- [ ] Normalization contracts
- [ ] Cache strategy

## Should Have

### Visual fidelity
- [ ] Club logos from real source or mapped local pack
- [ ] Home cards aligned 1:1 with final AIRO mockup
- [ ] Matches cards aligned 1:1 with final AIRO mockup
- [ ] Match Analysis hero aligned 1:1 with final AIRO mockup
- [ ] Outline icon system replacing temporary glyphs

### Product behavior
- [ ] Favorites persisted in storage
- [ ] Search for clubs and leagues polished
- [ ] AI prompts contextual per selected match

### Partial screens
- [ ] Legacy live and alerts references removed from current PWA
- [ ] Advanced Stats visual-only MVP screen
- [ ] Reports basic MVP screen
- [ ] AIRO+ visual MVP screen

## Later

### Native app rebuild
- [ ] React Native Expo mobile app bootstrap
- [ ] Navigation architecture in RN
- [ ] Zustand store
- [ ] Reanimated / Moti motion system

### Backend
- [ ] NestJS bootstrap
- [ ] Prisma schema
- [ ] Auth module
- [ ] Matches module
- [ ] Stats module
- [ ] AI module
- [ ] Reports module

### Infrastructure
- [ ] Docker and docker-compose
- [ ] nginx config
- [ ] Ubuntu VPS deployment guide

## Current priority

1. Make the current phone PWA visually match the AIRO final prompt more closely.
2. Lock the MVP screen architecture.
3. Replace temporary assets and placeholders with stable provider-backed data.
4. Start RN/NestJS production architecture once the shell is accepted visually.
