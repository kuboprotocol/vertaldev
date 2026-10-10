# KUBO Vibe Game Management System - Quick Start Guide

Get up and running with the Game Management System in 5 minutes.

---

## ⚡ 30-Second Overview

The KUBO Vibe Game Management System provides:

✅ **Complete CRUD Operations** - Create, read, update, delete games  
✅ **TypeScript Type Safety** - Auto-generated database types  
✅ **React Hooks** - State management with `useGames`  
✅ **Service Layer** - Clean API with `gameService`  
✅ **Premium UI** - Dark-mode GameManager component  
✅ **Row-Level Security** - User data isolation at database level  
✅ **Pagination** - Built-in pagination support  
✅ **Search & Filter** - Full-text search and type filtering  

---

## 🚀 Getting Started

### Step 1: Access the Interface

Visit the game management page:

```
http://localhost:8080/games
```

You must be authenticated. If not, you'll be redirected to `/auth`.

### Step 2: Create Your First Game

1. Click **"New Game"** button
2. Fill in the form:
   - **Title**: "My First Game" (required)
   - **Description**: "A great game" (optional)
   - **Game Type**: Select "3d" (required)
   - **Engine**: Select "babylon" (required)
   - **Cover Image**: Paste a URL (optional)
3. Click **"Create Game"**
4. See toast notification: "Game created successfully"
5. Your game appears in the grid

### Step 3: Edit the Game

1. Click the **Edit** (pencil icon) button on your game
2. Modify any field
3. Click **"Update Game"**
4. See notification: "Game updated successfully"

### Step 4: Delete the Game

1. Click the **Delete** (trash icon) button
2. Confirmation dialog appears
3. Click **"Confirm"** to delete
4. Game is removed from list

---

## 🔧 For Developers

### Using the Service Directly

Import and use the service layer:

```typescript
import { gameService } from '@/services/gameService';

// Create
const game = await gameService.createGame({
  title: 'My Game',
  description: 'Game description',
  game_type: '3d',
  engine: 'babylon',
  user_id: userId
});

// Read
const { games, total } = await gameService.listGames(userId, 12, 0);

// Update
const updated = await gameService.updateGame(gameId, {
  title: 'New Title'
});

// Delete
await gameService.deleteGame(gameId);

// Search
const results = await gameService.searchGames(userId, 'query');

// Filter
const threeDGames = await gameService.getGamesByType(userId, '3d');

// Publish
const published = await gameService.publishGame(gameId, 'https://url');
```

### Using the React Hook

Import and use the hook in components:

```typescript
import { useGames } from '@/hooks/useGames';

function MyComponent() {
  const {
    games,
    loading,
    error,
    createGame,
    updateGame,
    deleteGame,
    searchGames,
    getGamesByType,
    nextPage,
    prevPage,
    totalPages
  } = useGames(12);

  return (
    <div>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}
      {games.map(game => (
        <div key={game.id}>
          <h3>{game.title}</h3>
          <button onClick={() => updateGame(game.id, { status: 'published' })}>
            Publish
          </button>
        </div>
      ))}
    </div>
  );
}
```

### Using the GameManager Component

Import the full-featured component:

```typescript
import { GameManager } from '@/components/GameManager';

export default function GamesPage() {
  return <GameManager />;
}
```

---

## 📋 Available Game Types

Choose from these game types when creating/updating:

| Type | Description |
|------|-------------|
| `2d` | 2D games (sprites, top-down, etc.) |
| `3d` | 3D games (environments, characters) |
| `retro` | Retro/pixel art games |
| `realistic` | Photo-realistic games |
| `metaverse` | Metaverse/virtual world games |
| `4d` | 4D/experimental games |

```typescript
const game = await gameService.createGame({
  game_type: '3d',  // ✅ Valid
  // game_type: 'vr'  // ❌ Invalid
});
```

---

## ⚙️ Available Game Engines

Choose from these game engines:

| Engine | Description |
|--------|-------------|
| `babylon` | Babylon.js (powerful 3D) |
| `threejs` | Three.js (WebGL rendering) |
| `playcanvas` | PlayCanvas (cloud-based) |
| `pixijs` | PixiJS (2D rendering) |
| `phaser` | Phaser (game framework) |
| `custom` | Custom engine |

```typescript
const game = await gameService.createGame({
  engine: 'babylon',  // ✅ Valid
  // engine: 'unity'    // ❌ Invalid
});
```

---

## 🔍 Search & Filter

### Search Games

Real-time search in title and description:

```typescript
const results = await useGames().searchGames('adventure');
```

**UI**: Type in search input, results update automatically

### Filter by Type

```typescript
const threeDGames = await useGames().getGamesByType('3d');
```

**UI**: Select from type dropdown

---

## 📄 Game Fields Reference

### Required Fields

- `title` - Game name (string)
- `game_type` - One of: 2d, 3d, retro, realistic, metaverse, 4d
- `engine` - One of: babylon, threejs, playcanvas, pixijs, phaser, custom

### Optional Fields

- `description` - Game description (string)
- `cover_image_url` - URL to cover image (string)
- `config` - Custom configuration (JSON)

### Auto-Managed Fields

- `id` - UUID (generated)
- `user_id` - Your user ID (automatic)
- `created_at` - Creation timestamp (automatic)
- `updated_at` - Last update timestamp (automatic)
- `status` - Default: 'draft'
- `plays` - Play count (default: 0)
- `likes` - Like count (default: 0)
- `rating` - Rating (default: 0.0)

---

## 🎮 Game Status States

Games can have different statuses:

- `draft` - Work in progress (default)
- `in_progress` - Active development
- `completed` - Development finished
- `published` - Published to store
- `archived` - Archived/retired

Update status:

```typescript
await gameService.updateGame(gameId, {
  status: 'published'
});
```

---

## 🔐 Security

### User Data Isolation

You can only access your own games. This is enforced at the database level:

```typescript
// ✅ This works - your own games
const myGames = await gameService.listGames(myUserId, 12, 0);

// ❌ This fails silently - database RLS blocks access
const otherUsersGames = await gameService.listGames(otherUserId, 12, 0);
```

### Authentication Required

All game operations require:

1. Valid Supabase session
2. Authentication token
3. ProtectedRoute wrapper

---

## ⏱️ Pagination Example

Load games in pages of 12:

```typescript
// Page 1
const page1 = await gameService.listGames(userId, 12, 0);    // games 1-12
// Page 2
const page2 = await gameService.listGames(userId, 12, 12);   // games 13-24
// Page 3
const page3 = await gameService.listGames(userId, 12, 24);   // games 25-36

// With hook
const { games, nextPage, prevPage, currentPage, totalPages } = useGames(12);
// currentPage = 1
// totalPages = 10
```

---

## 🎯 Common Tasks

### Create and Publish a Game

```typescript
// Create
const game = await gameService.createGame({
  title: 'My Game',
  game_type: '3d',
  engine: 'babylon'
});

// Update details
await gameService.updateGame(game.id, {
  description: 'Final version'
});

// Publish
await gameService.publishGame(game.id, 'https://kubovibe.com/games/my-game');
```

### Find All 3D Games

```typescript
const games = await gameService.getGamesByType(userId, '3d');
console.log(`Found ${games.length} 3D games`);
```

### Update All Games with "demo" in Title

```typescript
const games = await gameService.searchGames(userId, 'demo');
for (const game of games) {
  await gameService.updateGame(game.id, {
    is_multiplayer: true
  });
}
```

### Get Game Statistics

```typescript
const { games, total } = await gameService.listGames(userId, 1000, 0);

const stats = games.reduce((acc, game) => {
  acc.totalPlays += game.plays;
  acc.totalLikes += game.likes;
  acc.avgRating = (acc.avgRating * (acc.count) + game.rating) / (acc.count + 1);
  acc.count++;
  return acc;
}, { totalPlays: 0, totalLikes: 0, avgRating: 0, count: 0 });

console.log('Stats:', stats);
```

---

## 🐛 Troubleshooting

### "Games not loading"

**Symptom**: Blank list despite creating games

```typescript
// Check 1: User is authenticated
const { user } = useAuth();
if (!user) {
  // Redirect to /auth
}

// Check 2: Games exist in database
const { games, total } = await gameService.listGames(user.id, 100, 0);
console.log('Total games:', total);

// Check 3: No errors in console
```

### "Create game fails"

**Symptom**: Form submits but nothing happens

```typescript
// Check 1: All required fields filled
// title, game_type, engine are required

// Check 2: Valid enum values
const validTypes = ['2d', '3d', 'retro', 'realistic', 'metaverse', '4d'];
const validEngines = ['babylon', 'threejs', 'playcanvas', 'pixijs', 'phaser', 'custom'];

// Check 3: Check browser console for error
// Look for toast notification with error message
```

### "Search returns no results"

**Symptom**: Search query returns empty

```typescript
// Check 1: Game exists
const allGames = await gameService.listGames(userId, 100, 0);

// Check 2: Title/description contains search term
// Search is case-insensitive, so "Game" matches "game"

// Check 3: Try simpler search term
// "adv" should match "adventure"
```

---

## 📚 Documentation Links

- [Complete API Reference](./GAME_API_REFERENCE.md) - Detailed API docs
- [Full Documentation](./GAME_SYSTEM_DOCUMENTATION.md) - Architecture, types, deployment
- [Database Schema](./supabase/migrations/20261010055136_*.sql) - SQL tables and RLS

---

## 🎓 Learning Path

1. **Start**: This Quick Start guide (you are here) ✓
2. **Explore**: Visit `/games` and create/edit/delete games
3. **Learn**: Read the API Reference for detailed docs
4. **Build**: Integrate with your components
5. **Master**: Read Full Documentation for architecture

---

## 📞 Support

### Check These First

1. Console errors (F12 → Console tab)
2. Toast notifications (bottom right)
3. Network tab (API responses)
4. Browser localStorage (session data)

### If Still Stuck

1. Review error message carefully
2. Check database types (`src/types/database.ts`)
3. Verify Supabase connection
4. Test with direct `gameService` calls
5. Review Git commits for changes

---

## ✅ Checklist

Before deploying to production:

- [ ] All CRUD operations working
- [ ] Search and filter working
- [ ] Pagination working
- [ ] Error handling working
- [ ] RLS policies protecting data
- [ ] Authentication required
- [ ] Cover images loading
- [ ] No console errors
- [ ] Mobile responsive
- [ ] Loading states showing
- [ ] Toast notifications working

---

## 🎉 You're Ready!

You now have everything needed to:

✅ Create and manage games  
✅ Search and filter games  
✅ Publish games  
✅ Use TypeScript safely  
✅ Handle errors gracefully  
✅ Build on this foundation  

**Next Step**: Visit `/games` and create your first game!

---

**Quick Links**:
- [Game Manager Component](./src/components/GameManager.tsx)
- [Game Service](./src/services/gameService.ts)
- [useGames Hook](./src/hooks/useGames.ts)
- [Type Definitions](./src/types/database.ts)
