import { useState, useCallback, useEffect } from "react";
import { gameService } from "@/services/gameService";
import { Database } from "@/types/database";
import { useAuth } from "./useAuth";

type Game = Database["public"]["Tables"]["games"]["Row"];
type GameInsert = Database["public"]["Tables"]["games"]["Insert"];
type GameUpdate = Database["public"]["Tables"]["games"]["Update"];

interface UseGamesState {
  games: Game[];
  loading: boolean;
  error: string | null;
  total: number;
  currentPage: number;
}

export function useGames(pageSize = 12) {
  const { user } = useAuth();
  const [state, setState] = useState<UseGamesState>({
    games: [],
    loading: false,
    error: null,
    total: 0,
    currentPage: 1
  });

  // Load games
  const loadGames = useCallback(async (page = 1) => {
    if (!user) return;

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const offset = (page - 1) * pageSize;
      const { games, total } = await gameService.listGames(user.id, pageSize, offset);
      setState(prev => ({
        ...prev,
        games,
        total,
        currentPage: page,
        loading: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to load games",
        loading: false
      }));
    }
  }, [user, pageSize]);

  // Create game
  const createGame = useCallback(async (data: GameInsert) => {
    if (!user) throw new Error("User not authenticated");

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const newGame = await gameService.createGame({
        ...data,
        user_id: user.id
      });
      setState(prev => ({
        ...prev,
        games: [newGame, ...prev.games],
        total: prev.total + 1,
        loading: false
      }));
      return newGame;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to create game";
      setState(prev => ({ ...prev, error: errorMsg, loading: false }));
      throw error;
    }
  }, [user]);

  // Update game
  const updateGame = useCallback(async (gameId: string, data: GameUpdate) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const updated = await gameService.updateGame(gameId, data);
      setState(prev => ({
        ...prev,
        games: prev.games.map(g => g.id === gameId ? updated : g),
        loading: false
      }));
      return updated;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to update game";
      setState(prev => ({ ...prev, error: errorMsg, loading: false }));
      throw error;
    }
  }, []);

  // Delete game
  const deleteGame = useCallback(async (gameId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      await gameService.deleteGame(gameId);
      setState(prev => ({
        ...prev,
        games: prev.games.filter(g => g.id !== gameId),
        total: prev.total - 1,
        loading: false
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to delete game";
      setState(prev => ({ ...prev, error: errorMsg, loading: false }));
      throw error;
    }
  }, []);

  // Search games
  const searchGames = useCallback(async (query: string) => {
    if (!user) return;

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const games = await gameService.searchGames(user.id, query);
      setState(prev => ({
        ...prev,
        games,
        loading: false
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to search games";
      setState(prev => ({ ...prev, error: errorMsg, loading: false }));
    }
  }, [user]);

  // Get games by type
  const getGamesByType = useCallback(async (gameType: string) => {
    if (!user) return;

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const games = await gameService.getGamesByType(user.id, gameType);
      setState(prev => ({
        ...prev,
        games,
        loading: false
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to get games";
      setState(prev => ({ ...prev, error: errorMsg, loading: false }));
    }
  }, [user]);

  // Publish game
  const publishGame = useCallback(async (gameId: string, publishedUrl: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const published = await gameService.publishGame(gameId, publishedUrl);
      setState(prev => ({
        ...prev,
        games: prev.games.map(g => g.id === gameId ? published : g),
        loading: false
      }));
      return published;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to publish game";
      setState(prev => ({ ...prev, error: errorMsg, loading: false }));
      throw error;
    }
  }, []);

  // Load initial games on mount
  useEffect(() => {
    if (user) {
      loadGames(1);
    }
  }, [user, loadGames]);

  return {
    ...state,
    loadGames,
    createGame,
    updateGame,
    deleteGame,
    searchGames,
    getGamesByType,
    publishGame,
    nextPage: () => loadGames(state.currentPage + 1),
    prevPage: () => loadGames(state.currentPage - 1),
    totalPages: Math.ceil(state.total / pageSize)
  };
}
