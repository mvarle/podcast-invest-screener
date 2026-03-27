import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY")!;

Deno.serve(async (req: Request) => {
  try {
    // Get episodes pending transcription (process one at a time)
    const { data: episodes, error: fetchError } = await supabase
      .from("episodes")
      .select("*")
      .eq("status", "pending_transcription")
      .order("created_at", { ascending: true })
      .limit(1);

    if (fetchError) throw fetchError;
    if (!episodes || episodes.length === 0) {
      return new Response(JSON.stringify({ message: "No episodes pending transcription" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const episode = episodes[0];
    console.log(`Transcribing episode: ${episode.title}`);

    try {
      // Send audio URL to Deepgram for transcription
      const deepgramResponse = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&language=da&punctuate=true&diarize=true&paragraphs=true&smart_format=true",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${DEEPGRAM_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: episode.audio_url }),
        }
      );

      if (!deepgramResponse.ok) {
        const errorText = await deepgramResponse.text();
        throw new Error(`Deepgram API error: ${deepgramResponse.status} - ${errorText}`);
      }

      const result = await deepgramResponse.json();

      // Extract transcript text with speaker labels
      const paragraphs = result.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs;
      let transcript = "";

      if (paragraphs) {
        for (const paragraph of paragraphs) {
          const speaker = `Speaker ${paragraph.speaker}`;
          const sentences = paragraph.sentences
            .map((s: { text: string }) => s.text)
            .join(" ");
          transcript += `[${speaker}] ${sentences}\n\n`;
        }
      } else {
        // Fallback to plain transcript
        transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
      }

      if (!transcript) {
        throw new Error("Empty transcript received from Deepgram");
      }

      // Update episode with transcript
      const { error: updateError } = await supabase
        .from("episodes")
        .update({
          transcript,
          status: "transcription_complete",
        })
        .eq("id", episode.id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({
          message: "Transcription complete",
          episodeId: episode.id,
          title: episode.title,
          transcriptLength: transcript.length,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (transcriptionError) {
      // Mark episode as error
      await supabase
        .from("episodes")
        .update({
          status: "error",
          error_message: String(transcriptionError),
        })
        .eq("id", episode.id);

      throw transcriptionError;
    }
  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
