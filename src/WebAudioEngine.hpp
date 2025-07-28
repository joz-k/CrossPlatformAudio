#pragma once
#include "AudioEngine.hpp"

class WebAudioEngine final : public AudioEngine {
public:
    WebAudioEngine() = default;
    ~WebAudioEngine() override = default;

    // The 'start' method just saves the callback function. It doesn't touch any web APIs.
    bool start(int sample_rate, AudioCallback callback) override;

    // The 'stop' method is not needed, as JS controls the lifecycle.
    void stop() override;

    // This public method is the link between the C-style function and the callback.
    void process_audio_from_js(float* output_ptr, int num_frames);

private:
    AudioCallback audio_callback_;
};

