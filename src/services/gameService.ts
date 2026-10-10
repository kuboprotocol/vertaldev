import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/types/database";

type Game = Database["public"]["Tables"]["games"]["Row"];
type GameInsert = Database["public"]["Tables"]["games"]["Insert"];
type GameUpdate = Database["public"]["Tables"]["games"]["Update"];

export const gameService = {
  // CREATE
  async createGame(data: GameInsert) {
    const { data: game, error } = await supabase
      .from("games")
      .insert([data])
      .select()
      .single();

    if (error) throw new Error(`Failed to create game: ${error.message}`);
    return game as Game;
  },

  // READ ALL
  async listGames(userId: string, limit = 50, offset = 0) {
    const { data: games, error, count } = await supabase
      .from("games")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to list games: ${error.message}`);
    return { games: games as Game[], total: count || 0 };
  },

  // READ ONE
  async getGame(gameId: string) {
    const { data: game, error } = await supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (error) throw new Error(`Failed to get game: ${error.message}`);
    return game as Game;
  },

  // UPDATE
  async updateGame(gameId: string, data: GameUpdate) {
    const { data: game, error } = await supabase
      .from("games")
      .update(data)
      .eq("id", gameId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update game: ${error.message}`);
    return game as Game;
  },

  // DELETE
  async deleteGame(gameId: string) {
    const { error } = await supabase
      .from("games")
      .delete()
      .eq("id", gameId);

    if (error) throw new Error(`Failed to delete game: ${error.message}`);
  },

  // BATCH OPERATIONS
  async searchGames(userId: string, query: string) {
    const { data: games, error } = await supabase
      .from("games")
      .select("*")
      .eq("user_id", userId)
      .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to search games: ${error.message}`);
    return games as Game[];
  },

  async getGamesByType(userId: string, gameType: string) {
    const { data: games, error } = await supabase
      .from("games")
      .select("*")
      .eq("user_id", userId)
      .eq("game_type", gameType)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to get games by type: ${error.message}`);
    return games as Game[];
  },

  async publishGame(gameId: string, publishedUrl: string) {
    const { data: game, error } = await supabase
      .from("games")
      .update({
        status: "published",
        published_url: publishedUrl,
        published_at: new Date().toISOString()
      })
      .eq("id", gameId)
      .select()
      .single();

    if (error) throw new Error(`Failed to publish game: ${error.message}`);
    return game as Game;
  }
};
