# Babylon.js Texture Rendering Setup

## Overview

Transform your game entities from geometric shapes into textured sprites using Babylon.js. This guide explains how to add textures to your KUBO Vibe game scenes.

---

## Quick Start

### 1. Update Your Scene JSON

Add `textureUrl` to entity renderable components:

```json
{
  "id": 1,
  "name": "Mario",
  "transform": { "x": 0, "y": 0, "z": 0 },
  "renderable": {
    "mesh": "sprite",
    "textureUrl": "https://example.com/mario-sprite.png",
    "color": 15017249,
    "scale": 1.5,
    "emissive": 0.2
  }
}
```

### 2. Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `textureUrl` | string | URL to sprite/texture image |
| `texture` | string | Alternative property name |
| `color` | number | Hex color as fallback (0xRRGGBB) |
| `scale` | number | Size multiplier (1.0 = normal) |
| `emissive` | number | Self-illumination (0-1) |
| `mesh` | string | "sprite", "npc", "cube", "sphere" |

### 3. View Your Game

Navigate to `/game/scene` in your browser:

```
http://localhost:8080/game/scene
```

---

## Texture URLs

### Public CDN Sources

**Kenney Game Assets** (Recommended)
```
https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/
```

**Game Art Repository**
```
https://opengameart.org/
```

**Pixel Art Assets**
```
https://assetstore.unity.com/packages/2d/
```

### Upload Your Own

1. Host images on your server
2. Use CORS-enabled CDN (Cloudinary, imgix, etc.)
3. Reference in `textureUrl`

---

## Complete Example: Super Mario Scene

```json
{
  "name": "Super Mario World",
  "engine": "babylon",
  "game_type": "retro",
  "entities": [
    {
      "id": 1,
      "name": "Mario",
      "transform": { "x": 0, "y": 0, "z": 0 },
      "renderable": {
        "mesh": "sprite",
        "textureUrl": "https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/mario-sprite.png",
        "color": 15017249,
        "scale": 1.5,
        "emissive": 0.2
      }
    },
    {
      "id": 2,
      "name": "Luigi",
      "transform": { "x": 2, "y": 0, "z": 0 },
      "renderable": {
        "mesh": "sprite",
        "textureUrl": "https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/luigi-sprite.png",
        "color": 4436039,
        "scale": 1.5,
        "emissive": 0.2
      }
    },
    {
      "id": 3,
      "name": "Question Block",
      "transform": { "x": 3, "y": 2, "z": 3 },
      "renderable": {
        "mesh": "cube",
        "textureUrl": "https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/block-question.png",
        "color": 16766720,
        "emissive": 0.1
      }
    }
  ]
}
```

---

## API Reference

### BabylonTextureRenderer

```typescript
// Initialize
const renderer = new BabylonTextureRenderer('canvas-id');
await renderer.initialize();

// Add entities
await renderer.addEntity({
  id: 1,
  name: "Player",
  transform: { x: 0, y: 0, z: 0 },
  renderable: {
    mesh: "sprite",
    textureUrl: "https://...",
    color: 0xff0000,
    scale: 1.5
  }
});

// Update position
renderer.updateEntity(1, { x: 5, y: 2, z: 0 });

// Get scene/engine
const scene = renderer.getScene();
const engine = renderer.getEngine();

// Cleanup
renderer.dispose();
```

### GameSceneRenderer Component

```typescript
import { GameSceneRenderer } from '@/components/GameSceneRenderer';

function MyGame() {
  const sceneData = {
    name: "My Game",
    entities: [...]
  };

  return (
    <GameSceneRenderer 
      sceneData={sceneData}
      gameId="my-canvas"
      showControls={true}
    />
  );
}
```

---

## Texture Tips

### Material Properties

**Color Overlay**
- `color: 0xFFFFFF` - White (no tint)
- `color: 0xFF0000` - Red tint
- Use in combination with texture for colored variants

**Emissive Glow**
```json
"emissive": 0.0   // No glow
"emissive": 0.2   // Soft glow
"emissive": 0.5   // Strong glow (neon effect)
```

**Scale**
```json
"scale": 0.5      // Half size
"scale": 1.0      // Normal size
"scale": 2.0      // Double size
```

### Performance

- Use PNG/WebP images (compressed)
- Resolution: 256x256 or 512x512 for sprites
- Limit unique textures to 50+
- Cache is automatic (textures load once)
- Lazy load textures on demand

---

## Troubleshooting

### Textures Not Loading

**Symptom**: Entities show colors but no texture

**Checks**:
1. Verify URL is accessible (test in browser)
2. Check browser console for CORS errors
3. Ensure URL protocol is HTTPS
4. Confirm URL points to image file (.png, .jpg, .webp)

**Solution**:
```json
{
  "textureUrl": "https://example.com/image.png",  // ✓ Good
  // "textureUrl": "http://example.com/...",     // ✗ Mixed HTTPS
  // "textureUrl": "example.com/...",            // ✗ No protocol
}
```

### CORS Errors

**Solution**: Use CORS-enabled CDNs

```json
// ✓ Good
"textureUrl": "https://cdn.jsdelivr.net/npm/@kenney/..."

// Use Cloudinary for custom images
"textureUrl": "https://res.cloudinary.com/your-cloud/image/upload/..."
```

### Textures Blurry

**Solution**: Check scale and mesh size

```json
{
  "mesh": "sprite",      // Plane mesh for sprites
  "scale": 2.0,          // Increase if too small
  "textureUrl": "..."
}
```

---

## Examples

### 2D Sprite Game

```json
{
  "renderable": {
    "mesh": "sprite",
    "textureUrl": "https://example.com/player.png",
    "scale": 1.0
  }
}
```

### 3D Character

```json
{
  "renderable": {
    "mesh": "cube",
    "textureUrl": "https://example.com/character-texture.jpg",
    "scale": 1.5,
    "emissive": 0.1
  }
}
```

### Collectible Item (Glowing)

```json
{
  "renderable": {
    "mesh": "sphere",
    "textureUrl": "https://example.com/coin.png",
    "scale": 0.6,
    "emissive": 0.4,
    "color": 0xFFD700
  }
}
```

---

## Integration with GameManager

Games created via `/games` can have texture data:

```typescript
const game = await gameService.createGame({
  title: "Mario Adventure",
  game_type: "retro",
  engine: "babylon",
  config: {
    scene: {
      entities: [
        {
          name: "Mario",
          renderable: {
            textureUrl: "https://...",
            scale: 1.5
          }
        }
      ]
    }
  }
});
```

---

## Files

| File | Purpose |
|------|---------|
| `src/game/engines/babylon-texture-renderer.ts` | Core texture renderer |
| `src/components/GameSceneRenderer.tsx` | React component wrapper |
| `src/pages/GameScenePage.tsx` | Full scene viewer |
| `super-mario-world-with-textures.kubo-scene.json` | Example scene |

---

## Next Steps

1. ✅ Add `textureUrl` to your game JSON
2. ✅ Visit `/game/scene` to preview
3. ✅ Download scene JSON with screenshot
4. ✅ Create games via GameManager at `/games`
5. ✅ Integrate textures into your game engine

---

## Support

For issues or questions:
1. Check browser console (F12)
2. Verify texture URLs load in browser
3. Review example JSON
4. Check BABYLON_TEXTURE_SETUP.md

---

**Version**: 1.0  
**Last Updated**: 2026-10-10  
**Status**: ✅ Production Ready
