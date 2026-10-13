# Security

## Reporting a problem

Please report security problems privately, not in a public issue or pull request.

Open a private report at https://github.com/BIMvoice/ifcsheet/security/advisories/new

Say what is affected, and add the smallest example that shows it. Do not attach a real project model: a small made-up file is enough and is safer for you.

IfcSheet reads IFC files that may come from anyone, so a file that crashes the app, makes it hang or makes it use unbounded memory is in scope. So is anything that would send a user's model or drawing off their machine.

If the problem is in parsing, geometry or rendering, it is likely in the engine underneath, [ifc-lite](https://github.com/LTplus-AG/ifc-lite). Report it to us first; we will pass it on with you, or you can report it there as well.

## Which version

Fixes go into the current `main`. Older states are not maintained.
