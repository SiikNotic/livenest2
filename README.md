# LiveNest 🐣💬

*The app that reads your TikTok chat out loud so you don't have to squint at your phone while dancing for four hours straight.*

> ⚠️ **Warning:** this app has read more messages than your ex, and unlike them, it actually responds.

## What is this?

LiveNest connects to your TikTok Live, reads the chat aloud, announces gifts and follows, plays songs your viewers request, and generally does the multitasking your one brain physically cannot during a live.

## Features

- 🗣️ Text-to-speech that survived Microsoft randomly revoking Edge TTS's secret handshake mid-stream
- 🎁 Gift & follower alerts, so you know exactly when to say "gracias mi rey"
- 🎵 Chat-requested songs via `!song`, powered by the sacred YouTube search gods
- 📸 Real profile pictures on saved channels — no more mystery-colored initials
- 🔐 A security review so thorough it found an API key that had been napping in plain text since the beginning of time

## A brief, true history of this README

This file has survived more resets than a Windows 95 PC. Somewhere out there a build pipeline kept whispering *"Start repository"* like it was the first day of a very confusing Groundhog Day — until this repo finally moved out and got its own place (GitHub Pages, no landlord). If you're reading this, it means it survived — for now. 🫡

## Tech stack

React + Vite + Supabase + a WebSocket held together with hope, plus a small army of Edge Functions that talk to Stripe, TikTok, YouTube, ElevenLabs, Inworld and Google Translate like it's completely normal for one app to need this many pen pals.

## Running it

```
npm install && npm run dev
```
...then pray to whichever TTS provider is having a good day.

## Deploying

Every push to `main` builds and publishes the app to GitHub Pages via `.github/workflows/deploy-pages.yml` — no third-party build service in the loop anymore. See that workflow for the two repo variables it needs (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
