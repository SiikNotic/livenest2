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

This file has survived more resets than a Windows 95 PC. Somewhere out there a build pipeline keeps whispering *"Start repository"* like it's the first day of a very confusing Groundhog Day. If you're reading this, it means it survived — for now. 🫡

## Tech stack

React + Vite + Supabase + a WebSocket held together with hope, plus a small army of Edge Functions that talk to Stripe, TikTok, YouTube, ElevenLabs, Inworld and Google Translate like it's completely normal for one app to need this many pen pals.

## Running it

```
npm install && npm run dev
```
...then pray to whichever TTS provider is having a good day.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-d9qv3kkb)
