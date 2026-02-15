/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const { createClient } = require("@supabase/supabase-js");

function readEnvLocal(projectRoot) {
  const envPath = path.join(projectRoot, ".env.local");
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const out = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const env = { ...readEnvLocal(projectRoot), ...process.env };

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id, name, description, image_url, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml))",
    )
    .eq("is_active", true);

  if (error) {
    console.error("Supabase error:", error.message);
    process.exit(1);
  }

  const list = (data ?? []).slice().sort((a, b) => {
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });

  const outDir = path.join(projectRoot, "mobile", "src", "seed");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "recipes.json");
  fs.writeFileSync(outPath, JSON.stringify({ recipes: list }, null, 2) + "\n", "utf8");

  console.log(`Wrote ${list.length} recipes to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

