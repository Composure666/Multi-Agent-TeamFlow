---
name: frame-smith
description: Design and audit Multi-Agent TeamFlow product motion using visual rhythm, state transitions, performance, and accessibility.
---

# Frame Smith Product Motion

This project adaptation focuses on product interaction motion. It does not add Remotion or create video artifacts.

## Motion goals

- Make cause and effect legible during streaming, tool calls, approvals, orchestration, artifact creation, and navigation.
- Use motion to establish hierarchy and continuity, never to decorate a busy state.
- Prefer opacity and transform; avoid layout-shifting animations and perpetual motion.

## Motion system

- `fast`: direct control feedback and icon state changes.
- `normal`: panel, message, and card entry.
- `slow`: progress completion and attention transitions.
- Every motion needs an interruption path and a `prefers-reduced-motion` fallback.

## Review checklist

1. Name the state transition and the user question it answers.
2. Define start state, end state, duration, easing, and interruption behavior.
3. Check streaming stability, scroll anchoring, focus retention, and reduced-motion output.
4. Check CPU/GPU cost and avoid animating large layout trees.
5. Validate success, warning, error, abort, reconnect, and approval states consistently.

## Multi-Agent TeamFlow constraints

- Use CSS tokens and existing Tailwind/CSS primitives before adding a dependency.
- Never hide an approval, error, or abort result behind animation.
- Keep the StreamEvent contract and Store reducer behavior unchanged.
- Verify motion at desktop, mobile, dark mode, and reduced-motion settings.
