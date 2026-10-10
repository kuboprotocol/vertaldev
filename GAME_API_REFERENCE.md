# KUBO Vibe Game Management API Reference

## Service Layer API (`gameService`)

Complete reference for all game service operations.

---

## Create Operations

### `createGame(data: GameInsert): Promise<Game>`

Create a new game in the database.

**Parameters**:
```typescript
interface GameInsert {
  title: string;                    // Game title (required)
  description?: string;             // Game description (optional)
  game_type: '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d';
  engine: 'babylon' | 'threejs' | 'playcanvas' | 'pixijs' | 'phaser' | 'custom';
  cover_image_url?: string;         // URL to cover image (optional)
  config?: Record<string, any>;     // Game configuration (optional)
  user_id: string;                  // UUID of game owner (required)
  status?: string;                  // Default: 'draft'
}
```

**Returns**:
```typescript
interface Game {
  id: string;                       // UUID
  user_id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  game_type: string;
  engine: string;
  config: Record<string, any>;
  assets_count: number;
  meshes_count: number;
  textures_count: number;
  animations_count: number;
  scripts_count: number;
  status: string;
  is_multiplayer: boolean;
  has_ai: boolean;
  has_monetization: boolean;
  monetization_type: string | null;
  published_url: string | null;
  embed_code: string | null;
  plays: number;
  likes: number;
  rating: number;
  created_at: string;               // ISO timestamp
  updated_at: string;               // ISO timestamp
  published_at: string | null;
}
```

**Example**:
```typescript
try {
  const newGame = await gameService.createGame({
    title: '3D Adventure Quest',
    description: 'An epic 3D adventure game',
    game_type: '3d',
    engine: 'babylon',
    cover_image_url: 'https://example.com/cover.jpg',
    user_id: userId
  });
  
  console.log('Created game:', newGame.id);
} catch (error) {
  console.error('Failed to create game:', error.message);
}
```

**Errors**:
- `Failed to create game: {database error message}` - Database operation failed
- Constraint validation fails if game_type or engine not in allowed values

---

## Read Operations

### `listGames(userId: string, limit?: number, offset?: number): Promise<{ games: Game[], total: number }>`

Get paginated list of user's games.

**Parameters**:
- `userId`: UUID of the user
- `limit`: Number of games to return (default: 50)
- `offset`: Number of games to skip for pagination (default: 0)

**Returns**:
```typescript
{
  games: Game[];    // Array of game objects
  total: number;    // Total games for this user
}
```

**Example**:
```typescript
// Get first page (12 games)
const { games, total } = await gameService.listGames(userId, 12, 0);
console.log(`Found ${total} games, showing ${games.length}`);

// Get page 2
const { games: page2 } = await gameService.listGames(userId, 12, 12);

// Get all games at once
const { games: allGames } = await gameService.listGames(userId, 1000, 0);
```

**Errors**:
- `Failed to list games: {database error message}`
- Returns empty array if user has no games

---

### `getGame(gameId: string): Promise<Game>`

Get a single game by ID.

**Parameters**:
- `gameId`: UUID of the game

**Returns**: Single `Game` object

**Example**:
```typescript
const game = await gameService.getGame('550e8400-e29b-41d4-a716-446655440000');
console.log(game.title);
```

**Errors**:
- `Failed to get game: {database error message}`
- Throws if game doesn't exist or user doesn't have access (RLS)

---

## Update Operations

### `updateGame(gameId: string, data: GameUpdate): Promise<Game>`

Update an existing game (partial update).

**Parameters**:
- `gameId`: UUID of the game
- `data`: Partial game update object (any fields except id, user_id)

**GameUpdate Fields**:
```typescript
{
  title?: string;
  description?: string;
  cover_image_url?: string;
  game_type?: string;
  engine?: string;
  config?: Record<string, any>;
  status?: string;
  is_multiplayer?: boolean;
  has_ai?: boolean;
  has_monetization?: boolean;
  monetization_type?: string;
  published_url?: string;
  embed_code?: string;
  plays?: number;
  likes?: number;
  rating?: number;
}
```

**Returns**: Updated `Game` object

**Example**:
```typescript
const updated = await gameService.updateGame(gameId, {
  title: 'Updated Title',
  description: 'Updated description',
  status: 'completed'
});
```

**Errors**:
- `Failed to update game: {database error message}`
- Constraint violation if game_type or engine invalid
- RLS error if user doesn't own the game

**Note**: `updated_at` is automatically set to current timestamp

---

## Delete Operations

### `deleteGame(gameId: string): Promise<void>`

Delete a game and all related entities (cascading delete).

**Parameters**:
- `gameId`: UUID of the game

**Returns**: void (no return value)

**Example**:
```typescript
await gameService.deleteGame(gameId);
console.log('Game deleted successfully');
```

**Cascade Deletes**:
- All game_scenes for this game
- All game_assets for this game
- All game_entities for this game
- All game_scripts for this game
- All game_builds for this game

**Errors**:
- `Failed to delete game: {database error message}`
- RLS error if user doesn't own the game

---

## Batch Operations

### `searchGames(userId: string, query: string): Promise<Game[]>`

Search games by title and description (full-text search).

**Parameters**:
- `userId`: UUID of the user
- `query`: Search query string

**Returns**: Array of `Game` objects matching query

**Example**:
```typescript
const results = await gameService.searchGames(userId, 'adventure');
console.log(`Found ${results.length} games with "adventure"`);

// Case-insensitive search
const results2 = await gameService.searchGames(userId, 'BATTLE');
```

**Search Behavior**:
- Searches in `title` and `description` fields
- Case-insensitive (uses PostgreSQL `ilike`)
- Partial matches (e.g., "adv" matches "adventure")
- Returns results sorted by most recently created first

**Errors**:
- `Failed to search games: {database error message}`
- Returns empty array if no matches

---

### `getGamesByType(userId: string, gameType: string): Promise<Game[]>`

Get all games of a specific type.

**Parameters**:
- `userId`: UUID of the user
- `gameType`: One of: '2d', '3d', 'retro', 'realistic', 'metaverse', '4d'

**Returns**: Array of `Game` objects

**Example**:
```typescript
const threeDGames = await gameService.getGamesByType(userId, '3d');
const retroGames = await gameService.getGamesByType(userId, 'retro');
```

**Sorting**: Results sorted by most recently created first

**Errors**:
- `Failed to get games by type: {database error message}`
- Returns empty array if no games of that type
- No validation of gameType parameter (use enums in calling code)

---

### `publishGame(gameId: string, publishedUrl: string): Promise<Game>`

Publish a game (transition to published status).

**Parameters**:
- `gameId`: UUID of the game
- `publishedUrl`: URL where game is published

**Returns**: Updated `Game` object with:
- `status`: Changed to 'published'
- `published_url`: Set to provided URL
- `published_at`: Set to current timestamp

**Example**:
```typescript
const published = await gameService.publishGame(
  gameId, 
  'https://kubovibe.com/games/my-game'
);
console.log('Published at:', published.published_at);
```

**Errors**:
- `Failed to publish game: {database error message}`
- RLS error if user doesn't own the game

**Note**: `updated_at` is automatically updated

---

## Type Definitions

### Game Types

```typescript
type GameType = '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d';

type Engine = 'babylon' | 'threejs' | 'playcanvas' | 'pixijs' | 'phaser' | 'custom';

type GameStatus = 'draft' | 'in_progress' | 'completed' | 'published' | 'archived';
```

### Complete Game Interface

```typescript
interface Game {
  // Identifiers
  id: string;                           // UUID
  user_id: string;                      // Owner's UUID
  
  // Basic Info
  title: string;
  description: string | null;
  cover_image_url: string | null;
  
  // Configuration
  game_type: '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d';
  engine: 'babylon' | 'threejs' | 'playcanvas' | 'pixijs' | 'phaser' | 'custom';
  config: Record<string, any>;          // JSONB custom config
  
  // Resource Counts
  assets_count: number;
  meshes_count: number;
  textures_count: number;
  animations_count: number;
  scripts_count: number;
  
  // Status
  status: string;                       // draft, published, etc.
  is_multiplayer: boolean;
  has_ai: boolean;
  has_monetization: boolean;
  monetization_type: string | null;     // e.g., 'ads', 'iap', 'subscription'
  
  // Publishing
  published_url: string | null;
  embed_code: string | null;
  
  // Engagement
  plays: bigint;                        // Play count
  likes: bigint;                        // Like count
  rating: number;                       // 0.0-5.0
  
  // Timestamps
  created_at: string;                   // ISO 8601
  updated_at: string;                   // ISO 8601
  published_at: string | null;          // ISO 8601 or null
}
```

---

## Error Handling

### Error Pattern

All service methods follow this error pattern:

```typescript
try {
  const result = await operation();
} catch (error) {
  if (error.message.includes('Failed to')) {
    // Service layer caught database error
    console.error(error.message);
  } else {
    // Unexpected error
    console.error('Unexpected error:', error);
  }
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Failed to create game: duplicate key value` | Title not unique | Use unique title |
| `Failed to create game: violates check constraint` | Invalid game_type or engine | Use valid enum values |
| `Failed to update game: user does not have permission` | RLS policy denies access | Verify user owns game |
| `Failed to {operation}: no rows returned` | Game not found | Verify game_id exists |
| `Failed to {operation}: connection timeout` | Database unavailable | Retry operation |

---

## Usage Patterns

### Pattern 1: CRUD with Error Handling

```typescript
async function manageGame(gameId: string) {
  try {
    // Read
    const game = await gameService.getGame(gameId);
    console.log('Current status:', game.status);
    
    // Update
    const updated = await gameService.updateGame(gameId, {
      status: 'completed',
      rating: 4.5
    });
    console.log('Updated:', updated.updated_at);
    
    // Publish
    const published = await gameService.publishGame(
      gameId,
      'https://example.com/game'
    );
    console.log('Published:', published.published_at);
    
  } catch (error) {
    console.error('Operation failed:', error.message);
  }
}
```

### Pattern 2: Batch Operations

```typescript
async function analyzeUserGames(userId: string) {
  // Get all games with pagination
  const allGames: Game[] = [];
  let offset = 0;
  
  while (true) {
    const { games, total } = await gameService.listGames(userId, 50, offset);
    allGames.push(...games);
    
    if (allGames.length >= total) break;
    offset += 50;
  }
  
  // Analyze
  const byType = allGames.reduce((acc, game) => {
    acc[game.game_type] = (acc[game.game_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('Games by type:', byType);
}
```

### Pattern 3: Search and Update

```typescript
async function updateAllMatchingGames(userId: string, searchTerm: string) {
  const games = await gameService.searchGames(userId, searchTerm);
  
  for (const game of games) {
    await gameService.updateGame(game.id, {
      is_multiplayer: true
    });
  }
  
  console.log(`Updated ${games.length} games`);
}
```

---

## Performance Tips

1. **Pagination**
   ```typescript
   // ✅ Good: Paginate large lists
   const { games } = await gameService.listGames(userId, 12, 0);
   
   // ❌ Avoid: Loading all games at once
   const { games } = await gameService.listGames(userId, 10000, 0);
   ```

2. **Caching**
   ```typescript
   // ✅ Good: Cache results in React
   const games = useQuery(() => 
     gameService.listGames(userId, 12, 0)
   );
   
   // ❌ Avoid: Refetching on every render
   useEffect(() => {
     gameService.listGames(userId, 12, 0);
   });
   ```

3. **Batch Updates**
   ```typescript
   // ✅ Good: Update specific fields
   await gameService.updateGame(id, { rating: 5 });
   
   // ❌ Avoid: Refetching after update
   const game = await gameService.getGame(id);
   ```

---

## Integration with React

### With useGames Hook

```typescript
import { useGames } from '@/hooks/useGames';

function MyComponent() {
  const { games, loading, error, createGame, updateGame, deleteGame } = useGames();
  
  // Hook handles all state management
}
```

### Direct Service Usage

```typescript
import { gameService } from '@/services/gameService';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';

function MyComponent() {
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!user) return;
    
    (async () => {
      try {
        const { games } = await gameService.listGames(user.id, 12, 0);
        setGames(games);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);
}
```

---

## Migration & Deployment

### Prerequisites

Ensure these migrations are applied:

```sql
-- File: supabase/migrations/20261010055136_*.sql

-- Tables created:
CREATE TABLE public.games (...);
CREATE TABLE public.game_scenes (...);
CREATE TABLE public.game_assets (...);
CREATE TABLE public.game_entities (...);
CREATE TABLE public.game_scripts (...);
CREATE TABLE public.game_builds (...);

-- RLS policies enabled on all tables
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
-- etc for all tables

-- RLS policies created (32 total)
-- Storage buckets created
```

### Type Generation

```bash
# Generate TypeScript types from database
npx supabase gen types typescript --project-id your-project

# Copy to src/types/database.ts
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-10-10 | Initial release with 8 core operations |

---

## Support

For API issues:
1. Check error message matches documented errors
2. Verify database migrations applied
3. Test with direct Supabase client
4. Check RLS policies enabled
5. Review Git commit history

**API Endpoint**: Supabase JavaScript Client (hosted)  
**Authentication**: Supabase Auth (session token)  
**Base URL**: `https://your-project.supabase.co/rest/v1`
