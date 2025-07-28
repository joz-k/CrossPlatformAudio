#include <iostream>
#include "PortAudioEngine.hpp"

PortAudioEngine::PortAudioEngine() {
    PaError err = Pa_Initialize();
    if (err != paNoError) {
        std::cerr << "PortAudio error: " << Pa_GetErrorText(err) << std::endl;
    }
}

PortAudioEngine::~PortAudioEngine() {
    stop();
    PaError err = Pa_Terminate();
    if (err != paNoError) {
        std::cerr << "PortAudio error: " << Pa_GetErrorText(err) << std::endl;
    }
}

bool PortAudioEngine::start(int sample_rate, AudioCallback callback) {
    audio_callback_ = std::move(callback);

    PaStreamParameters output_parameters;
    output_parameters.device = Pa_GetDefaultOutputDevice();
    if (output_parameters.device == paNoDevice) {
        std::cerr << "Error: No default output device." << std::endl;
        return false;
    }

    const int num_channels = 2; // Stereo
    output_parameters.channelCount = num_channels;
    output_parameters.sampleFormat = paFloat32; // We will work with 32-bit floats
    output_parameters.suggestedLatency
                        = Pa_GetDeviceInfo(output_parameters.device)->defaultLowOutputLatency;
    output_parameters.hostApiSpecificStreamInfo = nullptr;

    PaError err = Pa_OpenStream(
        &stream_,
        nullptr, // No input
        &output_parameters,
        sample_rate,
        paFramesPerBufferUnspecified, // Let PortAudio choose buffer size
        paNoFlag,
        &PortAudioEngine::pa_callback,
        this // Pass a pointer to this instance as user data
    );

    if (err != paNoError) {
        std::cerr << "PortAudio error: " << Pa_GetErrorText(err) << std::endl;
        return false;
    }

    err = Pa_StartStream(stream_);
    if (err != paNoError) {
        std::cerr << "PortAudio error: " << Pa_GetErrorText(err) << std::endl;
        return false;
    }

    std::cout << "PortAudio stream started." << std::endl;
    return true;
}

void PortAudioEngine::stop() {
    if (stream_ != nullptr) {
        Pa_StopStream(stream_);
        Pa_CloseStream(stream_);
        stream_ = nullptr;
        std::cout << "PortAudio stream stopped." << std::endl;
    }
}

int PortAudioEngine::pa_callback(
    const void* input_buffer, 
    void* output_buffer,
    unsigned long frames_per_buffer,
    const PaStreamCallbackTimeInfo* time_info,
    PaStreamCallbackFlags status_flags,
    void* user_data) 
{
    // Cast user_data back to a pointer to our PortAudioEngine instance
    PortAudioEngine* engine = static_cast<PortAudioEngine*>(user_data);
    return engine->process_audio(static_cast<float*>(output_buffer), frames_per_buffer);
}

int PortAudioEngine::process_audio(float* output_buffer, unsigned long frames_per_buffer) {
    if (audio_callback_) {
        // We assume 2 channels (stereo)
        audio_callback_(output_buffer, static_cast<int>(frames_per_buffer), 2);
    }
    return paContinue;
}

