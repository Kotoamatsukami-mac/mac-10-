// Phase 4 Slice 3 — Volume executor
//
// Bounded CoreAudio surface for system audio output volume. Five commands:
//
//   executor_set_volume   — clamped 0..100, mapped to 0.0..1.0 scalar
//   executor_set_mute     — toggle mute on the default output device
//   executor_step_volume  — relative delta in 0..100 percent units
//
// We intentionally hand-roll a minimal FFI surface against CoreAudio's HAL
// instead of pulling in a full coreaudio-sys crate. The surface here is:
//   - kAudioObjectSystemObject + kAudioHardwarePropertyDefaultOutputDevice
//   - kAudioDevicePropertyVolumeScalar (per channel, scope=output, element=master)
//   - kAudioDevicePropertyMute (per device, scope=output, element=master)
//
// Channel handling: most output devices expose the master volume on element 0
// of the output scope. Many also expose left/right channels on elements 1/2.
// We try the master element first; if that is not settable, we fall back to
// writing both channel elements. This matches the behaviour of the OS's
// volume slider.
//
// All operations are reversible. No destructive surface is introduced.

#![allow(non_upper_case_globals)]

use serde::Serialize;
use std::os::raw::c_void;

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum VolumeExecutorError {
    AudioUnavailable { detail: String },
}

impl std::fmt::Display for VolumeExecutorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AudioUnavailable { detail } => write!(f, "audio unavailable: {detail}"),
        }
    }
}

// ─── CoreAudio FFI ──────────────────────────────────────────────────────────
//
// Subset of <CoreAudio/AudioHardware.h> we need. The types and constants
// match Apple's headers. The system framework is linked via Tauri's default
// macOS link line; if cargo ever stops auto-linking it we add #[link].

type OSStatus = i32;
type AudioObjectID = u32;
type AudioObjectPropertySelector = u32;
type AudioObjectPropertyScope = u32;
type AudioObjectPropertyElement = u32;

#[repr(C)]
struct AudioObjectPropertyAddress {
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    element: AudioObjectPropertyElement,
}

const kAudioObjectSystemObject: AudioObjectID = 1;

// Four-character codes assembled big-endian per Apple's convention.
const fn fourcc(s: &[u8; 4]) -> u32 {
    ((s[0] as u32) << 24) | ((s[1] as u32) << 16) | ((s[2] as u32) << 8) | (s[3] as u32)
}

const kAudioHardwarePropertyDefaultOutputDevice: AudioObjectPropertySelector = fourcc(b"dOut");
const kAudioDevicePropertyVolumeScalar: AudioObjectPropertySelector = fourcc(b"volm");
const kAudioDevicePropertyMute: AudioObjectPropertySelector = fourcc(b"mute");
const kAudioObjectPropertyScopeOutput: AudioObjectPropertyScope = fourcc(b"outp");
const kAudioObjectPropertyScopeGlobal: AudioObjectPropertyScope = fourcc(b"glob");
const kAudioObjectPropertyElementMain: AudioObjectPropertyElement = 0;

#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
    fn AudioObjectGetPropertyData(
        object: AudioObjectID,
        address: *const AudioObjectPropertyAddress,
        in_qualifier_size: u32,
        in_qualifier_data: *const c_void,
        io_data_size: *mut u32,
        out_data: *mut c_void,
    ) -> OSStatus;

    fn AudioObjectSetPropertyData(
        object: AudioObjectID,
        address: *const AudioObjectPropertyAddress,
        in_qualifier_size: u32,
        in_qualifier_data: *const c_void,
        in_data_size: u32,
        in_data: *const c_void,
    ) -> OSStatus;

    fn AudioObjectHasProperty(
        object: AudioObjectID,
        address: *const AudioObjectPropertyAddress,
    ) -> bool;

    fn AudioObjectIsPropertySettable(
        object: AudioObjectID,
        address: *const AudioObjectPropertyAddress,
        out_settable: *mut bool,
    ) -> OSStatus;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn default_output_device() -> Result<AudioObjectID, VolumeExecutorError> {
    let address = AudioObjectPropertyAddress {
        selector: kAudioHardwarePropertyDefaultOutputDevice,
        scope: kAudioObjectPropertyScopeGlobal,
        element: kAudioObjectPropertyElementMain,
    };
    let mut device_id: AudioObjectID = 0;
    let mut size = std::mem::size_of::<AudioObjectID>() as u32;
    // SAFETY: Calling Apple's CoreAudio C API with a valid stack-allocated
    // address and a properly-sized output buffer.
    let status = unsafe {
        AudioObjectGetPropertyData(
            kAudioObjectSystemObject,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut device_id as *mut _ as *mut c_void,
        )
    };
    if status != 0 {
        return Err(VolumeExecutorError::AudioUnavailable {
            detail: format!("failed to read default output device (OSStatus {status})"),
        });
    }
    if device_id == 0 {
        return Err(VolumeExecutorError::AudioUnavailable {
            detail: "no default output device".to_string(),
        });
    }
    Ok(device_id)
}

fn property_settable(device: AudioObjectID, address: &AudioObjectPropertyAddress) -> bool {
    // SAFETY: Address is a valid stack reference; out_settable is a stack bool.
    unsafe {
        if !AudioObjectHasProperty(device, address) {
            return false;
        }
        let mut settable = false;
        let status = AudioObjectIsPropertySettable(device, address, &mut settable);
        status == 0 && settable
    }
}

fn write_volume_scalar(
    device: AudioObjectID,
    element: AudioObjectPropertyElement,
    scalar: f32,
) -> bool {
    let address = AudioObjectPropertyAddress {
        selector: kAudioDevicePropertyVolumeScalar,
        scope: kAudioObjectPropertyScopeOutput,
        element,
    };
    if !property_settable(device, &address) {
        return false;
    }
    // SAFETY: scalar lives on the stack for the duration of the call.
    let status = unsafe {
        AudioObjectSetPropertyData(
            device,
            &address,
            0,
            std::ptr::null(),
            std::mem::size_of::<f32>() as u32,
            &scalar as *const _ as *const c_void,
        )
    };
    status == 0
}

fn read_volume_scalar(device: AudioObjectID, element: AudioObjectPropertyElement) -> Option<f32> {
    let address = AudioObjectPropertyAddress {
        selector: kAudioDevicePropertyVolumeScalar,
        scope: kAudioObjectPropertyScopeOutput,
        element,
    };
    // SAFETY: Address is valid; out buffer is a sized f32 on the stack.
    unsafe {
        if !AudioObjectHasProperty(device, &address) {
            return None;
        }
        let mut value: f32 = 0.0;
        let mut size = std::mem::size_of::<f32>() as u32;
        let status = AudioObjectGetPropertyData(
            device,
            &address,
            0,
            std::ptr::null(),
            &mut size,
            &mut value as *mut _ as *mut c_void,
        );
        if status != 0 {
            return None;
        }
        Some(value)
    }
}

fn current_output_volume(device: AudioObjectID) -> Option<f32> {
    if let Some(v) = read_volume_scalar(device, kAudioObjectPropertyElementMain) {
        return Some(v);
    }
    // Average channels 1 and 2 if the master element is not readable.
    let l = read_volume_scalar(device, 1);
    let r = read_volume_scalar(device, 2);
    match (l, r) {
        (Some(l), Some(r)) => Some((l + r) / 2.0),
        (Some(v), None) | (None, Some(v)) => Some(v),
        _ => None,
    }
}

fn apply_output_volume(device: AudioObjectID, scalar: f32) -> bool {
    // Try master first; fall back to per-channel.
    if write_volume_scalar(device, kAudioObjectPropertyElementMain, scalar) {
        return true;
    }
    let l = write_volume_scalar(device, 1, scalar);
    let r = write_volume_scalar(device, 2, scalar);
    l || r
}

// ─── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn executor_set_volume(level: i32) -> Result<(), VolumeExecutorError> {
    // Clamp once more at the Rust boundary as defence in depth — TS already
    // clamps to 0..100 in the resolver.
    let clamped = level.clamp(0, 100);
    let scalar = clamped as f32 / 100.0;
    let device = default_output_device()?;
    if !apply_output_volume(device, scalar) {
        return Err(VolumeExecutorError::AudioUnavailable {
            detail: "output volume property is not settable on this device".to_string(),
        });
    }
    Ok(())
}

#[tauri::command]
pub fn executor_set_mute(mute: bool) -> Result<(), VolumeExecutorError> {
    let device = default_output_device()?;
    let address = AudioObjectPropertyAddress {
        selector: kAudioDevicePropertyMute,
        scope: kAudioObjectPropertyScopeOutput,
        element: kAudioObjectPropertyElementMain,
    };
    if !property_settable(device, &address) {
        return Err(VolumeExecutorError::AudioUnavailable {
            detail: "mute property not settable on this device".to_string(),
        });
    }
    let value: u32 = if mute { 1 } else { 0 };
    // SAFETY: value lives on the stack for the duration of the call.
    let status = unsafe {
        AudioObjectSetPropertyData(
            device,
            &address,
            0,
            std::ptr::null(),
            std::mem::size_of::<u32>() as u32,
            &value as *const _ as *const c_void,
        )
    };
    if status != 0 {
        return Err(VolumeExecutorError::AudioUnavailable {
            detail: format!("set_mute failed (OSStatus {status})"),
        });
    }
    Ok(())
}

#[tauri::command]
pub fn executor_step_volume(delta: i32) -> Result<(), VolumeExecutorError> {
    let device = default_output_device()?;
    let current =
        current_output_volume(device).ok_or_else(|| VolumeExecutorError::AudioUnavailable {
            detail: "could not read current volume".to_string(),
        })?;
    // delta is in 0..100 percent units; scale to 0..1 and clamp.
    let next = (current + (delta as f32) / 100.0).clamp(0.0, 1.0);
    if !apply_output_volume(device, next) {
        return Err(VolumeExecutorError::AudioUnavailable {
            detail: "output volume property not settable on this device".to_string(),
        });
    }
    Ok(())
}
