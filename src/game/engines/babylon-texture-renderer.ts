/**
 * Babylon.js Texture-Based Renderer
 * Supports loading and applying textures to entities
 * Implements sprite rendering for 2D/retro games with 3D visualization
 */

import * as BABYLON from '@babylonjs/core';

export interface TextureConfig {
  textureUrl?: string;
  texture?: string;
  color?: number;
  emissive?: number;
  scale?: number;
}

export interface SceneEntity {
  id: string | number;
  name: string;
  transform: {
    x: number;
    y: number;
    z: number;
    rot?: number;
  };
  renderable: TextureConfig & {
    mesh: string;
  };
}

export class BabylonTextureRenderer {
  private scene: BABYLON.Scene | null = null;
  private engine: BABYLON.Engine | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private meshes = new Map<string | number, BABYLON.AbstractMesh>();
  private textureCache = new Map<string, BABYLON.Texture>();

  constructor(private canvasId: string) {}

  async initialize(): Promise<void> {
    this.canvas = document.getElementById(this.canvasId) as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error(`Canvas with id "${this.canvasId}" not found`);
    }

    this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true });
    this.scene = new BABYLON.Scene(this.engine);

    // Setup lighting
    const ambientLight = new BABYLON.HemisphericLight('ambient', new BABYLON.Vector3(0, 1, 1), this.scene);
    ambientLight.intensity = 0.7;

    const directionalLight = new BABYLON.PointLight('point', new BABYLON.Vector3(10, 20, 10), this.scene);
    directionalLight.intensity = 0.9;

    // Setup camera
    const camera = new BABYLON.ArcRotateCamera(
      'camera',
      Math.PI / 2,
      Math.PI / 2.5,
      50,
      new BABYLON.Vector3(0, 5, 0),
      this.scene
    );
    camera.attachControl(this.canvas, true);
    camera.inertia = 0.7;
    camera.angularSensibilityX = 1000;
    camera.angularSensibilityY = 1000;

    // Setup background
    this.scene.clearColor = new BABYLON.Color3(0.53, 0.81, 0.92); // Sky blue

    // Render loop
    this.engine.runRenderLoop(() => {
      this.scene?.render();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.engine?.resize();
    });
  }

  async addEntity(entity: SceneEntity): Promise<void> {
    if (!this.scene) throw new Error('Scene not initialized');

    let mesh: BABYLON.AbstractMesh;

    // Create base mesh
    switch (entity.renderable.mesh) {
      case 'sprite':
      case 'npc':
        mesh = BABYLON.MeshBuilder.CreatePlane(
          entity.name,
          { width: 1, height: 1 },
          this.scene
        );
        break;
      case 'cube':
        mesh = BABYLON.MeshBuilder.CreateBox(
          entity.name,
          { size: 1 },
          this.scene
        );
        break;
      case 'sphere':
        mesh = BABYLON.MeshBuilder.CreateSphere(
          entity.name,
          { diameter: 1 },
          this.scene
        );
        break;
      default:
        mesh = BABYLON.MeshBuilder.CreateBox(
          entity.name,
          { size: 1 },
          this.scene
        );
    }

    // Apply transform
    mesh.position = new BABYLON.Vector3(
      entity.transform.x,
      entity.transform.y,
      entity.transform.z
    );

    if (entity.renderable.scale) {
      mesh.scaling = new BABYLON.Vector3(
        entity.renderable.scale,
        entity.renderable.scale,
        entity.renderable.scale
      );
    }

    // Create and apply material
    const material = new BABYLON.StandardMaterial(
      `mat_${entity.id}`,
      this.scene
    );

    // Apply color
    if (entity.renderable.color !== undefined) {
      const r = ((entity.renderable.color >> 16) & 255) / 255;
      const g = ((entity.renderable.color >> 8) & 255) / 255;
      const b = (entity.renderable.color & 255) / 255;
      material.diffuse = new BABYLON.Color3(r, g, b);
    } else {
      material.diffuse = new BABYLON.Color3(0.8, 0.8, 0.8);
    }

    // Apply emissive for glow
    if (entity.renderable.emissive) {
      const emissiveIntensity = entity.renderable.emissive;
      material.emissiveColor = new BABYLON.Color3(
        emissiveIntensity * 0.3,
        emissiveIntensity * 0.3,
        emissiveIntensity * 0.3
      );
    }

    // Load and apply texture if specified
    const textureUrl = entity.renderable.textureUrl || entity.renderable.texture;
    if (textureUrl) {
      try {
        let texture = this.textureCache.get(textureUrl);

        if (!texture) {
          texture = new BABYLON.Texture(textureUrl, this.scene);
          texture.uScale = 1;
          texture.vScale = 1;
          this.textureCache.set(textureUrl, texture);
        }

        material.emissiveTexture = texture;
        material.diffuseTexture = texture;
      } catch (err) {
        console.warn(`Failed to load texture for ${entity.name}:`, err);
        // Fallback to color only
      }
    }

    material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    mesh.material = material;

    this.meshes.set(entity.id, mesh);
  }

  addEntities(entities: SceneEntity[]): Promise<void[]> {
    return Promise.all(entities.map((e) => this.addEntity(e)));
  }

  removeEntity(id: string | number): void {
    const mesh = this.meshes.get(id);
    if (mesh) {
      mesh.dispose();
      this.meshes.delete(id);
    }
  }

  updateEntity(id: string | number, transform: Partial<SceneEntity['transform']>): void {
    const mesh = this.meshes.get(id);
    if (!mesh) return;

    if (transform.x !== undefined) mesh.position.x = transform.x;
    if (transform.y !== undefined) mesh.position.y = transform.y;
    if (transform.z !== undefined) mesh.position.z = transform.z;
  }

  getScene(): BABYLON.Scene | null {
    return this.scene;
  }

  getEngine(): BABYLON.Engine | null {
    return this.engine;
  }

  dispose(): void {
    this.meshes.forEach((mesh) => mesh.dispose());
    this.meshes.clear();
    this.textureCache.clear();
    this.scene?.dispose();
    this.engine?.dispose();
  }

  screenshot(): string {
    if (!this.scene) return '';
    return BABYLON.ScreenshotTools.CreateScreenshot(
      this.engine!,
      this.camera! as any,
      1920
    );
  }

  private get camera(): BABYLON.Camera | null {
    return this.scene?.activeCamera ?? null;
  }
}
