import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log("\n🧪 Testing Game Creation API\n");
console.log("Supabase URL:", supabaseUrl?.substring(0, 30) + "...");
console.log("Auth Key:", supabaseKey ? "✅ Found" : "❌ Missing");

if (!supabaseUrl || !supabaseKey) {
  console.error("\n❌ Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test game data
const testGame = {
  title: "Test Game - Babylon 3D Adventure",
  description: "A test game created to verify the Game Management System API",
  game_type: "3d",
  engine: "babylon",
  cover_image_url: "https://via.placeholder.com/400x300?text=Test+Game+3D",
  status: "draft",
  is_multiplayer: false,
  has_ai: false,
  has_monetization: false
};

console.log("\n📝 Creating test game with data:");
console.log("  Title:", testGame.title);
console.log("  Type:", testGame.game_type);
console.log("  Engine:", testGame.engine);

try {
  const { data, error } = await supabase
    .from("games")
    .insert([testGame])
    .select();

  if (error) {
    console.error("\n❌ Error creating game:");
    console.error("  Code:", error.code);
    console.error("  Message:", error.message);
    console.error("  Status:", error.status);

    if (error.message.includes("RLS")) {
      console.error("\n💡 RLS Policy Error - Check:");
      console.error("   1. Are you authenticated?");
      console.error("   2. Is the RLS policy enabled?");
      console.error("   3. Does user_id match auth.uid()?");
    }
    process.exit(1);
  } else if (data && data.length > 0) {
    console.log("\n✅ Game created successfully!");
    console.log("\n📊 Created Game Details:");
    console.log("  ID:", data[0].id);
    console.log("  Title:", data[0].title);
    console.log("  Type:", data[0].game_type);
    console.log("  Engine:", data[0].engine);
    console.log("  Status:", data[0].status);
    console.log("  Created:", new Date(data[0].created_at).toLocaleString());

    console.log("\n✅ Next Steps:");
    console.log("  1. Visit: http://localhost:8080/games");
    console.log("  2. Your game should appear in the list");
    console.log("  3. You can edit, delete, or search for it");
  } else {
    console.error("\n❌ No data returned from insert");
  }
} catch (err) {
  console.error("\n❌ Exception:", err.message);
  console.error(err);
  process.exit(1);
}
