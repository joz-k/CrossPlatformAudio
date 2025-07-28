#include "WebAudioEngine.hpp"

// Global pointer to the single engine instance.
WebAudioEngine* g_web_audio_engine = nullptr;

// This is the C-style entry point that our JavaScript will call.
extern "C" void generate_audio_data(float* buffer_ptr, int num_frames) {
    if (g_web_audio_engine) {
        g_web_audio_engine->process_audio_from_js(buffer_ptr, num_frames);
    }
}

bool WebAudioEngine::start(int sample_rate, AudioCallback callback) {
    // We only need to store the callback function. All web API setup
    // is handled in JavaScript.
    audio_callback_ = std::move(callback);
    g_web_audio_engine = this;
    return true;
}

void WebAudioEngine::stop() {
    // Lifecycle is managed in shell.html, so this does nothing.
}

void WebAudioEngine::process_audio_from_js(float* output_ptr, int num_frames) {
    if (audio_callback_) {
        const int num_channels = 2; // Stereo
        audio_callback_(output_ptr, num_frames, num_channels);
    }
}

