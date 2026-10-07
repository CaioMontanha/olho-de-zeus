---
name: Zeus Telemetry System
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#ab0b1c'
  on-tertiary: '#ffffff'
  tertiary-container: '#cf2c30'
  on-tertiary-container: '#ffecea'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  code-metric:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.03em
  code-body:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 1.75rem
---

## Brand & Style

This design system targets Site Reliability Engineers (SRE), incident commanders, and platform engineers within mission-critical fintech and payment gateway infrastructures. The interface prioritizes calm authority, immediate diagnostic legibility, and high-density technical telemetry. 

The aesthetic is precision-driven Corporate Modern with technical instrument accents:
- **Calm under pressure:** Controlled visual noise, deliberate functional colors, and structured grid lines that prevent cognitive fatigue during major outages (SEV-0/SEV-1).
- **Technical Rigor:** Strict data density using tabular numeric data, structured monospaced telemetry, and micro-badges that surface SLA degradations instantly.
- **Surface Contrast:** High-contrast crispness relying on chalk-white cards stacked over a cool slate canvas (#F5F7FA), segmented with micro-borders.

## Colors

The palette is engineered around instant semantic classification and WCAG AAA compliance for critical metrics:

- **Primary (`#2563EB` / `#3B82F6`):** Precision Tech Blue. Reserved for primary telemetry drill-downs, active states, active filters, and primary incident triggers.
- **Operational (`#10B981`):** Emerald Green. Designates 99.99%+ uptime, operational clusters, and settled health checks. Paired with background tint `#ECFDF5` and stroke `#A7F3D0`.
- **Degraded (`#F59E0B`):** Warning Amber. Denotes latency spikes, circuit-breaker half-open states, and packet throttling. Paired with background tint `#FFFBEB` and stroke `#FDE68A`.
- **Down / Critical (`#EF4444`):** Crimson Alert. Applied to failing endpoints, hard payment drop-offs, and critical timeouts. Paired with background tint `#FEF2F2` and stroke `#FECACA`.
- **Neutral Surface & Canvas:** Background canvas is `#F5F7FA` (cool slate-grey), panel containers are strictly `#FFFFFF`, with borders stabilized at `#E2E8F0` and secondary text structured in `#64748B`.

## Typography

The typography couples the universal clarity of **Inter** for narrative hierarchy with the exactness of **JetBrains Mono** for metrics, latencies, HTTP verbs, payload traces, and API URIs.

- **Proportional Metrics (`font-feature-settings: "cv02", "cv03", "tnum"`):** Standard Inter uses tabular figures (`tnum`) across all monitoring tables to prevent jitter during real-time web-socket updates.
- **Monospaced Data:** JetBrains Mono is strictly enforced for timestamps (ISO 8601), p95/p99 latency calculations, IP addresses, trace IDs, and endpoint paths (`/v1/charges/authorize`).
- **Scale Restraint:** Display sizes are capped at 32px to maximize data visibility per square inch.

## Layout & Spacing

The layout is architected around an adaptive, fluid-grid workspace optimized for high-resolution desktop war-rooms (1440px - 2560px) while maintaining vertical responsiveness on mobile incident response terminals:

- **Desktop (12-column Grid):** 24px margins, 16px to 24px gutters. Core dashboards utilize a 3-tier arrangement: summary KPI strip (4 columns × 3), main real-time telemetry split (8-column time-series + 4-column active incident feed), followed by a 12-column detailed endpoint breakdown.
- **Tablet / Laptop (8-column Grid):** 16px gutters and margins. Side panels dock to expandable overlays.
- **Mobile (4-column Grid):** 16px margins, vertical stack. Telemetry cards collapse latency charts into micro sparklines.
- **Spacing Rhythm:** Internal card padding is compact (`space-lg` = 20px) to maximize viewable metrics without requiring excessive page scrolling.

## Elevation & Depth

Visual depth avoids dramatic drop shadows in favor of crisp low-contrast delineations, preventing visual mud in data-heavy screens:

- **Base Layer (Canvas):** `#F5F7FA`. Neutral foundation for all structural layouts.
- **Surface Layer (Cards & Panels):** Pure `#FFFFFF` resting on the canvas, bounded by a 1px solid `#E2E8F0` border.
- **Subtle Elevation (`shadow-card`):** `0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)`. Used on dashboard panels and data tables.
- **Active Elevation (`shadow-hover`):** `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`. Applied on hover states for interactive endpoint rows.
- **Overlay Layer (`shadow-modal`):** `0 10px 15px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -4px rgba(15, 23, 42, 0.05)`. For drawer slide-outs containing raw JSON traces and logs.

## Shapes

The design system standardizes on a precise 10px to 12px geometric curve radius:

- **Primary Panels and Cards:** Fixed at `12px` (equivalent to `rounded-lg`). Creates a modern, approachable container that softens dense technical data.
- **Buttons, Text Inputs, and Dropdowns:** Standardized at `8px` (`0.5rem`) for compact operational control.
- **Telemetry Badges and Tags:** `6px` (`rounded-sm`) for compact visual metadata.
- **Progress Bars and Status Dots:** Status pills and live indicator pulses use full-round borders (`rounded-full` / `9999px`).

## Components

### Buttons
- **Primary:** Background `#2563EB`, text `#FFFFFF`, hover `#1D4ED8`. Font: `Inter` 13px weight 500. Height 36px, horizontal padding 14px. Focus ring: 2px `#93C5FD` offset by 2px.
- **Secondary / Ghost:** Background `#FFFFFF`, border 1px solid `#E2E8F0`, text `#1E293B`, hover `#F8FAFC`.
- **Critical Action:** Background `#EF4444`, text `#FFFFFF`, hover `#DC2626`. Used strictly for "Declare Incident" or "Initiate Failover".

### Status Badges & Chips
- **Operational:** Background `#ECFDF5`, text `#065F46`, border 1px solid `#A7F3D0`. Includes a 6px pulsing green dot.
- **Degraded:** Background `#FFFBEB`, text `#92400E`, border 1px solid `#FDE68A`.
- **Down / Critical:** Background `#FEF2F2`, text `#991B1B`, border 1px solid `#FECACA`.
- **HTTP Methods:** JetBrains Mono 11px uppercase badge. `GET` (`#EFF6FF` / text `#1D4ED8`), `POST` (`#F0FDF4` / text `#15803D`), `DELETE` (`#FEF2F2` / text `#B91C1C`).

### Data Tables & Lists
- Table header: `#F8FAFC`, uppercase JetBrains Mono 11px, letter-spacing 0.05em, text `#64748B`.
- Row height: 44px, bottom border 1px solid `#F1F5F9`. Hover highlight: `#F8FAFC`. Numeric latency columns right-aligned in monospaced font.

### Cards & Panels
- Background `#FFFFFF`, border 1px solid `#E2E8F0`, border-radius 12px, shadow `0 1px 3px rgba(0,0,0,0.05)`.
- Internal sections are separated by horizontal rules using `#F1F5F9`.

### Specialized Telemetry Elements
- **Health Bars:** Segmented latency/uptime history (90-day ribbons) composed of 2px wide vertical bars, separated by 1px gaps, with tooltips surfacing latency and HTTP success rates.
- **Latency Sparklines:** High-precision SVG curves using stroke `#2563EB` with a gradient area fill fading into `#EFF6FF` (opacity 0.2).