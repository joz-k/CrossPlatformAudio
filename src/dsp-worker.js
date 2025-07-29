// This is the dedicated DSP thread.

// These are null until the WASM module is fully initialized inside this worker.
let isInitialized = false;
let audio_sab = null;
let state_view = null;
let Module = {};

// The single message handler for the worker's entire lifetime.
self.onmessage = (event) => {
    // The first message must be the 'init' message.
    if (event.data.type === 'init') {
        const { wasm_module_name, audio_sab: sab1, state_sab: sab2 } = event.data;
        audio_sab = sab1;
        state_view = new Int32Array(sab2);
        self.Module = { onRuntimeInitialized: () => { isInitialized = true; self.postMessage({ type: 'ready' }); } };

    } else if (event.data.type === 'request_data') {
        // Handle subsequent requests for audio data, but only if we are ready.
        if (isInitialized) produceAudio(event.data.cpp_func);
    }
};

function produceAudio(cpp_generate_audio_func) {
    if (!cpp_generate_audio_func) return; // Safety check
    const buffer_capacity = 8192;
    let read_ptr = Atomics.load(state_view, 0);
    let write_ptr = Atomics.load(state_view, 1);
    // Ensure we don't try to write more than the available free space.
    let available_space = read_ptr - write_ptr - 1;
    if (available_space < 0) available_space += buffer_capacity;
    if (available_space > 0) {
        const frames_to_generate = Math.min(available_space, 2048);
        const buffer_ptr = Module._malloc(frames_to_generate * 2 * 4);
        // ================================================================
        // This calls the common C++ code to generate an actual audio to the allocated buffer.
        cpp_generate_audio_func(buffer_ptr, frames_to_generate);
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
