# Lessons from Extendead

## Root failure — do not reproduce

The window was hardlocked to screen centre. No Tauri config patch or shell-level override 
could make it reliably draggable to an arbitrary position. The drag region and input focus 
competed for the same event layer — every fix to one broke the other.

## Hard constraints carried forward

- Set window position explicitly at creation: x: 400, y: 200 in tauri.conf.json
- Never rely on OS default window placement
- Drag region and input must be separate non-overlapping elements from day one
- Provide both -webkit-app-region: drag CSS zone AND a Tauri startDragging() fallback
- Drag must be the first thing tested before any other feature is considered working
- Do not patch window behaviour after the fact — get it right in the initial config

## Rule

If drag is broken, nothing else matters. Drag is the first milestone. 
No feature is considered done until drag still works after it is added.