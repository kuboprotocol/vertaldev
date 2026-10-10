# KUBO Vibe Game Management System - Complete Documentation

## Overview

The KUBO Vibe Game Management System is a complete end-to-end solution for creating, managing, and deploying games in the KUBO Vibe ecosystem. It provides a secure, scalable, and user-friendly interface for game developers to manage their game projects.

**Status**: ✅ Production Ready  
**Last Updated**: 2026-10-10

---

## Architecture

### High-Level Flow

```
User Interface (GameManager Component)
    ↓
React State Management (useGames Hook)
    ↓
Service Layer (gameService)
    ↓
Supabase Client (HTTP/WebSocket)
    ↓
PostgreSQL Database (with RLS)
    ↓
Row-Level Security Policies
    ↓
User-Isolated Data Storage
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript | UI and state management |
| **Styling** | Tailwind CSS + shadcn/ui | Premium dark-mode design |
| **State** | React Hooks + React Query | Local and server state |
| **API** | Supabase JavaScript Client | Database operations |
| **Database** | PostgreSQL (Supabase) | Secure data persistence |
| **Security** | Row-Level Security (RLS) | User data isolation |
| **Notifications** | Sonner Toast | User feedback |

---

## Database Schema

### Games Table (Core)

```sql
CREATE TABLE public.games (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  cover_image_url  text,
  game_type        text NOT NULL CHECK (game_type IN ('2d', '3d', 'retro', 'realistic', 'metaverse', '4d')),
  engine           text NOT NULL CHECK (engine IN ('babylon', 'threejs', 'playcanvas', 'pixijs', 'phaser', 'custom')),
  config           jsonb DEFAULT '{}'::jsonb,
  assets_count     integer DEFAULT 0,
  meshes_count     integer DEFAULT 0,
  textures_count   integer DEFAULT 0,
  animations_count integer DEFAULT 0,
  scripts_count    integer DEFAULT 0,
  status           text DEFAULT 'draft',
  is_multiplayer   boolean DEFAULT false,
  has_ai           boolean DEFAULT false,
  has_monetization boolean DEFAULT false,
  monetization_type text,
  published_url    text,
  embed_code       text,
  plays            bigint DEFAULT 0,
  likes            bigint DEFAULT 0,
  rating           float DEFAULT 0.0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  published_at     timestamptz
);
```

### Related Tables

1. **game_scenes** (12 columns) - Scene management
   - `id`, `game_id`, `user_id`, `name`, `description`
   - `scene_data` (JSONB), `thumbnail_url`, `environment`
   - Physics configuration: `physics_enabled`, `physics_type`
   - Performance metrics: `draw_calls`, `polygon_count`

2. **game_assets** (9 columns) - Asset management
   - `id`, `game_id`, `user_id`, `name`, `asset_type`
   - `file_url`, `file_size`, `mime_type`
   - `tags` (array), `metadata` (JSONB), `usage_count`

3. **game_entities** (11 columns) - Entity/object system
   - `id`, `scene_id`, `game_id`, `name`, `entity_type`
   - Position/rotation/scale (JSONB each)
   - `mesh_asset_id`, `components`, `parent_entity_id`

4. **game_scripts** (9 columns) - Code management
   - `id`, `game_id`, `user_id`, `name`, `description`
   - `language`, `source_code`, `version`, `is_builtin`

5. **game_builds** (9 columns) - Build artifacts
   - `id`, `game_id`, `user_id`, `version`, `build_status`
   - `bundle_url`, `bundle_size`, `target_platform`
   - Timing: `created_at`, `started_at`, `completed_at`

### Indexes

Performance-critical indexes on all tables:

```sql
-- Games table
CREATE INDEX games_user_id_idx ON public.games(user_id);
CREATE INDEX games_game_type_idx ON public.games(game_type);
CREATE INDEX games_status_idx ON public.games(status);
CREATE INDEX games_created_at_idx ON public.games(created_at DESC);

-- Similar indexes on all related tables for user_id, type/status, and created_at
```

### Row-Level Security (RLS)

All tables are protected with RLS policies ensuring:

- **SELECT**: Users can only view their own games (and related entities)
- **INSERT**: Users can only create games/entities for their own user_id
- **UPDATE**: Users can only modify their own games/entities
- **DELETE**: Users can only delete their own games/entities

```sql
-- Example: Games SELECT policy
CREATE POLICY "Users can view own games"
  ON public.games FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

### Storage Buckets

Three private storage buckets (authenticated users only):

1. **creative-assets** - Creative resources
2. **videos** - Video files
3. **game-assets** - Game-specific assets

Each bucket enforces folder-level isolation: `/user_id/...`

---

## Service Layer (`src/services/gameService.ts`)

The service layer provides a clean API for all database operations.

### Create Operation

```typescript
async createGame(data: GameInsert)
```

**Parameters**:
- `data`: Game insertion data with title, description, game_type, engine

**Returns**: `Game` object with generated UUID

**Example**:
```typescript
const newGame = await gameService.createGame({
  title: 'My 3D Game',
  description: 'An awesome 3D adventure',
  game_type: '3d',
  engine: 'babylon',
  user_id: userId
});
```

### Read Operations

#### List Games (with pagination)
```typescript
async listGames(userId: string, limit = 50, offset = 0)
```

**Returns**: `{ games: Game[], total: number }`

#### Get Single Game
```typescript
async getGame(gameId: string)
```

**Returns**: Single `Game` object

### Update Operation

```typescript
async updateGame(gameId: string, data: GameUpdate)
```

**Parameters**:
- `data`: Partial update data (any game fields)

**Returns**: Updated `Game` object

**Example**:
```typescript
const updated = await gameService.updateGame(gameId, {
  title: 'Updated Title',
  status: 'published'
});
```

### Delete Operation

```typescript
async deleteGame(gameId: string)
```

Deletes game and cascades to all related entities via foreign key constraints.

### Batch Operations

#### Search Games
```typescript
async searchGames(userId: string, query: string)
```

Full-text search on `title` and `description` fields using PostgreSQL `ilike`.

#### Filter by Type
```typescript
async getGamesByType(userId: string, gameType: string)
```

Returns all games of specified type (2d, 3d, retro, etc.).

#### Publish Game
```typescript
async publishGame(gameId: string, publishedUrl: string)
```

Transitions game to "published" status and sets published URL with timestamp.

---

## React Hook (`src/hooks/useGames.ts`)

Custom React hook for managing game state and operations.

### Hook Signature

```typescript
function useGames(pageSize = 12)
```

### State

```typescript
interface UseGamesState {
  games: Game[];           // Current page of games
  loading: boolean;        // Loading flag for all operations
  error: string | null;    // Error message
  total: number;           // Total games in database
  currentPage: number;     // Current pagination page
}
```

### Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `loadGames` | `(page: number) => Promise<void>` | Load games for specific page |
| `createGame` | `(data: GameInsert) => Promise<Game>` | Create new game |
| `updateGame` | `(id: string, data: GameUpdate) => Promise<Game>` | Update existing game |
| `deleteGame` | `(id: string) => Promise<void>` | Delete game |
| `searchGames` | `(query: string) => Promise<void>` | Search games by title/description |
| `getGamesByType` | `(type: string) => Promise<void>` | Filter by game type |
| `publishGame` | `(id: string, url: string) => Promise<Game>` | Publish game |
| `nextPage` | `() => Promise<void>` | Go to next page |
| `prevPage` | `() => Promise<void>` | Go to previous page |

### Computed Values

```typescript
totalPages: number  // Math.ceil(total / pageSize)
```

### Usage Example

```typescript
export function MyComponent() {
  const {
    games,
    loading,
    error,
    currentPage,
    totalPages,
    createGame,
    updateGame,
    deleteGame,
    nextPage,
    prevPage
  } = useGames(12);

  // Auto-loads games on mount if user is authenticated
  // State updates automatically with loading/error handling
}
```

### Auto-Loading

The hook automatically loads the first page of games when:
1. Component mounts
2. User authenticates (via `useAuth` hook)

---

## UI Component (`src/components/GameManager.tsx`)

Premium dark-mode component for game management with full CRUD functionality.

### Features

#### 1. Game List Display
- Grid layout (1/2/3 columns responsive)
- Card-based design with:
  - Cover image
  - Title and description
  - Game type badge (colored)
  - Engine badge
  - Status badge
  - Play/Like/Rating stats

#### 2. Create Game
- "New Game" button opens form modal
- Fields:
  - Title (required)
  - Description (optional)
  - Game Type (required dropdown)
  - Engine (required dropdown)
  - Cover Image URL (optional)
- Form validation
- Loading state during submission

#### 3. Edit Game
- Click "Edit" button on any game
- Form pre-fills with current game data
- Submit updates the game
- Form closes on success

#### 4. Delete Game
- Click "Delete" button
- Confirmation dialog appears
- Click "Confirm" to delete
- Auto-cancels confirmation after 3 seconds

#### 5. Search Games
- Real-time search input
- Searches title and description
- Resets pagination to page 1

#### 6. Filter by Type
- Dropdown filter for game types
- "All Types" shows all games
- Specific type shows only that game type

#### 7. Pagination
- Displays games 12 per page
- Previous/Next buttons
- Current page indicator

### Component Props

None required - component is self-contained with `useGames` hook.

### Usage

```typescript
import { GameManager } from '@/components/GameManager';

export function MyPage() {
  return <GameManager />;
}
```

### Styling

- **Background**: Gradient (slate-900 to slate-800)
- **Cards**: slate-800 with slate-700 borders
- **Text**: White text with slate-400 secondary
- **Buttons**: Gradient blues, greens, reds
- **Status Indicators**: Color-coded badges per type
- **Responsive**: Mobile-first with breakpoints

---

## Routing

### Route Configuration

```typescript
// In src/App.tsx
const GameManagerPage = lazy(() => import("./pages/GameManagerPage"));

<Route 
  path="/games" 
  element={<ProtectedRoute><GameManagerPage /></ProtectedRoute>} 
/>
```

### Access

- **URL**: `http://localhost:8080/games`
- **Protection**: ProtectedRoute (requires authentication)
- **Lazy Loading**: Page loads on-demand for performance

---

## Type Safety

### TypeScript Types

All types auto-generated from Supabase database schema via `supabase gen types`.

```typescript
// From src/types/database.ts

type Game = Database['public']['Tables']['games']['Row'];
type GameInsert = Database['public']['Tables']['games']['Insert'];
type GameUpdate = Database['public']['Tables']['games']['Update'];

// Union types for constraints
type GameType = '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d';
type Engine = 'babylon' | 'threejs' | 'playcanvas' | 'pixijs' | 'phaser' | 'custom';
```

---

## Error Handling

### Service Layer

All service methods throw descriptive errors:

```typescript
if (error) throw new Error(`Failed to create game: ${error.message}`);
```

### Hook Layer

Hook wraps errors and stores in state:

```typescript
const errorMsg = error instanceof Error ? error.message : "Failed to load games";
setState(prev => ({ ...prev, error: errorMsg, loading: false }));
```

### UI Layer

Component displays errors with toast notifications:

```typescript
catch (err) {
  const message = err instanceof Error ? err.message : 'Failed to save game';
  toast.error(message);
}
```

---

## Data Flow Example

### Creating a New Game

1. **User Action**: Clicks "New Game" button
2. **UI**: Form opens with empty fields
3. **User Input**: Fills form (title: "My Game", type: "3d", engine: "babylon")
4. **User Action**: Clicks "Create Game"
5. **Component**: Sets `submitting = true`
6. **Hook**: Calls `createGame(data)`
7. **Service**: Calls `supabase.from('games').insert([data]).select().single()`
8. **Database**: 
   - Validates game_type and engine constraints
   - Checks RLS policy: `auth.uid() = user_id`
   - Inserts new row with generated UUID
   - Returns new game object
9. **Service**: Returns typed `Game` object
10. **Hook**: Updates state with new game, sets `loading = false`
11. **Component**: Shows toast "Game created successfully"
12. **UI**: Form closes, game appears in list

---

## Security Features

### Row-Level Security (RLS)

✅ **User Data Isolation**
- Users can ONLY access their own games
- Database enforces at query level
- No data leakage possible

✅ **Policy Example**
```sql
CREATE POLICY "Users can view own games"
  ON public.games FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

### Authentication

✅ **Protected Routes**
- All game routes require `ProtectedRoute`
- Redirects unauthenticated users to `/auth`
- Session token validated by Supabase

✅ **User Context**
- Hook uses `useAuth()` to get current user
- Passes `user_id` to all operations
- User cannot specify other user_id

### Input Validation

✅ **Database Constraints**
```sql
CHECK (game_type IN ('2d', '3d', 'retro', 'realistic', 'metaverse', '4d'))
CHECK (engine IN ('babylon', 'threejs', 'playcanvas', 'pixijs', 'phaser', 'custom'))
```

✅ **Component Validation**
- Required fields enforced in forms
- Dropdown menus prevent invalid selections
- URL validation for cover images

---

## Performance Optimization

### Database Indexes

```sql
CREATE INDEX games_user_id_idx ON public.games(user_id);
CREATE INDEX games_created_at_idx ON public.games(created_at DESC);
```

✅ Fast user lookups
✅ Fast date-based sorting
✅ Efficient pagination

### Pagination

✅ 12 games per page (limit = 12)
✅ Only fetches required page
✅ Total count calculated once
✅ No N+1 queries

### Lazy Loading

✅ Components lazy-loaded via `React.lazy()`
✅ Page loads on-demand
✅ Suspense fallback shows loader

---

## Testing Checklist

### Unit Tests (Service Layer)

- [ ] `createGame` creates with correct user_id
- [ ] `listGames` returns paginated results
- [ ] `updateGame` updates specific fields
- [ ] `deleteGame` removes game
- [ ] `searchGames` finds by title/description
- [ ] `getGamesByType` filters correctly
- [ ] `publishGame` sets status and timestamp

### Integration Tests (Hook)

- [ ] `useGames` loads games on mount
- [ ] State updates on create/update/delete
- [ ] Error handling shows error messages
- [ ] Pagination works (next/prev)
- [ ] Search resets pagination

### E2E Tests (UI)

- [ ] User can create new game
- [ ] User can edit game
- [ ] User can delete game (with confirmation)
- [ ] User can search games
- [ ] User can filter by type
- [ ] User can paginate

---

## Future Enhancements

### Phase 2: Advanced Features

1. **Asset Management**
   - Upload game assets (images, models, audio)
   - Asset tagging and organization
   - Asset usage tracking

2. **Scene Editor**
   - Visual scene builder
   - Entity component system UI
   - Physics configuration panel

3. **Build System**
   - Game compilation/bundling
   - Multi-platform builds (Web, Mobile, Desktop)
   - Build history and versioning

4. **Collaboration**
   - Share games with team members
   - Permission levels (viewer, editor, owner)
   - Real-time collaboration UI

5. **Monetization**
   - Monetization configuration
   - Revenue tracking
   - In-game item creation

6. **Analytics**
   - Play count tracking
   - Player engagement metrics
   - Revenue analytics

7. **Publishing**
   - Direct publishing to KUBO Vibe Store
   - Social sharing
   - Download management

---

## Deployment Checklist

### Prerequisites
- [ ] Supabase project created
- [ ] Database migrations applied
- [ ] Auth configured (email/password or OAuth)
- [ ] Storage buckets created
- [ ] RLS policies enabled

### Environment Variables
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Build
```bash
npm run build
```

### Deploy
```bash
npm run deploy
# or
vercel deploy
```

### Verify
- [ ] `/games` route loads
- [ ] Games list displays
- [ ] Can create new game
- [ ] Can edit game
- [ ] Can delete game
- [ ] Search works
- [ ] Filter works
- [ ] Pagination works

---

## Troubleshooting

### Games Not Loading

**Symptom**: Games list empty despite having created games

**Solutions**:
1. Check browser console for errors
2. Verify user is authenticated (`useAuth` returns user)
3. Check Supabase RLS policies are enabled
4. Verify user_id matches in database

### Create/Update Fails

**Symptom**: Form submits but nothing happens

**Solutions**:
1. Check toast notification for error message
2. Verify form fields are valid (type/engine must be in enum)
3. Check Supabase is connected
4. Verify user has CREATE permission

### Search Not Working

**Symptom**: Search returns no results

**Solutions**:
1. Verify game title/description contains search term
2. Check case sensitivity (searches are case-insensitive)
3. Try simpler search term
4. Check pagination (results might be on different page)

### Performance Issues

**Symptom**: Page loads slowly

**Solutions**:
1. Check database indexes are created
2. Verify pagination limit (default 12)
3. Check network tab for slow API calls
4. Verify cover images are optimized

---

## Code References

### Files
- **Database**: `supabase/migrations/20261010055136_*.sql`
- **Types**: `src/types/database.ts`
- **Service**: `src/services/gameService.ts`
- **Hook**: `src/hooks/useGames.ts`
- **Component**: `src/components/GameManager.tsx`
- **Page**: `src/pages/GameManagerPage.tsx`
- **Router**: `src/App.tsx`

### Git Commits
- Migration: `3e94a92a` - Add game tables migration with secure RLS policies
- Types: `5b258e42` - Add TypeScript database types for game tables
- Service & Hook: `ba4689a3` - Add game CRUD service layer and state management hook
- Component & UI: `2bdc0202` - Add GameManager component with full CRUD UI

---

## Quick Reference

### Create a Game
```typescript
const game = await gameService.createGame({
  title: 'My Game',
  description: 'Game description',
  game_type: '3d',
  engine: 'babylon'
});
```

### List Games
```typescript
const { games, total } = await gameService.listGames(userId, 12, 0);
```

### Update a Game
```typescript
const updated = await gameService.updateGame(gameId, {
  title: 'New Title',
  status: 'published'
});
```

### Delete a Game
```typescript
await gameService.deleteGame(gameId);
```

### Search Games
```typescript
const results = await gameService.searchGames(userId, 'query');
```

### Filter by Type
```typescript
const games = await gameService.getGamesByType(userId, '3d');
```

---

## Support & Contribution

For issues, feature requests, or contributions:

1. Check existing documentation
2. Review error messages and logs
3. Check Supabase status page
4. Review database structure
5. Test in development first

---

**Document Version**: 1.0  
**Last Updated**: 2026-10-10  
**Status**: ✅ Production Ready

For more information, see:
- [Supabase Docs](https://supabase.com/docs)
- [React Hooks Guide](https://react.dev/reference/react/hooks)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
