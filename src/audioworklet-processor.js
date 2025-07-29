// This is a special class that the browser requires for an AudioWorklet.
class CppAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._is_initialized = false;
        this._request_pending = false; // Prevents spamming the DSP thread with requests.

        // One-time setup message to receive the shared buffers.
        this.port.onmessage = (event) => {
            if (event.data.type === 'init') {
                const { audio_sab, state_sab } = event.data;
                this._audio_buffer_view = new Float32Array(audio_sab);
                this._state_view = new Int32Array(state_sab);
                this._BUFFER_CAPACITY_FRAMES = this._audio_buffer_view.length / 2; // e.g., 8192

                // Define the "Low Water Mark". We request more data when the buffer is below 25% full.
                this._LOW_WATER_MARK_FRAMES = this._BUFFER_CAPACITY_FRAMES * 0.25;

                this._is_initialized = true;
                console.log('Worklet: Shared buffers received and configured.');
            } else if (event.data.type === 'data_produced') {
                // The DSP worker has finished producing data, so we can send another request if needed.
                this._request_pending = false;
            }
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
        if (available_frames < 0) available_frames += this._BUFFER_CAPACITY_FRAMES;
        if (available_frames >= num_frames) {
            // We have enough data to play.
            for (let i = 0; i < num_frames; i++) {
                const frame_index = (read_ptr + i) % this._BUFFER_CAPACITY_FRAMES;
                for (let channel = 0; channel < output_channels.length; ++channel) {
                    output_channels[channel][i] = this._audio_buffer_view[frame_index * 2 + channel];
                }
            }
            read_ptr = (read_ptr + num_frames) % this._BUFFER_CAPACITY_FRAMES;
            Atomics.store(this._state_view, 0, read_ptr);
        } else {
            // Buffer underrun! This is what causes the glitches.
            for (const channel_data of output_channels) { channel_data.fill(0); }
            console.warn('AudioWorklet: buffer underrun');
        }

        // Check if we are below the low water mark AND no request is pending.
        if (!this._request_pending && available_frames < this._LOW_WATER_MARK_FRAMES) {
            this._request_pending = true;
            this.port.postMessage({ type: 'request_data' });
        }

        // Return true to tell the browser we want to keep running.
        return true;
    }
}

// This registers our class with the browser so it can be instantiated.
registerProcessor('cpp-audio-processor', CppAudioProcessor);

