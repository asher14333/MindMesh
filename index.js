const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const recorder = require("node-record-lpcm16");

const apiKey = process.env.DEEPGRAM_API_KEY;

if (!apiKey) {
  console.error("Missing DEEPGRAM_API_KEY");
  process.exit(1);
}

const deepgram = createClient(apiKey);
const connection = deepgram.listen.live({
  model: "nova-3",
  interim_results: true,
  smart_format: true,
  endpointing: 300,
  encoding: "linear16",
  sample_rate: 16000,
  channels: 1,
});

let recording;

connection.on(LiveTranscriptionEvents.Open, () => {
  console.log("Listening... Press Ctrl+C to stop.");

  recording = recorder.record({
    sampleRate: 16000,
    channels: 1,
    threshold: 0,
    endOnSilence: false,
    recorder: "sox",
    audioType: "raw",
  });

  recording
    .stream()
    .on("error", (err) => console.error("Mic error:", err))
    .on("data", (chunk) => connection.send(chunk));
});

connection.on(LiveTranscriptionEvents.Transcript, (data) => {
  const text = data.channel?.alternatives?.[0]?.transcript?.trim();
  if (!text) return;
  console.log(data.is_final ? "FINAL:" : "PARTIAL:", text);
});

connection.on(LiveTranscriptionEvents.Error, (err) => {
  console.error("Deepgram error:", err);
});

process.on("SIGINT", () => {
  recording?.stop();
  connection.finish?.();
  process.stdout.write("\n");
  setTimeout(() => process.exit(0), 250);
});
