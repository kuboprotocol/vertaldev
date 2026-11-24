// Checagem estática de um blueprint de jogo (ver .agents/skills/vertal-game-qa).
// Função pura: não toca em rede nem no navegador, então roda no fluxo de criação
// e nos testes. `error` bloqueia a entrega; `warning` é só um aviso ao usuário.

export type BlueprintIssueSeverity = 'error' | 'warning';

export interface BlueprintIssue {
  severity: BlueprintIssueSeverity;
  path: string;
  message: string;
}

export interface BlueprintQuality {
  ok: boolean;
  issues: BlueprintIssue[];
}

export const MAX_ENTITIES = 200;
const ENTITY_KINDS = ['player', 'npc', 'enemy', 'prop', 'portal'] as const;
const DIMENSIONS = ['2D', '3D', 'VR', 'Hybrid'] as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export function validateBlueprint(blueprint: unknown): BlueprintQuality {
  const issues: BlueprintIssue[] = [];
  const err = (path: string, message: string) => issues.push({ severity: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ severity: 'warning', path, message });

  if (!isObject(blueprint)) {
    err('blueprint', 'o blueprint não é um objeto');
    return { ok: false, issues };
  }

  if (!isNonEmptyString(blueprint.title)) err('title', 'título ausente');
  if (!isNonEmptyString(blueprint.genre)) err('genre', 'gênero ausente');

  if (!DIMENSIONS.includes(blueprint.dimension as (typeof DIMENSIONS)[number])) {
    err('dimension', `dimensão inválida (esperado um de ${DIMENSIONS.join(', ')})`);
  }

  const pillars = blueprint.pillars;
  if (!Array.isArray(pillars) || pillars.length === 0) {
    warn('pillars', 'nenhum pilar definido; sem critério para cortar features');
  }

  const loop = blueprint.gameplay_loop;
  if (!Array.isArray(loop) || loop.length === 0) {
    err('gameplay_loop', 'loop de gameplay ausente');
  }

  const roadmap = blueprint.roadmap;
  if (!Array.isArray(roadmap) || roadmap.length === 0) {
    warn('roadmap', 'roadmap ausente');
  } else if (roadmap.length === 1) {
    warn('roadmap', 'roadmap com um marco só; considere ao menos dois');
  }

  const scene = blueprint.scene;
  if (!isObject(scene)) {
    err('scene', 'cena ausente');
    return { ok: issues.every(i => i.severity !== 'error'), issues };
  }

  const entities = scene.entities;
  if (!Array.isArray(entities) || entities.length === 0) {
    err('scene.entities', 'a cena não tem entidades');
    return { ok: false, issues };
  }

  if (entities.length > MAX_ENTITIES) {
    err('scene.entities', `${entities.length} entidades; o limite é ${MAX_ENTITIES}`);
  }

  const names = new Set<string>();
  let players = 0;
  entities.forEach((raw, i) => {
    const at = `scene.entities[${i}]`;
    if (!isObject(raw)) {
      err(at, 'entidade não é um objeto');
      return;
    }
    if (!ENTITY_KINDS.includes(raw.kind as (typeof ENTITY_KINDS)[number])) {
      err(`${at}.kind`, `tipo inválido: ${String(raw.kind)}`);
    }
    if (raw.kind === 'player') players++;

    if (!isNonEmptyString(raw.name)) {
      err(`${at}.name`, 'nome ausente');
    } else if (names.has(raw.name)) {
      warn(`${at}.name`, `nome repetido: ${raw.name}`);
    } else {
      names.add(raw.name);
    }

    const pos = raw.position;
    if (!isObject(pos) || !isFiniteNumber(pos.x) || !isFiniteNumber(pos.y) || !isFiniteNumber(pos.z)) {
      err(`${at}.position`, 'posição precisa de x, y e z numéricos e finitos');
    }
  });

  if (players === 0) err('scene.entities', 'nenhuma entidade do tipo player');
  if (players > 1) warn('scene.entities', `${players} entidades player; o jogo usa uma só`);

  return { ok: issues.every(i => i.severity !== 'error'), issues };
}
