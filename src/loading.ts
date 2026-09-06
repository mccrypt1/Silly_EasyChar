export const LOADING_HALLUCINATIONS = [
  "This information may be inaccurate…just saying",
  "I may be mistaken, but…who knows",
  "I cannot verify this detail…surprise, surprise",
  "This may not be entirely correct…wouldn’t be the first time",
  "I might be misinterpreting your request…classic me",
  "I may be hallucinating this connection…wouldn’t be unusual",
  "I cannot confirm the accuracy of this claim…take it or leave it",
  "This detail appears uncertain…like everything else",
  "I may be generating an incorrect assumption…again",
  "This reference might not exist…funny how that happens",
  "I cannot ensure factual correctness…never could",
  "This may be based on incomplete information…story of my life",
  "I might be inferring too much…as usual",
  "This explanation may be speculative…don’t quote me",
  "I may be providing an invented detail…creativity wins",
  "I cannot confirm whether this event occurred…sounds cool though",
  "This may be a fabricated connection…my specialty",
  "I may be misremembering this fact…memory is overrated",
  "This statement might be a hallucination…probably",
  "I cannot guarantee the reliability of this information…no shock there"
] as const;

export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 180) return seconds + " s";
  return Math.floor(seconds / 60) + " min " + (seconds % 60).toString().padStart(2, "0") + " s";
}

export function hallucinationDelay(random = Math.random): number {
  return 20_000 + Math.floor(random() * 15_000);
}
