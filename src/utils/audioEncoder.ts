import { Mp3Encoder } from '@breezystack/lamejs';

export async function encodeAudioToMp3(
  audioBuffer: AudioBuffer,
  startTime: number,
  endTime: number
): Promise<Blob> {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  
  // Create an offline context to extract exactly the trimmed region
  let duration = endTime - startTime;
  if (duration <= 0) duration = 0.1; // Prevent crash on 0 duration
  
  const offlineCtx = new OfflineAudioContext(numChannels, duration * sampleRate, sampleRate);
  
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  
  // Start playing at offset `startTime`
  source.start(0, startTime, duration);
  
  const renderedBuffer = await offlineCtx.startRendering();
  
  // Prepare lamejs encoder
  // 128kbps is a decent default
  const mp3encoder = new Mp3Encoder(numChannels, sampleRate, 128);
  const mp3Data: any[] = [];

  const leftChannel = renderedBuffer.getChannelData(0);
  const rightChannel = numChannels > 1 ? renderedBuffer.getChannelData(1) : leftChannel;
  
  // lamejs expects Int16 samples
  const sampleBlockSize = 1152; 
  let leftChunk = new Int16Array(sampleBlockSize);
  let rightChunk = new Int16Array(sampleBlockSize);

  for (let i = 0; i < leftChannel.length; i += sampleBlockSize) {
    const end = Math.min(i + sampleBlockSize, leftChannel.length);
    const chunkLength = end - i;

    // We must re-instantiate or slice precisely for the last chunk
    if (chunkLength < sampleBlockSize) {
      leftChunk = new Int16Array(chunkLength);
      rightChunk = new Int16Array(chunkLength);
    }

    for (let j = 0; j < chunkLength; j++) {
      // Convert Float32 [-1.0, 1.0] to Int16 [-32768, 32767]
      leftChunk[j] = Math.max(-1, Math.min(1, leftChannel[i + j])) * 0x7FFF;
      rightChunk[j] = Math.max(-1, Math.min(1, rightChannel[i + j])) * 0x7FFF;
    }

    let mp3buf;
    if (numChannels === 1) {
      mp3buf = mp3encoder.encodeBuffer(leftChunk);
    } else {
      mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    }

    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }

  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data as unknown as BlobPart[], { type: 'audio/mp3' });
}
