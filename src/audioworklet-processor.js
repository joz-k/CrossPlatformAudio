// This is a special class that the browser requires for an AudioWorklet.
class CppAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._is_initialized = false;

        // One-time setup message to receive the shared buffers.
        this.port.onmessage = (event) => {
            const { audio_sab, state_sab } = event.data;
            this._audio_buffer_view = new Float32Array(audio_sab);
            this._state_view = new Int32Array(state_sab);
            this._is_initialized = true;
            console.log('Worklet: Shared buffers received.');
        };
    }

    // This is the real-time audio callback, like the one in PortAudio.
    // The browser calls this function automatically.
    // E.g. every ~2.7ms (for 128 frames at 48kHz).
    process(inputs, outputs, parameters) {
        if (!this._is_initialized) return true; // Wait for buffers.

        const output_channels = outputs[0];
        const num_frames = output_channels[0].length;

        // Atomics provide thread-safe reads of the shared read/write pointers.
        let read_ptr = Atomics.load(this._state_view, 0);
        let write_ptr = Atomics.load(this._state_view, 1);

        let available_frames = write_ptr - read_ptr;
        if (available_frames < 0) { // Handle the ring buffer wrap-around
            available_frames += this._audio_buffer_view.length / 2;
        }

        if (available_frames >= num_frames) {
            // We have enough data to play.
            const buffer_capacity = this._audio_buffer_view.length / 2;
            for (let i = 0; i < num_frames; i++) {
                const frame_index = (read_ptr + i) % buffer_capacity;
                for (let channel = 0; channel < output_channels.length; ++channel) {
                    output_channels[channel][i] = this._audio_buffer_view[frame_index * 2 + channel];
                }
            }
            read_ptr = (read_ptr + num_frames) % buffer_capacity;
            Atomics.store(this._state_view, 0, read_ptr);
        } else {
            // Not enough data. Play silence to avoid glitches.
            for (const channel_data of output_channels) { channel_data.fill(0); }
            console.log('AudioWorklet: buffer underun');
        }

        // Request more data if the buffer is running low.
        if (available_frames < num_frames * 4) {
            this.port.postMessage({ type: 'request_data' });
        }

        // Return true to tell the browser we want to keep running.
        return true;
    }
}

// This registers our class with the browser so it can be instantiated.
registerProcessor('cpp-audio-processor', CppAudioProcessor);

