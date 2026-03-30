/**
 * Post-processing corrections for known Deepgram Danish mistranslations.
 * These are company/brand names that Deepgram consistently gets wrong
 * when transcribing Danish audio.
 *
 * Format: [regex pattern, replacement]
 * Patterns are case-insensitive and use word boundaries where appropriate.
 */

const CORRECTIONS = [
  // Company name mistranslations
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
