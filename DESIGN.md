# Design System

## Overview

AIM Web uses a product register with a restrained, warm-dark-first methodology hub. The physical scene is a Director reviewing autonomous baseline convergence in a quiet late-evening planning session on a laptop or external monitor, needing calm authority, dense evidence, and clear intervention points without terminal noise. Light mode remains accessible for daytime review.

## Color

Use OKLCH tokens for new color decisions. The palette is restrained: tinted warm neutrals carry most surfaces, with one amber/lime-cyan accent vocabulary reserved for state, focus, primary action, and selected navigation. Avoid pure black and pure white in new colors.

Core roles:

- `--lyra-background`: warm graphite application background.
- `--lyra-card`: elevated analysis surface.
- `--lyra-card-strong`: denser evidence panels, tables, and graph nodes.
- `--lyra-primary`: selected navigation, primary action, and active focus.
- `--status-*`: state semantics only, not decoration.

## Typography

Use the existing system sans stack. Product UI uses compact hierarchy, not display typography. Body copy should stay concise and below 75ch where prose appears. Headings use weight and scale contrast, but avoid oversized marketing hero treatment.

## Layout

The default shell is a methodology hub: header for orientation, a compact navigation row, a main evidence column, and a Director review rail on wide screens. Cards are used only for bounded evidence groups. Avoid nested card grids and repeated identical metric tiles where a rail or list provides clearer rhythm.

## Components

Buttons, inputs, selects, cards, badges, and theme controls stay on shared Shadcn-style primitives. Interactive states must include hover, focus, disabled, and loading where applicable. Loading uses skeleton-like content frames when possible; errors and empty states should explain what the Director can do next.

## Motion

Keep motion short and state-driven, 150ms to 250ms. Do not animate layout properties or add decorative page-load choreography.

## Accessibility

Maintain WCAG AA contrast, semantic landmarks, labelled navigation, keyboard-operable rows and graph nodes, visible focus rings, and responsive behavior that preserves the Director review sequence on narrow screens.
