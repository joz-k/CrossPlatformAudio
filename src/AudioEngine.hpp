#pragma once

#include <functional>
#include <vector>

// The callback function signature.
// It receives a buffer to fill and the number of channels.
using AudioCallback = std::function<void(float* buffer, int num_frames, int num_channels)>;

// Abstract base class for an audio engine.
class AudioEngine {
public:
    virtual ~AudioEngine() = default;

    // Initializes and starts the audio stream.
    // sample_rate: The desired sample rate (e.g., 44100).
    // callback: The function that will be called to generate audio data.
    virtual bool start(int sample_rate, AudioCallback callback) = 0;

    // Stops and cleans up the audio stream.
    virtual void stop() = 0;
};

