# AIRO Implementation Backlog

This file turns the final AIRO spec into a practical build and migration plan.

## Product freeze

AIRO stays:
- premium
- pre-match only
- editorial
- AI-curated

AIRO does not chase:
- live score behavior
- live momentum
- push/live alerts in MVP
- pixel-perfect iPhone shell behavior inside PWA

## What the PWA is for

The current PWA is the working product prototype for:
- branding
- copy
- information hierarchy
- match card layout
- analysis logic
- data shaping
- screen structure

The PWA is not the final place to perfect:
- iPhone safe-area handling
- bottom dock positioning
- keyboard-native chat behavior
- premium navigation transitions
- App Store-grade tab interactions

## Tab-by-tab validation

### Home

Validate in PWA:
- [x] AIRO branding
- [x] Home headline direction
- [x] Top curated matches concept
- [x] Compact right-side prediction block
- [x] Confidence bars instead of donuts
- [x] Real club logos on cards
- [ ] Final card density and spacing

Finish in native:
- [ ] Final bottom dock relationship with viewport
- [ ] Final icon active states
- [ ] Final typography rhythm
- [ ] Final touch/press states

### Matches

Validate in PWA:
- [x] Screen structure
- [x] Search / Filters / Calendar placement
- [x] Today / Tomorrow / Weekend / Top Picks filter model
- [x] Compact match card structure
- [ ] Remove non-essential snapshot/debug feeling

Finish in native:
- [ ] Final filter pills polish
- [ ] Final card spacing / density
- [ ] Native-feeling navigation into Analysis

### Analysis

Validate in PWA:
- [x] Screen exists
- [x] Tab structure exists
- [x] AI verdict concept
- [x] Confidence ring concept
- [ ] Hero composition closer to final mockup
- [ ] Predictions / Team Form / H2H density

Finish in native:
- [ ] Final hero layout
- [ ] Final tab interaction polish
- [ ] Final card density and spacing

### AI Chat

Validate in PWA:
- [x] Fullscreen tab exists
- [x] Prompt-driven assistant concept exists
- [x] AI-first positioning is clear

Finish in native:
- [ ] Keyboard behavior
- [ ] Chat composer polish
- [ ] Suggested prompts / empty-state polish
- [ ] Better transitions and input UX

### Profile

Validate in PWA:
- [x] Settings structure exists
- [x] Language selection exists
- [x] Favorites surfaced
- [x] Account / Privacy / Support skeleton

Finish in native:
- [ ] Premium profile polish
- [ ] Remove prototype-only controls once native update flow exists

## MVP build scope

### Must Have
- [x] AIRO branding in current shell
- [x] Dark cinematic palette applied
- [x] Safe-area aware top header
- [x] Home shell
- [x] Matches shell
- [x] Match Analysis shell
- [x] AI Chat shell
- [x] Profile shell
- [x] Favorites surfaced in Profile
- [x] Empty state support
- [x] Stale snapshot messaging
- [ ] Loading state on all screens
- [ ] Error / no connection states

### Data layer
- [ ] Provider abstraction folder
- [ ] Primary free provider selection
- [ ] Fallback provider selection
- [ ] Normalization contracts
- [ ] Cache strategy

### Product behavior
- [ ] Favorites persisted in storage
- [ ] Search for clubs and leagues polished
- [ ] AI prompts contextual per selected match

## Native migration scope

### Expo shell
- [ ] React Native Expo bootstrap
- [ ] Expo Router navigation
- [ ] Native bottom tabs
- [ ] SafeAreaContext integration
- [ ] Zustand store
- [ ] Reanimated / Moti motion system

### Port from PWA
- [ ] Port `zbet-engine` logic to TypeScript
- [ ] Port logo mapping layer
- [ ] Port curated Home feed logic
- [ ] Port Analysis data model
- [ ] Port AI Chat prompt layer

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

1. Freeze PWA as product reference, not endless visual battleground.
2. Validate each tab structurally in PWA.
3. Replace temporary data flows with provider-backed data.
4. Start Expo native shell for final iPhone-quality experience.
