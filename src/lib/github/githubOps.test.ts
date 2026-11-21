import { describe, expect, it } from 'vitest';
import {
  describeGithubOp, isGithubWrite, isValidBranch, normalizeRepo, parseGithubCommand, parseGithubOp, wantsGithub, githubErrorCode,
} from '../../../supabase/functions/_shared/githubOps';
import { githubCodeFromBody, summarizeGithubResult } from './client';

describe('operações GitHub do agente (Vibe Code)', () => {
  it('normaliza repositório e valida branch', () => {
    expect(normalizeRepo('kuboprotocol/vertaldev')).toBe('kuboprotocol/vertaldev');
    expect(normalizeRepo('https://github.com/kuboprotocol/vertaldev.git')).toBe('kuboprotocol/vertaldev');
    expect(normalizeRepo('kuboprotocol')).toBeNull();
    expect(normalizeRepo('a/b/c')).toBeNull();
    expect(normalizeRepo('../etc')).toBeNull();
    expect(isValidBranch('feat/navigator-f2')).toBe(true);
    for (const bad of ['', '-x', 'a..b', 'a b', 'a/', 'x.lock', 'a~1', '@', 'a@{1}']) expect(isValidBranch(bad)).toBe(false);
  });

  it('valida cada op com padrões seguros (repo privado, PR rascunho)', () => {
    expect(parseGithubOp({ op: 'create_repo', name: 'meu-app' })).toEqual({ op: 'create_repo', name: 'meu-app', private: true });
    expect(parseGithubOp({ op: 'create_repo', name: 'meu-app', visibility: 'public' })).toMatchObject({ private: false });
    expect(parseGithubOp({ op: 'create_issue', repo: 'a/b', title: 'Bug no login', body: 'passos' })).toEqual({ op: 'create_issue', repo: 'a/b', title: 'Bug no login', body: 'passos' });
    expect(parseGithubOp({ op: 'create_branch', repo: 'a/b', branch: 'feat/x', from: 'main' })).toEqual({ op: 'create_branch', repo: 'a/b', branch: 'feat/x', from: 'main' });
    expect(parseGithubOp({ op: 'create_pr', repo: 'a/b', title: 'Fase 2', head: 'feat/x' })).toEqual({ op: 'create_pr', repo: 'a/b', title: 'Fase 2', head: 'feat/x', draft: true });
    expect(parseGithubOp({ op: 'list_repos', max: 999 })).toEqual({ op: 'list_repos', max: 50 });
    expect(parseGithubOp({ op: 'delete_repo', repo: 'a/b' })).toBeNull();
    expect(parseGithubOp({ op: 'create_branch', repo: 'a/b', branch: '../x' })).toBeNull();
    expect(parseGithubOp({ op: 'create_issue', repo: 'a/b', title: '' })).toBeNull();
  });

  it('escrita é marcada para confirmação e descrita em português', () => {
    const pr = parseGithubOp({ op: 'create_pr', repo: 'a/b', title: 'Fase 2', head: 'feat/x', base: 'main' })!;
    expect(isGithubWrite(pr)).toBe(true);
    expect(isGithubWrite({ op: 'list_repos', max: 5 })).toBe(false);
    expect(describeGithubOp(pr)).toBe('Abrir PR em rascunho "Fase 2" em a/b: feat/x → main');
    expect(describeGithubOp({ op: 'create_repo', name: 'x', private: false })).toContain('PÚBLICO');
  });

  it('comando /github do Vibe Code', () => {
    expect(parseGithubCommand('/github repos')).toEqual({ op: 'list_repos', max: 20 });
    expect(parseGithubCommand('/github repo loja-vibe')).toEqual({ op: 'create_repo', name: 'loja-vibe', private: true });
    expect(parseGithubCommand('/github repo loja-vibe publico')).toMatchObject({ private: false });
    expect(parseGithubCommand('/github issue a/b Botão quebrado | Ao clicar nada acontece')).toEqual({ op: 'create_issue', repo: 'a/b', title: 'Botão quebrado', body: 'Ao clicar nada acontece' });
    expect(parseGithubCommand('/github branch a/b feat/x de develop')).toEqual({ op: 'create_branch', repo: 'a/b', branch: 'feat/x', from: 'develop' });
    expect(parseGithubCommand('/github pr a/b feat/x -> main Nova tela')).toEqual({ op: 'create_pr', repo: 'a/b', head: 'feat/x', base: 'main', title: 'Nova tela', draft: true });
    expect(parseGithubCommand('/github apagar a/b')).toBeNull();
    expect(parseGithubCommand('github repos')).toBeNull();
  });

  it('erros e resumos', () => {
    expect(githubErrorCode(404)).toBe('not_found');
    expect(githubErrorCode(422)).toBe('conflict');
    expect(githubCodeFromBody({ error: 'GitHub not connected' })).toBe('not_connected');
    expect(githubCodeFromBody({ code: 'forbidden' })).toBe('forbidden');
    expect(summarizeGithubResult({ op: 'create_issue', repo: 'a/b', title: 't' }, { number: 7, html_url: 'https://github.com/a/b/issues/7' })).toBe('Issue #7 aberta em a/b: https://github.com/a/b/issues/7');
  });

  it('a ferramenta só entra no prompt quando a conversa fala de GitHub', () => {
    expect(wantsGithub(['crie um repositório para o app'])).toBe(true);
    expect(wantsGithub(['abra uma issue no github'])).toBe(true);
    expect(wantsGithub(['faça um post para o instagram'])).toBe(false);
  });
});
