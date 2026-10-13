# Where IfcSheet is going

## What it is for

A building is modelled once, as an IFC model. Then it has to be drawn: plans, sections, elevations, schedules, sheets, issued as a set and issued again every time the model changes.

IfcSheet exists for that second part. It never starts from an empty page. It starts from a model that already exists, and its job is to make the way from that model to an issued drawing set as short as it can be.

The direction comes from practice. Lloyd Bussio, an architect working in native IFC, directs what gets built from what he needs to deliver.

## The principle

**You correct a set. You do not build one.**

Everything the model already knows, the tool should already have done: the storeys, the extents, the names, the properties. The person's time goes into judgement, into what a drawing should show and how it should read, not into repeating what the model says.

## Directions

Each direction is an issue, open for discussion. None is a promise or a date.

| Direction | Issue |
|---|---|
| A draft drawing set is there when the model opens | [#20](https://github.com/BIMvoice/ifcsheet/issues/20) |
| A set template you carry between projects | [#21](https://github.com/BIMvoice/ifcsheet/issues/21) |
| A new model version shows only what changed | [#22](https://github.com/BIMvoice/ifcsheet/issues/22) |
| Annotate a whole view in one action | [#23](https://github.com/BIMvoice/ifcsheet/issues/23) |
| A list of what is missing before issue | [#24](https://github.com/BIMvoice/ifcsheet/issues/24) |
| Issue the whole set in one action | [#25](https://github.com/BIMvoice/ifcsheet/issues/25) |

If you produce drawings from IFC models, your comment on these issues is the most useful thing you can give us: which one would save you the most time, and what is missing from the list.

## How it should feel

Unlike a CAD program. No wall of buttons. The drawing set is what you look at, and the tools appear where you are working. The interface that exists today is the one the engine came with; it will be replaced.

## How it is built

- **The engine is the product.** The drawing logic lives in plain modules, reached through commands. The interface is one way of using it, and a showcase of what the engine can do. Other tools should be able to build on the same engine.
- **The promises** to the people who use it are in [CONTRIBUTING.md](CONTRIBUTING.md): the model is not changed, it stays on your machine, drawings are true to scale, what you save comes back, old projects keep opening, the drawing follows the model.
- **Later.** Because everything is reachable by commands, the same engine can be driven by automation. That is a later step, not the current work.

## How a direction becomes work

A direction is discussed in its issue. When the maintainers choose one, it gets the `ready` label and is broken into tasks. Only `ready` work gets built.
