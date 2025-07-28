# CMake minimum version
cmake_minimum_required(VERSION 3.22)

# Project definition
project(CrossPlatformAudio LANGUAGES CXX)

# Set C++ standard to C++23
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# --- Source Files ---
set(PROJECT_SOURCES
    src/Main.cpp
    src/WebAudioEngine.cpp
)

# --- Emscripten (WebAssembly) Build ---
if(EMSCRIPTEN)
    message(STATUS "Emscripten build detected. Configuring for WebAssembly.")

    add_executable(CrossPlatformAudio ${PROJECT_SOURCES})

    set_target_properties(CrossPlatformAudio PROPERTIES
        SUFFIX ".html"
    )

    # Copy all necessary worker files to the output directory
    file(COPY
        "${CMAKE_CURRENT_SOURCE_DIR}/src/audioworklet-processor.js"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/dsp-worker.js"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/coop-coep-sw.js"
        DESTINATION "${CMAKE_BINARY_DIR}")

    target_link_options(CrossPlatformAudio PRIVATE
        "--shell-file" "${CMAKE_CURRENT_SOURCE_DIR}/src/shell.html"
        "--bind"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,HEAPF32,callMain"
        "-sEXPORTED_FUNCTIONS=_malloc,_free,_main,_generate_audio_data,_set_sample_rate"
    )

# --- Native (PortAudio) Build ----
else()
    message(STATUS "Native build detected.")

    # Compile PortAudio library
    set(PA_BUILD_TESTS OFF CACHE BOOL "Disable tests" FORCE)
    set(PA_BUILD_EXAMPLES OFF CACHE BOOL "Disable examples" FORCE)
    set(PA_BUILD_SHARED OFF CACHE BOOL "Build PortAudio as static library" FORCE)
    add_subdirectory(lib/portaudio)

    # Add PortAudioEngine source files
    list(APPEND PROJECT_SOURCES
        src/PortAudioEngine.cpp
    )

    # Create the executable target
    add_executable(CrossPlatformAudio ${PROJECT_SOURCES})

    # Link PortAudio library
    target_link_libraries(CrossPlatformAudio PRIVATE portaudio)

endif()

# --- Common Settings ---
# Add src directory to include path for all targets
target_include_directories(CrossPlatformAudio PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src")

