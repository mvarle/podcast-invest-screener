/**
 * Post-processing corrections for known Deepgram Danish mistranslations.
 * These are company/brand names that Deepgram consistently gets wrong
 * when transcribing Danish audio, plus keyword-boosting artifacts where
 * common Danish words get replaced by stock-related terms.
 *
 * Format: [regex pattern, replacement]
 * Patterns are case-insensitive and use word boundaries where appropriate.
 */

const CORRECTIONS = [
  // ── Company name mistranslations ──
  [/\bEnvidia\b/gi, "NVIDIA"],
  [/\bkoloplast\b/gi, "Coloplast"],
  [/\bmicroron\b/gi, "Micron"],
  [/\bAcincha\b/gi, "Accenture"],
  [/\bKemometic\b/gi, "ChemoMetec"],
  [/\bBWL-PPI\b/gi, "BW LPG"],
  [/\bRepli\b/gi, "Reply"],
  [/\bkorning\b/gi, "Corning"],
  [/\bTGE\b/g, "TGS"],
  [/\bakseobank\b/gi, "Saxo Bank"],
  [/\bMiljøærklubben\b/gi, "Millionærklubben"],

  // ── Keyword-boosting artifacts ──
  // These are common Danish words that Deepgram replaces with stock/financial terms
  // when keyword boosting is active.

  // "bare" (just/only) -> "bear" or "Bear"
  // Only fix "bear" when it appears mid-sentence in Danish context
  // (not at the start of a line after a speaker label, where it could be intentional)
  [/\bdet er bear\b/gi, "det er bare"],
  [/\ber bear\b/gi, "er bare"],
  [/\bja bear\b/gi, "ja bare"],
  [/\bmen bear\b/gi, "men bare"],
  [/\bog bear\b/gi, "og bare"],
  [/\bkan bear\b/gi, "kan bare"],
  [/\bskal bear\b/gi, "skal bare"],
  [/\bvil bear\b/gi, "vil bare"],
  [/\bat bear\b/gi, "at bare"],

  // "kort" (short/briefly) -> "short"
  [/\bi short\b/gi, "i kort"],
  [/\bret short\b/gi, "ret kort"],
  [/\bvery short\b/gi, "meget kort"],

  // "lang/langt" (long) -> "long"
  // Only fix when clearly in Danish sentence context
  [/\bret long\b/gi, "ret langt"],
  [/\bsa long\b/gi, "så langt"],
  [/\bså long\b/gi, "så langt"],

  // Note: "SMS" -> "ASML" and "dåb" -> "Adobe" are too ambiguous
  // for blind regex replacement. Claude handles these via context.
];

/**
 * Apply known corrections to a transcript string.
 * @param {string} transcript - Raw transcript text from Deepgram
 * @returns {string} - Corrected transcript
 */
function applyCorrections(transcript) {
  let corrected = transcript;
  for (const [pattern, replacement] of CORRECTIONS) {
    corrected = corrected.replace(pattern, replacement);
  }
  return corrected;
}

module.exports = { applyCorrections, CORRECTIONS };
