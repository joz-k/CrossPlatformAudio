// This is the dedicated DSP thread.

// These are null until the WASM module is fully initialized inside this worker.
let isInitialized = false;
let cpp_generate_audio = null;
let cpp_set_sample_rate = null;
let audio_sab = null;
let state_view = null;
let BUFFER_CAPACITY_FRAMES = 0;
let HIGH_WATER_MARK_FRAMES = 0;

// The single message handler for the worker's entire lifetime.
self.onmessage = (event) => {
    // The first message must be the 'init' message.
    if (event.data.type === 'init') {
        const { wasm_module_name, sample_rate, audio_sab: sab1, state_sab: sab2 } = event.data;
        audio_sab = sab1;
        state_view = new Int32Array(sab2);
        BUFFER_CAPACITY_FRAMES = new Float32Array(audio_sab).length / 2; // e.g., 8192

        // Define the High Water Mark. We want to keep the buffer at least 75% full.
        HIGH_WATER_MARK_FRAMES = BUFFER_CAPACITY_FRAMES * 0.75;

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
    let read_ptr = Atomics.load(state_view, 0);
    let write_ptr = Atomics.load(state_view, 1);

    let available_frames = write_ptr - read_ptr;
    if (available_frames < 0) available_frames += BUFFER_CAPACITY_FRAMES;

    // Calculate how many frames we need to generate to reach the high water mark.
    let frames_to_generate = Math.floor(HIGH_WATER_MARK_FRAMES - available_frames);

    if (frames_to_generate <= 0) {
        // The buffer is already full enough, no need to do anything.
        self.postMessage({ type: 'data_produced' }); // Tell the worklet it can request again if needed.
        return;
    }

    // Ensure we don't try to write more than the available free space.
    let available_space = read_ptr - write_ptr - 1;
    if (available_space < 0) available_space += BUFFER_CAPACITY_FRAMES;
    frames_to_generate = Math.min(frames_to_generate, available_space);

    if (frames_to_generate > 0) {
        const buffer_ptr = Module._malloc(frames_to_generate * 2 * 4);

        // ================================================================
        // This calls the common C++ code to generate an actual audio to the allocated buffer.
        cpp_generate_audio(buffer_ptr, frames_to_generate);
        // ================================================================

        const wasm_audio_view = new Float32Array(Module.HEAPF32.buffer, buffer_ptr, frames_to_generate * 2);
        const shared_audio_view = new Float32Array(audio_sab);

        if (write_ptr + frames_to_generate < BUFFER_CAPACITY_FRAMES) {
            shared_audio_view.set(wasm_audio_view, write_ptr * 2);
        } else {
            const part1_len = BUFFER_CAPACITY_FRAMES - write_ptr;
            shared_audio_view.set(wasm_audio_view.subarray(0, part1_len * 2), write_ptr * 2);
            shared_audio_view.set(wasm_audio_view.subarray(part1_len * 2), 0);
        }

        Module._free(buffer_ptr);
        write_ptr = (write_ptr + frames_to_generate) % BUFFER_CAPACITY_FRAMES;
        Atomics.store(state_view, 1, write_ptr);
    }

    // Tell the worklet that we are done producing for now.
    self.postMessage({ type: 'data_produced' });
}
