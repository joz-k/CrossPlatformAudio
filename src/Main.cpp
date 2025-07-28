#include <iostream>
#include <memory>
#include <cmath>
#include <numbers>
#include "AudioEngine.hpp"

#ifdef __EMSCRIPTEN__
#include "WebAudioEngine.hpp"
#else
#include "PortAudioEngine.hpp"
#endif

// A unique_ptr to the engine to manage its lifetime.
std::unique_ptr<AudioEngine> engine;

// This will hold the sample rate provided by the browser or the default.
static double g_sample_rate = 44100.0;

#ifdef __EMSCRIPTEN__
// This C function will be called from JavaScript to set the correct sample rate.
extern "C" void set_sample_rate(double sample_rate) {
    std::cout << "C++: Sample rate set to " << sample_rate << " Hz." << std::endl;
    g_sample_rate = sample_rate;
}
#endif

// The factory function that selects the correct audio engine implementation.
std::unique_ptr<AudioEngine> create_audio_engine() {
#ifdef __EMSCRIPTEN__
    return std::make_unique<WebAudioEngine>();
#else
    return std::make_unique<PortAudioEngine>();
#endif
}

// This function sets up the C++ audio callback.
void setup_cpp_audio() {
    static double phase = 0.0;
    const double frequency = 440.0; // A4 note
    const double amplitude = 0.5;

    // ====================================================================
    // This is the cross-platform C++ callback to generate the audio
    auto sine_wave_callback =
        [frequency, amplitude](float* buffer, int num_frames, int num_channels) {

        // Use the global, dynamic sample rate for the calculation.
        const double phase_increment = 2.0 * std::numbers::pi * frequency / g_sample_rate;

        for (int frame = 0; frame < num_frames; ++frame) {
            float sample_value = static_cast<float>(amplitude * std::sin(phase));
            for (int channel = 0; channel < num_channels; ++channel) {
                buffer[frame * num_channels + channel] = sample_value;
            }
            phase += phase_increment;
            if (phase >= 2.0 * std::numbers::pi) {
                phase -= 2.0 * std::numbers::pi;
            }
        }
    };
    // ====================================================================

    if (engine) {
        // For PortAudio, we still need to provide a sample rate up front.
        // For WebAudio, this value is now ignored, but the call is still needed.
        engine->start(static_cast<int>(g_sample_rate), sine_wave_callback);
    }
}

int main() {
    engine = create_audio_engine();
    if (!engine) {
        std::cerr << "Failed to create audio engine." << std::endl;
        return 1;
    }

    setup_cpp_audio();

#ifndef __EMSCRIPTEN__
    std::cout << "Playing a 440 Hz tone. Press Enter to quit." << std::endl;
    std::cin.get();
    engine->stop();
#else
    std::cout << "C++ audio engine initialized. Control playback from the web page." << std::endl;
#endif

    return 0;
}

