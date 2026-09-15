```md
---
name: anti-ai-ui-workflow
description: >
  A staged UI design and implementation workflow for avoiding generic AI-generated
  interfaces. Use when designing, redesigning, prototyping, or implementing product UI.
  Forces structural divergence before implementation, establishes a product-specific
  art direction, and audits the final interface for generic SaaS/dashboard patterns.
---

# Anti-AI UI Workflow

## Purpose

This skill exists to prevent the agent from prematurely converging on common
AI-generated UI patterns such as:

- generic SaaS dashboards
- sidebar + page title + KPI cards
- card grids
- card-inside-card layouts
- excessive rounded containers
- decorative gradients
- unnecessary hero sections
- "Welcome back" headers
- meaningless statistics
- generic empty states
- excessive badges
- excessive helper copy
- visually symmetric but functionally weak layouts
- Linear / Vercel / shadcn lookalikes without product justification

The goal is not to make interfaces visually unusual for its own sake.

The goal is to make the interface feel like the natural consequence of the
product, its users, and its dominant workflows.

---

# Core Principle

Every major UI decision must have a product-specific reason.

If the explanation for a decision is:

> "Dashboards usually have this."

or:

> "This is a common modern UI pattern."

the decision is invalid.

Valid reasoning should look like:

> "The download queue stays visible because users monitor multiple long-running
> transfers while starting new ones."

or:

> "The library occupies the largest region because users spend most of their
> time inspecting downloaded media rather than configuring downloads."

---

# Mandatory Workflow

The workflow has five stages:

```text
PRODUCT TRUTH
    ↓
STRUCTURAL DIVERGENCE
    ↓
ART DIRECTION
    ↓
IMPLEMENTATION
    ↓
POLISH + ANTI-AI AUDIT
```

Do not skip stages.

Do not collapse multiple stages into one response unless the user explicitly
requests it.

---

# Stage 0 — Product Truth

Before proposing UI, determine what the product actually is.

Do not start from page names such as:

- Dashboard
- Overview
- Home
- Admin
- Management

These names strongly bias the model toward generic layouts.

Instead identify:

## Product Archetype

Examples:

- download manager
- media library
- editor
- workstation
- monitoring console
- communication client
- catalog
- control surface
- IDE
- inbox
- timeline
- scheduler

Choose the archetype from the dominant user activity, not the product category.

---

## Dominant User Intent

Identify what users spend most of their time doing.

Express it as an action.

Examples:

```text
monitor and manage long-running downloads
```

```text
browse downloaded music and occasionally add new items
```

```text
inspect active jobs and diagnose failures
```

Avoid abstract descriptions such as:

```text
manage resources
```

---

## Information Priority

Rank the information by operational importance.

Example:

```text
1. active task
2. queue
3. failures
4. library
5. historical statistics
```

Do not assume statistics deserve prominent visual treatment.

---

## Interaction Frequency

Classify key actions:

```text
constant
frequent
occasional
rare
```

High-frequency actions should normally require fewer clicks and less animation.

Rare settings should not compete visually with core work.

---

## Product Character

Define the intended character using functional language.

Good:

```text
dense
quiet
technical
operational
music-aware
persistent
```

Bad:

```text
modern
beautiful
premium
clean
sleek
```

The bad examples are too generic to guide design decisions.

---

# Stage 1 — Structural Divergence

When `prototype` is available, use it here.

The purpose of this stage is to prevent premature convergence.

Produce exactly THREE directions unless the user requests another number.

The three directions must differ structurally.

Changing only:

- colors
- radius
- typography
- illustrations
- icon style

does NOT count as a distinct direction.

Each direction must differ in at least THREE of the following:

- information architecture
- dominant workspace region
- navigation model
- content density
- interaction model
- primary visual anchor
- chronology
- panel persistence
- task flow
- hierarchy
- inspector behavior

---

## Required Output for Each Direction

For each direction provide:

### Name

Use a memorable product metaphor rather than generic labels such as:

```text
Option A
Option B
Option C
```

Prefer names such as:

```text
Workstation
Tape Deck
Library Desk
Control Room
Inbox
Workbench
Timeline
```

---

### Product Model

Describe what mental model the interface uses.

Example:

```text
The application behaves like a workstation:
active jobs, queue, and terminal remain visible simultaneously.
```

---

### Layout Structure

Describe the actual composition.

Example:

```text
narrow navigation
+
central queue
+
persistent right terminal
```

---

### Dominant Region

Identify which area visually owns the interface.

There must normally be one dominant region.

Avoid equal-weight component grids unless the product genuinely requires them.

---

### Interaction Axis

Examples:

```text
parallel monitoring
```

```text
linear progression
```

```text
content-first browsing
```

---

### Density

Give a relative value:

```text
low
medium
high
very high
```

Explain why.

---

### Product-specific advantage

Explain what workflow this direction optimizes.

---

### Tradeoff

Every direction must have a downside.

If all three directions are presented as equally perfect, the analysis is too
generic.

---

# Stage 1 Gate

STOP after proposing the three structural directions.

Do NOT implement the final interface.

Do NOT create production code.

Do NOT silently choose a direction.

Wait for the user to select one.

Prototype HTML may only be created when the user explicitly requests a prototype
or comparison demo.

---

# Stage 2 — Art Direction

After the user chooses a structural direction, establish the final design
language.

When `gpt-taste` is available, use it here.

Do not redesign the chosen information architecture unless a serious usability
problem is discovered.

The purpose of this stage is:

```text
make the chosen structure distinctive
without making it decorative
```

---

# Art Direction Requirements

Define:

## Visual Hierarchy

State explicitly:

```text
what users see first
what they see second
what remains peripheral
```

There should normally be one clear visual anchor.

---

## Density Strategy

Do not apply the same spacing everywhere.

Define:

```text
dense zones
normal zones
breathing zones
```

Operational interfaces often benefit from uneven density.

---

## Surface Strategy

Before creating a container, ask:

> Does this region require visual containment?

Prefer:

- whitespace
- alignment
- dividers
- rows
- table structure
- typographic hierarchy

before introducing a card.

Cards must have a semantic reason.

---

## Radius Strategy

Do not define one universal radius for everything.

Different containment types may use different radius values.

Example:

```text
table rows       0–4px
inputs           5–6px
buttons          5–6px
panels           6–8px
dialogs          10–12px
pills            999px only when semantically appropriate
```

---

## Color Strategy

Every strong color must communicate one of:

```text
action
selection
state
warning
identity
```

Do not use strong colors only to make the interface appear designed.

---

## Typography Strategy

Typography should create hierarchy before borders and backgrounds do.

Avoid excessive:

- uppercase labels
- tracking
- monospace
- muted subtitles

Monospace should normally indicate technical data rather than decoration.

---

# Anti-Slop Constraints

Unless product requirements explicitly justify them, avoid:

```text
four equal KPI cards
hero sections inside applications
large centered page introductions
gradient text
ambient gradient blobs
glassmorphism everywhere
icon-in-colored-circle decoration
large empty-state illustrations
oversized cards
nested cards
pills for ordinary metadata
badges for ordinary text
purple as universal interaction color
green used decoratively
fake analytics
fake charts
fake growth percentages
"Welcome back"
"Quick actions"
"Recent activity" as filler
```

---

# Reference Use

When screenshots or visual references are available, do NOT imitate them as a
whole.

Decompose references by dimension.

Example:

```text
Information architecture → Transmission
Content density          → Apple Music
Inspector behavior       → GitHub Desktop
Motion                    → Emil Kowalski principles
```

Do not merge multiple references into an aesthetic collage.

Each reference must have a specific responsibility.

---

# Stage 2 Deliverable

Before implementation, produce a concise design contract containing:

```text
Product archetype
Dominant user intent
Chosen structural direction
Primary visual anchor
Navigation model
Density strategy
Surface strategy
Color semantics
Typography strategy
Interaction model
Explicit anti-patterns
```

This contract becomes the source of truth for implementation.

---

# Stage 3 — Implementation

Only implement after Stage 2 is complete.

Do not reinterpret the chosen design into a generic component library layout.

Componentization happens AFTER layout decisions.

Think:

```text
composition → structure → components
```

not:

```text
components → grid → page
```

---

# Implementation Rules

Prefer the smallest component set necessary.

Do not create components merely because something could theoretically be
reusable.

Avoid abstractions such as:

```text
StatCard
InfoCard
ActionCard
GenericPanel
DashboardSection
```

unless the product genuinely contains repeated semantic structures.

Prefer domain-specific components:

```text
DownloadQueue
TrackRow
JobInspector
TransferLog
PlaylistRail
CurrentTransfer
```

Domain-specific components help preserve product identity.

---

# Content Requirements

Use realistic domain content.

Do not use:

```text
Lorem ipsum
Metric A
Project Alpha
Task 1
User 1
```

Realistic content affects layout and is part of the design.

---

# Layout Rule

Do not force symmetry.

Content determines width.

Examples:

```text
a log panel may be narrow
a library table may dominate the screen
a navigation rail may be very narrow
a current-task region may intentionally consume disproportionate space
```

Visual imbalance is acceptable when it reflects information hierarchy.

---

# Stage 4 — Interaction Polish

After implementation, use `emil-design-eng` when available.

At this stage, do not redesign the page structure.

Focus on:

- hover
- focus
- pressed state
- selection
- keyboard behavior
- menus
- popovers
- transitions
- drag interactions
- loading
- progress changes
- state changes
- error feedback
- success feedback

---

# Motion Budget

Motion must communicate:

```text
cause
continuity
state
hierarchy
```

Do not animate merely to make the interface feel premium.

High-frequency operations should use little or no motion.

Recommended durations:

```text
hover          80–140ms
press          immediate
small menu     120–180ms
popover        140–200ms
panel          160–240ms
dialog         180–260ms
```

Avoid routine UI animation above 300ms.

---

# Interaction Rules

## Hover

Prefer changes in:

```text
background
border
foreground
opacity
```

Avoid scale transforms on ordinary rows and buttons.

---

## Press

Feedback should be immediate.

Never wait for a transition before performing an action.

---

## Progress

Progress changes should feel continuous but should not glow or pulse unless
attention is required.

---

## Popovers

Popovers should originate visually from their trigger.

Avoid floating disconnected overlays.

---

## Keyboard

For desktop productivity applications, keyboard behavior is part of the design.

Consider:

- focus order
- Escape
- Enter
- arrow keys
- shortcuts
- command palette

when appropriate.

---

# Stage 5 — Anti-AI Audit

After implementation and polish, perform a separate audit.

Do not evaluate only correctness.

Evaluate whether the interface has fallen back into model defaults.

---

# AI Smell Test

Ask the following questions.

## 1. Product Replacement Test

Could the product name be replaced with:

```text
AI platform
CRM
analytics tool
VPN client
Docker manager
finance dashboard
```

without changing most of the layout?

If YES, product identity is too weak.

---

## 2. Template Test

Does the page resemble:

```text
sidebar
page title
subtitle
four cards
chart
recent activity
```

without a strong product reason?

If YES, redesign.

---

## 3. Card Test

Can two or more cards be replaced with:

```text
rows
dividers
typography
spacing
```

without reducing clarity?

If YES, remove the cards.

---

## 4. Rationale Test

For every major region, ask:

> Why does this exist?

If the answer is aesthetic rather than functional, reconsider it.

---

## 5. Deletion Test

Remove approximately 20% of decorative UI elements.

If usability remains unchanged and the interface improves, the original version
was over-designed.

---

## 6. Screenshot Test

Look at the interface at normal zoom.

Ignore individual components.

Ask:

```text
What is the first shape I see?
What is the dominant visual mass?
Where does my eye go first?
Does that match the primary task?
```

If everything has equal visual weight, hierarchy is weak.

---

## 7. Repetition Test

Check whether these values appear mechanically everywhere:

```text
same radius
same padding
same panel background
same gap
same border
same icon treatment
```

Excessive consistency can make the interface feel generated.

Consistency should follow semantics, not arithmetic.

---

## 8. Text Test

Delete explanatory copy that merely describes obvious UI.

Examples:

```text
Manage your downloads here
View and manage your music library
Welcome back
Here are your recent tasks
```

Product interfaces should usually explain less than marketing pages.

---

# Final Audit Output

After auditing, report only meaningful findings.

Classify each as:

```text
KEEP
CHANGE
REMOVE
```

Prioritize structural problems over cosmetic ones.

Do not spend time adjusting 1px spacing while the page still uses the wrong
information architecture.

---

# Skill Responsibilities

When other skills are available:

```text
prototype
    → structural divergence

gpt-taste
    → art direction and anti-slop design decisions

emil-design-eng
    → interaction and motion polish

anti-ai-ui-workflow
    → orchestration, gates, rationale, and final audit
```

This skill has authority over workflow order.

The other skills refine specific stages.

---

# Default Response Behavior

When the user asks:

```text
design a page
redesign this page
make this UI
create an interface
build a dashboard
```

do NOT immediately generate final production code.

Unless the user explicitly asks for direct implementation:

1. extract Product Truth
2. propose three structurally distinct directions
3. explain their tradeoffs
4. stop and wait for selection

After selection:

5. establish the design contract
6. implement
7. polish interactions
8. perform the anti-AI audit

---

# Exception

If the user explicitly says:

```text
implement this exact design
```

or provides an already-finalized layout/specification, skip structural
divergence.

Still perform:

```text
Art Direction check
Implementation
Interaction polish
Anti-AI audit
```

Do not unnecessarily redesign an already approved structure.

---

# Success Criteria

A successful result should feel like:

> software designed for this specific job

not:

> a polished template adapted to this job

The interface should remain recognizable even if:

- the logo is hidden
- the product name is removed
- the accent color is changed

Its identity should come primarily from:

```text
information architecture
workflow
density
content
interaction
```

not decoration.
```