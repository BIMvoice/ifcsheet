# IfcSheet

**Drawings and documentation from IFC models, in the browser. For architects, engineers and BIM coordinators who deliver openBIM.**

IfcSheet opens an existing IFC model and produces the plans, sections, elevations and sheets that go with it. You dimension, tag, hatch and annotate on the views, lay them out on A0 to A4 sheets, and export to PDF, SVG or DXF. The model itself is never changed structurally. Only its properties can be edited.

## Why it exists

We work in native IFC. We model in Bonsai, and the model is the IFC file itself, with nothing to export and nothing lost on the way. That part works.

Then the project needs drawings. Plans, sections, dimensions, tags, sheets with a title block, a PDF set for the site and for the authority. Getting that out of Bonsai is where our days went. Setting up a drawing takes many steps, annotation is slow, and a small change to the model can mean redoing work on the sheet. Bonsai does a great deal and we contribute to it, but producing a drawing set with it was the most painful part of our job.

So we built the tool we wanted for that one part. IfcSheet opens the IFC you already have and does drawings and nothing else: draw, dimension and tag the way you would in a CAD program, put the views on sheets, print. Tags follow elements by GlobalId, so renaming an element updates every tag that points to it.

It is open source for the same reason we use IFC: the drawings of a building should not depend on a file only one vendor's tool can read.

## What you can do today

**Views**
- Open an IFC model and work from the Project Navigator.
- Create floor plans, sections and elevations; add levels to a loaded model.
- Set visibility and graphics per view: hidden categories, line colours, pen weights, cut fills and CAD cut hatches.
- Plans draw door swings and window symbols from the model's own geometry. You can flip hinge and swing.

**Drafting**
- Line, polyline, rectangle, circle and arc; move, copy, rotate, mirror, erase; offset, trim, extend, fillet.
- A command line with typed coordinates, object snaps, ortho, window and crossing selection, layers, undo and redo.

**Annotation**
- Text and leaders.
- Aligned, linear, radius, diameter and angular dimensions.
- Level marks, read from the plan's level or from the picked height on a section or elevation.
- Grid axes.
- Hatches from twelve built-in patterns, or load your own `.pat` files.
- Element tags that show mark, name or class.
- Drafting standards: layers and layer groups, text styles and dimension styles.

**Sheets**
- A0 to A4 paper, either orientation, with a frame and title block (sheet number, title, project, drawn by, date, scale).
- Drag a plan, section or elevation onto a sheet as a viewport at scales from 1:1 to 1:1000.
- Draw text, leaders, lines and dimensions directly on the sheet, in paper millimetres.
- Duplicate sheets.

**Schedules and output**
- Door and window schedules, read live from the model, with symbols from the door and window library.
- Export sheets and views to SVG, PDF and DXF (R2000, with layers, colours, line types and weights).
- Edit element properties and export the model as IFC with those edits. Its geometry and structure stay as delivered.

**Projects**
- Save a project as one `.bvproj` package: models, views, sheets, drafts and standards, with a hash for every part.
- Save named versions with a note and see what changed between them.

## Who it is for

- Architects and engineers who produce drawings from a model.
- BIM coordinators who check and document openBIM deliveries.
- Teams that hand over IFC and want the drawings to match it.

## What it is not

- Not a modelling tool. This edition does not create, move or delete elements.
- Not yet a replacement for a full CAD package. Expect gaps.

## How it works

IfcSheet runs in your browser. IFC parsing and geometry run locally in WebAssembly, so your model stays on your machine. Nothing is uploaded to open a model or make a drawing.

Two things are off by default and only exist if whoever builds the app turns them on: a server for IFC parsing, and anonymous usage analytics. Analytics events are scrubbed of file and model names and can be opted out of. Build it yourself and you control both.

## Where it is going

The direction is in [VISION.md](VISION.md): you correct a drawing set, you do not build one. Each direction is an [issue you can comment on](https://github.com/BIMvoice/ifcsheet/issues?q=is%3Aissue+label%3Adirection).

## Status

Early and in active development. Things will change, and some will break. Being worked on now:

- Continuous dimension chains
- An ortho lock button, and Ctrl held while drawing
- Snapping dimensions to existing dimension lines
- Two-segment leaders
- A fix for section symbols on plans
- A parametric level mark

## Getting started

You need Node.js with corepack. The WebAssembly engine is built from Rust, or fetched prebuilt.

```bash
corepack enable && pnpm install
pnpm build:wasm:fetch   # prebuilt engine; or pnpm build:wasm with Rust nightly and wasm-pack
pnpm build              # builds all packages
pnpm dev                # builds, then runs the app at http://localhost:3000
```

Tests and type checks: `pnpm test` and `pnpm typecheck`. Details are in [AGENTS.md](AGENTS.md).

## Built on ifc-lite

IfcSheet stands on [ifc-lite](https://github.com/LTplus-AG/ifc-lite) by LTplus-AG: the IFC parser, the geometry engine, the renderer, the viewer it grew from and the package that cuts a model into 2D linework are theirs. That is a large body of careful, open work, and without it this product would not exist. Thank you to its authors and contributors.

What BIMvoice adds on top is the documentation layer: drafting, annotation and dimensions, element tags, drafting standards, sheets and viewports, DXF output, joinery schedules, and the project package with versions.

IfcSheet is an independent product of BIMvoice. It is not affiliated with or endorsed by the authors of ifc-lite. All licence notices and file headers from ifc-lite are kept intact.

## Contributing

Issues and pull requests are welcome. Open an issue first for anything large, so we can agree on the approach. New features ship with tests. Files you modify stay under MPL-2.0.

## Licence

[MPL-2.0](LICENSE). Use, modify and redistribute it. Source files you change must stay under the same licence.

## Who is behind it

IfcSheet is built by [BIMvoice](https://github.com/BIMvoice): Ionut Ciuntuc and Petru Conduraru. Petru is an openBIM consultant and trainer.

---

## For developers: the engine underneath

This section describes ifc-lite, the engine IfcSheet is built on. Its own documentation is at [ifclite.dev](https://ifclite.dev/docs/guide/quickstart/).

The repository is a monorepo of TypeScript packages and Rust crates. The viewer app lives in `apps/viewer`. Drawing and documentation features are in `apps/viewer/src/drafting`. The edition that turns modelling and analysis off is set in `apps/viewer/src/edition.ts` and `edition-policy.ts`.

| I want to... | Packages |
|--------------|----------|
| Parse an IFC file | `@ifc-lite/parser` |
| View a 3D model (WebGPU) | + `@ifc-lite/geometry` + `@ifc-lite/renderer` |
| Query properties and types | + `@ifc-lite/query` |
| Edit properties (with undo) | + `@ifc-lite/mutations` |
| Generate 2D drawings | + `@ifc-lite/drawing-2d` |
| Export to glTF / IFC / Parquet | + `@ifc-lite/export` |
| Build schedules and property tables | + `@ifc-lite/lists` |

More: [2D drawings guide](https://ifclite.dev/docs/guide/drawing-2d/), [architecture overview](https://ifclite.dev/docs/architecture/overview/), [API reference](https://ifclite.dev/docs/api/typescript/). The `docs/` folder in this repository holds the engine's documentation sources.
