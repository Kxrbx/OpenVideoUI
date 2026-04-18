# OpenVideoUI

Local-first creative studio for generating text, images, and videos through OpenRouter.

## Overview

OpenVideoUI is a TypeScript monorepo built around a project-centered workflow:

- `projects` organize creative work
- `renders` track image and video generations
- `text chats` persist multi-turn text conversations
- a background worker handles async video polling and model sync

The app is designed to run locally with Docker and provides a single interface for:

- text chat through OpenRouter chat models
- text-to-image generation
- text-to-video generation
- image-to-video generation on supported models
- model discovery and capability-aware UI
- persistent local asset storage for generated media and uploaded backgrounds

## Features

- Local-first onboarding flow
- OpenRouter-backed text, image, and video generation
- Async video job submission and polling
- Project-centered workspace with persistent history
- Persistent text chat threads
- Persisted render lifecycle with events, input assets, and output assets
- Settings for OpenRouter key, theme palette, display name, and background media
- Local asset storage served through the app
- Redis-backed queue layer for worker scheduling and recovery

## Tech Stack

- `Next.js 15` + `React 19` for the web app
- `TypeScript` across apps and packages
- `Postgres` for users, projects, chats, renders, assets, and events
- `Redis` for queueing and worker coordination
- `Drizzle ORM` + `drizzle-kit` for schema and migrations
- `Docker Compose` for local orchestration
- `OpenRouter API` for models, chat, image generation, and video generation

## Repository Layout

```text
.
â”œâ”€ apps/
â”‚  â”œâ”€ web/         # Next.js app
â”‚  â””â”€ worker/      # background worker for polling and model sync
â”œâ”€ packages/
â”‚  â”œâ”€ database/    # Drizzle schema and query layer
â”‚  â”œâ”€ openrouter/  # OpenRouter client and types
â”‚  â”œâ”€ queue/       # Redis-backed queue helpers
â”‚  â”œâ”€ shared/      # shared runtime env and utilities
â”‚  â””â”€ storage/     # local asset storage abstraction
â”œâ”€ drizzle/        # generated SQL migrations
â”œâ”€ docker-compose.yml
â””â”€ .env.example
```

## Prerequisites

- `Docker Desktop`
- `Node.js 24+`
- `npm`
- an `OpenRouter` API key

## Environment

Copy the example file and fill in the values you need:

```powershell
Copy-Item .env.example .env
```

Important variables:

```env
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_HTTP_REFERER=http://localhost:3000
OPENROUTER_TITLE=OpenVideoUI

DATABASE_URL=postgresql://studio:studio@postgres:5432/studio
REDIS_URL=redis://redis:6379

ASSET_STORAGE_DIR=.data/assets
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_COOKIE_NAME=openvideoui_session
```

## Quick Start

### 1. Install dependencies

```powershell
npm install
```

### 2. Start infrastructure

```powershell
docker compose up -d postgres redis
```

### 3. Run database migrations

```powershell
npm run db:migrate
```

### 4. Seed the local database

```powershell
npm run db:seed
```

### 5. Start the app and worker

```powershell
docker compose up -d --build web worker
```

Open the app at:

```text
http://localhost:3000
```

## Local Development

Run the web app outside Docker:

```powershell
npm run dev:web
```

Run the worker outside Docker:

```powershell
npm run dev:worker
```

Sync model capabilities manually:

```powershell
npm run sync:models
```

Build the web app:

```powershell
npm run build:web
```

Run type checks:

```powershell
npm run typecheck
```

Generate migrations after schema changes:

```powershell
npm run db:generate
```

## How the App Works

### Web app

The Next.js app handles:

- onboarding and local session bootstrap
- project and chat UI
- settings, backgrounds, and theme palettes
- text, image, and video submission routes
- serving stored local assets

### Worker

The worker is responsible for:

- syncing model capabilities from OpenRouter
- polling async video jobs
- updating render status and lifecycle events
- coordinating scheduled work through Redis

### Persistence

Postgres stores:

- users and sessions
- projects
- text chats
- renders
- render input assets
- render output assets
- render events
- model capability snapshots

Local asset storage stores:

- uploaded background videos
- reference images
- generated images
- downloaded generated videos

## Usage Notes

- The app is local-first. Remote-access auth is not the primary path.
- Image-to-video is capability-gated and only available for models that support it.
- Text chats are persisted separately from image/video renders.
- Generated assets are served through the app rather than depending on raw provider URLs.

## Troubleshooting

### Docker builds but a package is still reported as missing

If Docker is using stale workspace dependency volumes, reset only the app dependency volumes:

```powershell
docker compose rm -sf web worker
docker volume rm openvideoui_web_node_modules openvideoui_worker_node_modules
docker compose up -d --build web worker
```

### Database commands fail from local PowerShell

The default `DATABASE_URL` in `.env` targets the Docker hostname `postgres`, which is correct for containers. If you run DB commands directly from the host shell, use a host-accessible connection string such as:

```env
DATABASE_URL=postgresql://studio:studio@localhost:5432/studio
```

### Next.js build or typecheck intermittently fails on Windows

There is an existing intermittent Windows `.next` cache/rename race in local runs. Re-running the command usually succeeds.

## Development Notes

- This repo currently has no dedicated test suite.
- The main verification commands are:
  - `npm run build:web`
  - `npm run typecheck`
  - `npm run db:migrate`
- SQL migrations are generated into [`drizzle/`](./drizzle).

## License

No license file is currently present in this repository.
