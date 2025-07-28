// This is the dedicated DSP thread.

// These are null until the WASM module is fully initialized inside this worker.
let isInitialized = false;
let cpp_generate_audio = null;
let cpp_set_sample_rate = null;
let audio_sab = null;
let state_view = null;

// The single message handler for the worker's entire lifetime.
self.onmessage = (event) => {
    // The first message must be the 'init' message.
    if (event.data.type === 'init') {
        const { wasm_module_name, sample_rate, audio_sab: sab1, state_sab: sab2 } = event.data;

        audio_sab = sab1;
        state_view = new Int32Array(sab2);

        // 1. Define the Module object once on the worker's global scope.
        //    The Emscripten runtime will look for this exact object.
        self.Module = {
            onRuntimeInitialized: () => {
                console.log('DSP Worker: WASM runtime initialized successfully.');

                // 2. Now that the runtime is ready, we can safely wrap our C++ functions.
                cpp_generate_audio = self.Module.cwrap('generate_audio_data', 'void', ['number', 'number']);
                cpp_set_sample_rate = self.Module.cwrap('set_sample_rate', null, ['number']);

                // 3. Immediately configure the C++ code with the correct sample rate.
                cpp_set_sample_rate(sample_rate);

                // 4. Flip the flag to indicate that we are ready to process audio requests.
                isInitialized = true;

                // 5. Signal back to the main thread that we are fully ready.
                self.postMessage({ type: 'ready' });
            }
        };

        // 6. Load the Emscripten-generated JS file. This is a synchronous call that
        //    starts the asynchronous loading of the WASM file and sets up the
        //    runtime to call our onRuntimeInitialized callback when done.
        importScripts(wasm_module_name);

    } else if (event.data.type === 'request_data') {
        // Handle subsequent requests for audio data, but only if we are ready.
        if (isInitialized) {
            produceAudio();
        }
    }
};

function produceAudio() {
    const buffer_capacity = 8192;
    let read_ptr = Atomics.load(state_view, 0);
    let write_ptr = Atomics.load(state_view, 1);

    let available_space = read_ptr - write_ptr - 1;

    // Handle the ring buffer wrap-around
    if (available_space < 0) {
        available_space += buffer_capacity;
    }

    if (available_space > 0) {
        const frames_to_generate = Math.min(available_space, 2048);
        const buffer_ptr = Module._malloc(frames_to_generate * 2 * 4);

        // ================================================================
        // This calls the common C++ code to generate an actual audio to the allocated buffer.
        cpp_generate_audio(buffer_ptr, frames_to_generate);
        // ================================================================

        const wasm_audio_view = new Float32Array(Module.HEAPF32.buffer, buffer_ptr, frames_to_generate * 2);
        const shared_audio_view = new Float32Array(audio_sab);

        if (write_ptr + frames_to_generate < buffer_capacity) {
            shared_audio_view.set(wasm_audio_view, write_ptr * 2);
        } else {
            const part1_len = buffer_capacity - write_ptr;
            shared_audio_view.set(wasm_audio_view.subarray(0, part1_len * 2), write_ptr * 2);
            shared_audio_view.set(wasm_audio_view.subarray(part1_len * 2), 0);
        }

        Module._free(buffer_ptr);

        write_ptr = (write_ptr + frames_to_generate) % buffer_capacity;
        Atomics.store(state_view, 1, write_ptr);
    }
}

