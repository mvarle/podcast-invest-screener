import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function getUserType(authHeader: string | null): Promise<string> {
  if (!authHeader) return "free";
  try {
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabase.auth.getUser(token);
    if (!data.user) return "free";
    const { data: profile } = await supabase
      .from("users")
      .select("user_type")
      .eq("id", data.user.id)
      .single();
    return profile?.user_type || "free";
  } catch {
    return "free";
  }
}

function applyFreemiumFilter(query: any, userType: string) {
  // Free users can't see episodes from the last 3 days
  // For MVP, this is disabled (all users see everything)
  // To enable: uncomment the following:
  // if (userType === "free") {
  //   const threeDaysAgo = new Date();
  //   threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  //   query = query.lte("release_date", threeDaysAgo.toISOString());
  // }
  return query;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "");
  const params = url.searchParams;
  const authHeader = req.headers.get("Authorization");
  const userType = await getUserType(authHeader);

  try {
    // GET /api/mentions — Recent stock mentions with filters
    if (path === "/mentions" || path === "/mentions/") {
      let query = supabase
        .from("stock_mentions")
        .select(`
          *,
          episodes!inner (id, title, release_date, podcast_id,
            podcasts (name)
          )
        `)
        .order("created_at", { ascending: false });

      // Apply filters
      if (params.get("ticker")) query = query.eq("ticker", params.get("ticker"));
      if (params.get("sentiment")) query = query.eq("sentiment", params.get("sentiment"));
      if (params.get("speaker")) query = query.eq("speaker", params.get("speaker"));
      if (params.get("episode_id")) query = query.eq("episode_id", params.get("episode_id"));
      if (params.get("from")) query = query.gte("created_at", params.get("from"));
      if (params.get("to")) query = query.lte("created_at", params.get("to"));

      const limit = parseInt(params.get("limit") || "50");
      const offset = parseInt(params.get("offset") || "0");
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse(data);
    }

    // GET /api/mentions/:id — Single mention with performance data
    if (path.match(/^\/mentions\/[a-f0-9-]+$/)) {
      const mentionId = path.split("/")[2];
      const { data: mention, error: mentionError } = await supabase
        .from("stock_mentions")
        .select(`
          *,
          episodes (id, title, release_date, podcast_id,
            podcasts (name)
          ),
          performance_snapshots (*)
        `)
        .eq("id", mentionId)
        .single();

      if (mentionError) throw mentionError;
      return jsonResponse(mention);
    }

    // GET /api/stocks/:ticker — All mentions for a ticker
    if (path.match(/^\/stocks\/[A-Za-z0-9._-]+$/)) {
      const ticker = decodeURIComponent(path.split("/")[2]);
      const { data, error } = await supabase
        .from("stock_mentions")
        .select(`
          *,
          episodes (id, title, release_date),
          performance_snapshots (*)
        `)
        .eq("ticker", ticker)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return jsonResponse(data);
    }

    // GET /api/speakers — List all speakers with stats
    if (path === "/speakers" || path === "/speakers/") {
      const { data, error } = await supabase
        .from("stock_mentions")
        .select("speaker, sentiment, performance_snapshots(prediction_correct)");

      if (error) throw error;

      // Aggregate speaker stats
      const speakerMap = new Map<string, { total: number; correct: number; sentiments: Record<string, number> }>();
      for (const mention of data || []) {
        const speaker = mention.speaker || "Unknown";
        if (!speakerMap.has(speaker)) {
          speakerMap.set(speaker, { total: 0, correct: 0, sentiments: {} });
        }
        const stats = speakerMap.get(speaker)!;
        stats.total++;
        stats.sentiments[mention.sentiment] = (stats.sentiments[mention.sentiment] || 0) + 1;
        for (const snap of (mention as any).performance_snapshots || []) {
          if (snap.prediction_correct === true) stats.correct++;
        }
      }

      const speakers = Array.from(speakerMap.entries()).map(([name, stats]) => ({
        name,
        totalMentions: stats.total,
        correctPredictions: stats.correct,
        sentiments: stats.sentiments,
      }));

      return jsonResponse(speakers);
    }

    // GET /api/speakers/:name — All mentions by a speaker
    if (path.match(/^\/speakers\/.+$/)) {
      const speaker = decodeURIComponent(path.split("/").slice(2).join("/"));
      const { data, error } = await supabase
        .from("stock_mentions")
        .select(`
          *,
          episodes (id, title, release_date),
          performance_snapshots (*)
        `)
        .eq("speaker", speaker)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return jsonResponse(data);
    }

    // GET /api/episodes — List episodes
    if (path === "/episodes" || path === "/episodes/") {
      let query = supabase
        .from("episodes")
        .select(`
          id, title, release_date, status, podcast_id,
          podcasts (name),
          stock_mentions (count)
        `)
        .eq("status", "analysis_complete")
        .order("release_date", { ascending: false });

      const limit = parseInt(params.get("limit") || "20");
      const offset = parseInt(params.get("offset") || "0");
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse(data);
    }

    // GET /api/episodes/:id — Single episode with all mentions
    if (path.match(/^\/episodes\/[a-f0-9-]+$/)) {
      const episodeId = path.split("/")[2];
      const { data, error } = await supabase
        .from("episodes")
        .select(`
          *,
          podcasts (name),
          stock_mentions (
            *,
            performance_snapshots (*)
          )
        `)
        .eq("id", episodeId)
        .single();

      if (error) throw error;
      return jsonResponse(data);
    }

    // GET /api/podcasts — List podcasts
    if (path === "/podcasts" || path === "/podcasts/") {
      const { data, error } = await supabase
        .from("podcasts")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return jsonResponse(data);
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    console.error("API error:", error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
