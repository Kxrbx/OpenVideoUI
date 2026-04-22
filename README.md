# OpenVideoUI

A local-first creative studio for generating text, images, and videos through [OpenRouter](https://openrouter.ai/).


https://github.com/user-attachments/assets/935922ff-9cf6-4fa9-82ed-7ea76ba7feba


## Overview

OpenVideoUI is a TypeScript monorepo designed around a project-centered workflow:

- **Projects** — organize creative work into dedicated workspaces
- **Renders** — track image and video generation jobs with full lifecycle events
- **Text Chats** — persist multi-turn conversations with AI models
- **Background Worker** — handles async video polling and model capability syncing

The application runs locally via Docker and provides a unified interface for:

- Text generation through OpenRouter chat models
- Text-to-image generation
- Text-to-video generation
- Image-to-video generation (on supported models)
- Model discovery with capability-aware UI
- Persistent local storage for generated media and uploaded assets

## Features

- Local-first onboarding with zero external dependencies
- OpenRouter-backed text, image, and video generation
- Async job submission with real-time polling
- Project-centered workspace with persistent history
- Persistent text chat threads with full conversation history
- Complete render lifecycle tracking (events, input/output assets)
- Configurable settings: OpenRouter API key, theme palette, display name, background media
- Local asset storage served through the application
- Redis-backed queue layer for worker scheduling and recovery

## Tech Stack

| Component | Technology |
|-----------|------------|
| Web Framework | Next.js 15.3.0 + React 19.1.0 |
| Language | TypeScript 5.8.3 |
| Database | PostgreSQL 16 |
| Cache & Queue | Redis 7 |
| ORM | Drizzle ORM 0.44.2 + Drizzle Kit 0.31.4 |
| Container Orchestration | Docker Compose |
| AI Gateway | OpenRouter API |

## Repository Layout

```
.
├── apps/
│   ├── web/         # Next.js web application
│   └── worker/      # Background worker for polling and model sync
├── packages/
│   ├── database/    # Drizzle schema and query layer
│   ├── openrouter/  # OpenRouter client and type definitions
│   ├── queue/       # Redis-backed queue utilities
│   ├── shared/      # Shared runtime environment and utilities
│   └── storage/     # Local asset storage abstraction
├── drizzle/         # Generated SQL migrations
├── docker-compose.yml
└── .env.example
```

## Prerequisites

- Docker Desktop
- Node.js 24+
- npm
- OpenRouter API key ([get one free](https://openrouter.ai/))

## Environment Setup

### 1. Copy the example environment file

```powershell
Copy-Item .env.example .env
```

### 2. Configure required variables

Edit `.env` and set your OpenRouter API key:

```env
OPENROUTER_API_KEY=your_api_key_here
```

### 3. Full environment reference

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key | *(required)* |
| `OPENROUTER_BASE_URL` | OpenRouter API endpoint | `https://openrouter.ai/api/v1` |
| `OPENROUTER_HTTP_REFERER` | Referer header used by OpenRouter app attribution | `https://github.com/Kxrbx/OpenVideoUI` |
| `OPENROUTER_TITLE` | App name for API requests | `OpenVideoUI` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://studio:studio@postgres:5432/studio` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `ASSET_STORAGE_DIR` | Local asset storage directory | `.data/assets` |
| `NEXT_PUBLIC_APP_URL` | Public application URL | `http://localhost:3000` |
| `SESSION_COOKIE_NAME` | Session cookie name | `openvideoui_session` |

## Quick Start

### 1. Install dependencies

```powershell
npm install
```

### 2. Start infrastructure services

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

### 5. Start the application

```powershell
docker compose up -d --build web worker
```

### 6. Access the application

Open your browser to: **http://localhost:3000**

## Local Development

### Running with Hot Reload

Run the web application:

```powershell
npm run dev:web
```

Run the background worker:

```powershell
npm run dev:worker
```

### Database Operations

Generate migrations after schema changes:

```powershell
npm run db:generate
```

Apply pending migrations:

```powershell
npm run db:migrate
```

Seed the database:

```powershell
npm run db:seed
```

### Model Synchronization

Manually sync model capabilities from OpenRouter:

```powershell
npm run sync:models
```

### Build and Verification

Build the web application:

```powershell
npm run build:web
```

Run type checks across all workspaces:

```powershell
npm run typecheck
```

## Architecture

### Web Application

The Next.js web application handles:

- Onboarding and local session bootstrap
- Project and chat management UI
- Settings, backgrounds, and theme customization
- Text, image, and video submission API routes
- Serving stored local assets

### Background Worker

The worker process is responsible for:

- Syncing model capabilities from OpenRouter
- Polling async video generation jobs
- Updating render status and lifecycle events
- Coordinating scheduled work through Redis

### Data Persistence

**PostgreSQL** stores:

- Users and sessions
- Projects and project metadata
- Text chat threads and messages
- Renders and job state
- Render input/output asset references
- Render lifecycle events
- Model capability snapshots

**Local File Storage** stores:

- Uploaded background videos
- Reference images
- Generated images
- Downloaded generated videos

## Usage Notes

- **Local-first design**: The application is designed to run locally. Remote authentication is not the primary path.
- **Capability-gated features**: Image-to-video generation is only available for models that support it.
- **Separated concerns**: Text chats are persisted separately from image/video renders.
- **Asset serving**: Generated assets are served through the application rather than depending on raw provider URLs.

## Troubleshooting

### Docker reports missing packages after build

If Docker is using stale workspace dependency volumes, reset only the affected service volumes:

```powershell
docker compose rm -sf web worker
docker volume rm openvideoui_web_node_modules openvideoui_worker_node_modules
docker compose up -d --build web worker
```

### Database commands fail from local shell

The default `DATABASE_URL` in `.env` targets the Docker hostname `postgres`, which is correct for containers. If running database commands directly from the host shell, use a host-accessible connection string:

```env
DATABASE_URL=postgresql://studio:studio@localhost:5432/studio
```

### Next.js build or typecheck intermittently fails on Windows

There is an occasional Windows `.next` cache rename race in local development. Re-running the command usually succeeds.

### Worker not processing jobs

Verify Redis is running and accessible:

```powershell
docker compose ps
docker compose logs worker
```

Check that the Redis connection is successful in the worker logs.

### Assets not loading

Ensure the `ASSET_STORAGE_DIR` exists and has correct permissions:

```powershell
New-Item -ItemType Directory -Force -Path .data/assets
```

## Development Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run dev:web` | Start web app with hot reload |
| `npm run dev:worker` | Start worker with hot reload |
| `npm run sync:models` | Sync model capabilities |
| `npm run build:web` | Production build |
| `npm run typecheck` | Type check all packages |
| `npm run db:generate` | Generate new migrations |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed database |

## License

This project is for personal and educational use. No license file is currently included.
