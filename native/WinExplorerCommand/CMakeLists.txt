cmake_minimum_required(VERSION 3.21)
project(ReforkedExplorerCommand LANGUAGES CXX RC)

if(NOT WIN32)
  message(FATAL_ERROR "Windows is required.")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/shell.properties" MENU_TITLE_LINE REGEX "^menu.open.folder=")
string(REGEX REPLACE "^menu.open.folder=" "" MENU_TITLE "${MENU_TITLE_LINE}")
file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/shell.properties" FILE_MENU_TITLE_LINE REGEX "^menu.edit.file=")
string(REGEX REPLACE "^menu.edit.file=" "" FILE_MENU_TITLE "${FILE_MENU_TITLE_LINE}")
configure_file(resources.rc.in resources.rc @ONLY)

add_library(reforked-shell SHARED explorer_command.cpp exports.def "${CMAKE_CURRENT_BINARY_DIR}/resources.rc")
target_compile_definitions(reforked-shell PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
target_compile_options(reforked-shell PRIVATE /W4 /WX /permissive- /guard:cf /sdl /external:anglebrackets /external:W0)
target_link_options(reforked-shell PRIVATE /guard:cf /DYNAMICBASE /NXCOMPAT)
target_link_libraries(reforked-shell PRIVATE ole32 shell32 shlwapi runtimeobject)
