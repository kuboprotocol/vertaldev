/**
 * Game Scene Renderer Component
 * Renders KUBO game scenes with Babylon.js texture support
 */

import React, { useEffect, useRef, useState } from 'react';
import { BabylonTextureRenderer, SceneEntity } from '@/game/engines/babylon-texture-renderer';
import { Loader2 } from 'lucide-react';

interface GameSceneRendererProps {
  sceneData?: {
    entities: SceneEntity[];
    name?: string;
    camera?: {
      position: { x: number; y: number; z: number };
      target: { x: number; y: number; z: number };
    };
    environment?: {
      backgroundColor?: string;
      ambientLight?: { intensity: number };
    };
  };
  gameId?: string;
  className?: string;
  showControls?: boolean;
}

export const GameSceneRenderer: React.FC<GameSceneRendererProps> = ({
  sceneData,
  gameId = 'game-canvas',
  className = 'w-full h-screen bg-gray-900',
  showControls = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BabylonTextureRenderer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initRenderer = async () => {
      try {
        setLoading(true);
        setError(null);

        // Create canvas if using ref
        if (canvasRef.current) {
          const renderer = new BabylonTextureRenderer(canvasRef.current.id);
          await renderer.initialize();

          // Add scene entities
          if (sceneData?.entities) {
            await renderer.addEntities(sceneData.entities);
          }

          rendererRef.current = renderer;
          setLoading(false);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize renderer';
        setError(message);
        console.error('Renderer initialization error:', err);
        setLoading(false);
      }
    };

    initRenderer();

    return () => {
      rendererRef.current?.dispose();
    };
  }, [sceneData]);

  const handleScreenshot = () => {
    if (rendererRef.current) {
      const screenshot = rendererRef.current.screenshot();
      const link = document.createElement('a');
      link.href = screenshot;
      link.download = `game-screenshot-${Date.now()}.png`;
      link.click();
    }
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Canvas */}
      <canvas
        id={gameId}
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />

      {/* Loading State */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-white text-lg font-medium">Loading Game Scene...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="bg-red-900/80 border border-red-500 rounded-lg p-6 max-w-md">
            <h3 className="text-red-200 font-bold text-lg mb-2">Render Error</h3>
            <p className="text-red-100 text-sm mb-4">{error}</p>
            <p className="text-red-200 text-xs">
              Make sure Babylon.js is installed: <code className="bg-black/50 px-2 py-1">npm install @babylonjs/core</code>
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      {showControls && !loading && !error && (
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <button
            onClick={handleScreenshot}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            📸 Screenshot
          </button>
        </div>
      )}

      {/* Scene Info */}
      {sceneData?.name && (
        <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur px-4 py-2 rounded-lg text-white text-sm">
          <p className="font-semibold">{sceneData.name}</p>
          <p className="text-gray-300 text-xs">
            {sceneData.entities.length} entities • Babylon.js Engine
          </p>
        </div>
      )}
    </div>
  );
};

export default GameSceneRenderer;
