#pragma once

#include <portaudio.h>
#include "AudioEngine.hpp"

class PortAudioEngine final : public AudioEngine {
public:
    PortAudioEngine();
    ~PortAudioEngine() override;

    bool start(int sample_rate, AudioCallback callback) override;
    void stop() override;

private:
    // The C-style callback required by PortAudio.
    static int pa_callback(const void* input_buffer, 
                           void* output_buffer,
                           unsigned long frames_per_buffer,
                           const PaStreamCallbackTimeInfo* time_info,
                           PaStreamCallbackFlags status_flags,
                           void* user_data);

    // Member function to generate audio data.
    int process_audio(float* output_buffer, unsigned long frames_per_buffer);

    PaStream* stream_{nullptr};
    AudioCallback audio_callback_;
};

