# Contributing to IfcSheet

IfcSheet makes drawings from IFC models. It exists because an architect needed a drawing set out of a native IFC model and could not get one without pain. Every rule below follows from that: the work starts from a real drawing need, and it is finished when the drawing is right.

## How work is chosen

1. **It starts with a need from practice.** Lloyd Bussio directs what gets built, from what he needs to deliver as an architect. Needs from other people producing drawings are welcome: open an issue and describe the drawing you could not make.
2. **It goes on the list before it gets built.** A maintainer turns a need into a task: what the user should be able to do, and how we will know it works. If something is not on the list, ask before you build it. A good idea that nobody asked for still costs a review.
3. **One change, one purpose.** A pull request does one thing a user could name. Unrelated clean-up goes in its own pull request.

## What "done" means

A change is done when someone has seen it work, not when it compiles.

- **Seen in the running app.** Say which model and which view you used, and attach a screenshot. A drawing tool is judged by eye: nothing on top of anything, text readable, lines where a draughtsman expects them.
- **Say what you did not check.** "Not tried on a sheet", "not tried in PDF". An honest gap is useful. A silent one costs someone a day.
- **A test that fails without your change.** Run it against the old code once, so you know the test is real.
- **You can answer for it.** If a reviewer asks why, you answer with something they can run or look at. This holds however the code was written.

## Rules of the product

These are the promises IfcSheet makes to the people who use it. A change that breaks one is not accepted, however useful it is otherwise.

1. **The model is not ours to change.** IfcSheet reads the IFC and may edit properties. It does not create, move or delete elements.
2. **The model stays on the user's machine.** Nothing a user loads or draws is sent anywhere. A feature that needs a server is off by default and says so on screen.
3. **A drawing is true to scale.** Paper sizes and scales are measured in the output, in millimetres, not assumed.
4. **What you save comes back.** Every setting a user can make is saved with the project and restored on open. The round-trip test fails when a new setting is not saved: fix the save, do not weaken the test.
5. **Old projects keep opening.** A file format changes only by adding. A reader refuses a broken file with the place of the problem and changes nothing.
6. **The drawing follows the model.** A tag, a label or a level mark shows what the model says and updates when the model changes. Text typed by hand is the exception and is marked as such.

## How the code is shaped

- **The engine first, the screen second.** Put the logic in plain modules that know nothing about the screen, and reach them through typed commands. The interface is one way of using IfcSheet, not the only one. Other tools, and automation, should be able to drive the same commands.
- **Paper units for paper things.** Text heights, gaps and symbols that belong to the sheet are in millimetres on paper, so they look the same at 1:50 and 1:200.
- **Same input, same drawing.** Automatic placement is deterministic. Running it twice gives the same result.
- **Small files.** A module that passes 400 lines is doing two jobs.
- **No silent failures.** No empty `catch`, no `as any`, no `@ts-ignore`. If something cannot be done, tell the user in words.
- **Words on screen go through the translation catalogues**, like the code around them.

Setup, build and test commands are in [AGENTS.md](AGENTS.md).

## Pull requests

- Branch from `main`. One pull request per task.
- The description says what a user can now do, how you checked it, what you did not check, and any choice you made that a maintainer should confirm.
- Add a changeset for anything a user would notice.
- New source files carry the MPL-2.0 header (see `LICENSE_HEADER.md`).
- Commits are signed by the person who answers for them. No tool signatures and no co-author lines for tools.

## Who decides

The maintainers, Petru Conduraru and Ionut Ciuntuc, review and merge. A verified change is merged or answered within a few days. If it sits longer, ask.

## Working with AI tools

Use them. Much of IfcSheet is written with them. The rules above do not change: you ran it, you looked at it, you can answer for it.

## The engine underneath

IfcSheet is built on [ifc-lite](https://github.com/LTplus-AG/ifc-lite). If you find a defect in parsing, geometry or rendering that is not specific to drawings, it probably lives in the engine: tell us, and report it there too, so everyone who uses the engine gets the fix.

## This repository is public

Do not commit client names, project names or models you are not allowed to share. Use the sample models in the repository, or a small model you made yourself.

## Licence

By contributing you agree that your contribution is licensed under the [Mozilla Public License 2.0](LICENSE).
