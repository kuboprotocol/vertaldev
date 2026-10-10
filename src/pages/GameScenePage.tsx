/**
 * Game Scene Page
 * Displays a game scene with Babylon.js texture rendering
 */

import React, { useState, useEffect } from 'react';
import GameSceneRenderer from '@/components/GameSceneRenderer';
import { Loader2, Download, AlertCircle } from 'lucide-react';

// Sample Super Mario World scene data
const SUPER_MARIO_SCENE = {
  version: 1,
  name: 'Super Mario World: Echoes of the Mushroom Kingdom',
  description: 'Classic 2D retro game with Babylon.js 3D rendering',
  createdAt: '2026-10-10T08:32:48.125Z',
  engine: 'babylon',
  game_type: 'retro',
  entities: [
    {
      id: 1,
      name: 'Mario',
      transform: { x: 0, y: 0, z: 0, rot: 0 },
      renderable: {
        mesh: 'sprite',
        textureUrl: 'https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/mario-sprite.png',
        color: 15017249,
        scale: 1.5,
        emissive: 0.2,
      },
      npc: {
        npcId: 'Mario',
        persona: 'The heroic plumber, balanced and agile, always ready for adventure.',
        health: 100,
        speed: 5,
      },
    },
    {
      id: 2,
      name: 'Luigi',
      transform: { x: 2, y: 0, z: 0, rot: 0 },
      renderable: {
        mesh: 'sprite',
        textureUrl: 'https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/luigi-sprite.png',
        color: 4436039,
        scale: 1.5,
        emissive: 0.2,
      },
      npc: {
        npcId: 'Luigi',
        persona: "Mario's taller, younger brother, known for his high jumps and slight cowardice.",
        health: 100,
        speed: 5.5,
      },
    },
    {
      id: 3,
      name: 'Princess Peach',
      transform: { x: -2, y: 0, z: 0, rot: 0 },
      renderable: {
        mesh: 'sprite',
        textureUrl: 'https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/peach-sprite.png',
        color: 16503016,
        scale: 1.5,
        emissive: 0.2,
      },
      npc: {
        npcId: 'Princess Peach',
        persona: 'The graceful ruler of the Mushroom Kingdom, with the ability to float.',
        health: 80,
        speed: 4,
      },
    },
    {
      id: 4,
      name: 'Toad',
      transform: { x: 0, y: 0, z: 2, rot: 0 },
      renderable: {
        mesh: 'sprite',
        textureUrl: 'https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/toad-sprite.png',
        color: 16777215,
        scale: 1.2,
        emissive: 0.15,
      },
      npc: {
        npcId: 'Toad',
        persona: 'A speedy and cheerful resident of the Mushroom Kingdom.',
        health: 60,
        speed: 6,
      },
    },
    {
      id: 5,
      name: 'Yoshi',
      transform: { x: 0, y: 0, z: -2, rot: 0 },
      renderable: {
        mesh: 'sprite',
        textureUrl: 'https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/yoshi-sprite.png',
        color: 42577,
        scale: 1.8,
        emissive: 0.2,
      },
      npc: {
        npcId: 'Yoshi',
        persona: 'A friendly dinosaur with a flutter jump and egg-throwing abilities.',
        health: 90,
        speed: 5.2,
      },
    },
    {
      id: 6,
      name: 'Bowser',
      transform: { x: 4, y: 0, z: 0, rot: 0 },
      renderable: {
        mesh: 'sprite',
        textureUrl: 'https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/bowser-sprite.png',
        color: 16763904,
        scale: 2,
        emissive: 0.3,
      },
      npc: {
        npcId: 'Bowser',
        persona: 'The mighty Koopa King, who can breathe fire and smash obstacles.',
        health: 150,
        speed: 3,
        boss: true,
      },
    },
    {
      id: 7,
      name: 'Donkey Kong',
      transform: { x: -4, y: 0, z: 0, rot: 0 },
      renderable: {
        mesh: 'sprite',
        textureUrl: 'https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/donkey-kong-sprite.png',
        color: 9127187,
        scale: 2,
        emissive: 0.25,
      },
      npc: {
        npcId: 'Donkey Kong',
        persona: 'A powerful ape with incredible strength and climbing skills.',
        health: 120,
        speed: 3.5,
      },
    },
    {
      id: 11,
      name: 'Question Block',
      transform: { x: 3, y: 2, z: 3, rot: 0 },
      renderable: {
        mesh: 'cube',
        textureUrl: 'https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/block-question.png',
        color: 16766720,
        scale: 1,
        emissive: 0.1,
      },
    },
    {
      id: 12,
      name: 'Coin',
      transform: { x: -3, y: 0, z: -3, rot: 0 },
      renderable: {
        mesh: 'sphere',
        textureUrl: 'https://cdn.jsdelivr.net/npm/@kenney/game-assets@latest/coin.png',
        color: 16766720,
        scale: 0.6,
        emissive: 0.4,
      },
    },
  ],
};

export const GameScenePage: React.FC = () => {
  const [sceneFull, setSceneFull] = useState(SUPER_MARIO_SCENE);
  const [sceneUrl, setSceneUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadSceneFromUrl = async () => {
    if (!sceneUrl.trim()) return;

    try {
      setLoading(true);
      const response = await fetch(sceneUrl);
      const data = await response.json();
      setSceneFull(data);
    } catch (err) {
      console.error('Failed to load scene:', err);
      alert('Failed to load scene from URL');
    } finally {
      setLoading(false);
    }
  };

  const downloadScene = () => {
    const blob = new Blob([JSON.stringify(sceneFull, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sceneFull.name || 'game-scene'}.kubo-scene.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Game Renderer */}
      <div className="flex-1 relative">
        <GameSceneRenderer
          sceneData={sceneFull}
          gameId="mario-canvas"
          showControls={true}
        />
      </div>

      {/* Control Panel */}
      <div className="w-80 bg-gray-900 border-l border-gray-800 overflow-y-auto shadow-2xl">
        <div className="p-6">
          {/* Header */}
          <h1 className="text-2xl font-bold text-white mb-2">Game Scene</h1>
          <p className="text-gray-400 text-sm mb-6">
            {sceneFull.name || 'Untitled Game'}
          </p>

          {/* Scene Info */}
          <div className="bg-gray-800 rounded-lg p-4 mb-6 space-y-3">
            <div>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Engine</p>
              <p className="text-white text-sm mt-1">{sceneFull.engine || 'babylon'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Type</p>
              <p className="text-white text-sm mt-1">{sceneFull.game_type || 'retro'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Entities</p>
              <p className="text-white text-sm mt-1">{sceneFull.entities.length} objects</p>
            </div>
          </div>

          {/* Load Scene */}
          <div className="mb-6">
            <label className="text-gray-300 text-sm font-medium block mb-2">
              Load Scene from URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={sceneUrl}
                onChange={(e) => setSceneUrl(e.target.value)}
                placeholder="Paste scene URL..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={loadSceneFromUrl}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '📥'}
              </button>
            </div>
          </div>

          {/* Download Scene */}
          <button
            onClick={downloadScene}
            className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mb-6"
          >
            <Download className="w-4 h-4" />
            Download Scene JSON
          </button>

          {/* Entity List */}
          <div>
            <h2 className="text-gray-300 font-semibold mb-3 text-sm">Entities</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {sceneFull.entities.map((entity) => (
                <div
                  key={entity.id}
                  className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-blue-500 transition-colors cursor-pointer"
                >
                  <p className="text-white text-sm font-medium">{entity.name}</p>
                  <div className="text-gray-400 text-xs mt-1 space-y-1">
                    <p>Position: ({entity.transform.x}, {entity.transform.y}, {entity.transform.z})</p>
                    <p>Mesh: {entity.renderable.mesh}</p>
                    {entity.renderable.textureUrl && (
                      <p className="text-blue-400">Has Texture ✓</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Help */}
          <div className="mt-6 p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
            <div className="flex gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-blue-200 text-xs font-medium">Tip</p>
            </div>
            <p className="text-blue-100 text-xs leading-relaxed">
              Entities now have texture support! Use <code className="bg-black/30 px-1">textureUrl</code> property to add sprite images.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameScenePage;
