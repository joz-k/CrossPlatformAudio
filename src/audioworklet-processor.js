// This is the "Musician" thread. It is a simple, robust consumer.
class CppAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._is_initialized = false;
        
        // One-time setup message to receive the shared buffers.
        this.port.onmessage = (event) => {
            const { audio_sab, state_sab } = event.data;
            this._audio_buffer_view = new Float32Array(audio_sab);
            this._state_view = new Int32Array(state_sab);
            this._BUFFER_CAPACITY_FRAMES = this._audio_buffer_view.length / 2;
            this._is_initialized = true;
            console.log('Worklet: Shared buffers received.');
        };
    }

    process(inputs, outputs, parameters) {
        if (!this._is_initialized) return true; // Wait for buffers.

        const output_channels = outputs[0];
        const num_frames = output_channels[0].length;

        let read_ptr = Atomics.load(this._state_view, 0);
        let write_ptr = Atomics.load(this._state_view, 1);
        
        let available_frames = write_ptr - read_ptr;
        if (available_frames < 0) available_frames += this._BUFFER_CAPACITY_FRAMES;

        if (available_frames >= num_frames) {
            // Data is available to play.
            for (let i = 0; i < num_frames; i++) {
                const frame_index = (read_ptr + i) % this._BUFFER_CAPACITY_FRAMES;
                for (let channel = 0; channel < output_channels.length; ++channel) {
                    output_channels[channel][i] = this._audio_buffer_view[frame_index * 2 + channel];
                }
            }
            read_ptr = (read_ptr + num_frames) % this._BUFFER_CAPACITY_FRAMES;
            Atomics.store(this._state_view, 0, read_ptr);
        } else {
            // Buffer is empty. Play silence to prevent glitches.
            for (const channel_data of output_channels) channel_data.fill(0);
        }
        
        // Proactively request more data if the buffer is running low.
        if (available_frames < num_frames * 4) {
            this.port.postMessage({ type: 'request_data' });
        }

        return true;
    }
}
registerProcessor('cpp-audio-processor', CppAudioProcessor);