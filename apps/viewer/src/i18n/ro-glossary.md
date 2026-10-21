# Romanian glossary (ro)

One place to correct term choices. Edit the term here and in `catalogues/*.ro.ts`
(`wall`, `sheets`, `check`, `issue`, `whatchanged`, `sheet-content`); the tests in
`locales/ro.test.ts` keep keys, placeholders and diacritics honest.

Rules: comma-below diacritics only (ș ț, never ş ţ), plus ă â î. Polite plural
imperative for instructions ("Deschideți…"). Romanian quotation marks „…”.
Product and format names stay as they are: IfcSheet, IFC, DXF, PDF, SVG, CSV, BIMvoice.
Command names typed by the user (CHECKSET, ISSUE, WHATCHANGED, DRAFTSET) stay as typed.

| English | Romanian | Note |
|---|---|---|
| Wall (the board of sheets) | Panou | The metaphor is a pinboard; "perete" would read as a building wall. |
| Sheet | Planșă | 1 planșă, 2 planșe, 20 de planșe |
| Drawing set | Set de planșe | |
| View | Vedere | 1 vedere, 2 vederi, 20 de vederi |
| Drawing (on a sheet) | Desen | |
| Plan / floor plan | Plan | |
| Section | Secțiune | |
| Elevation | Fațadă | |
| Detail | Detaliu | |
| Title block | Cartuș | |
| Scale | Scară / Scara | "Scara" in the title block, "Scară" as a field name |
| Schedule | Tabel | Door and window schedule: "Tabel de tâmplărie (uși și ferestre)" |
| Material takeoff | Extras de materiale | |
| Dimension (a tool, the act) | Cotare | A single dimension is a "cotă"; "Cotează întregul plan" |
| Level mark | Cotă de nivel | |
| Section mark | Marcaj de secțiune | |
| Tag | Etichetă | |
| Note | Notă | |
| Symbol | Simbol | |
| Level / storey | Nivel | |
| Floor height (of a level) | Cota pardoselii | |
| Room | Încăpere | 1 încăpere, 2 încăperi, 20 de încăperi |
| Door / window | Ușă / fereastră | 20 de uși, 20 de ferestre |
| Area | Arie | In the takeoff column (Arie m²). Ac, Ad, Au are not used in these screens. |
| Volume | Volum | |
| Cut height | Înălțimea de secționare | |
| Window head / sill | buiandrug / parapet | |
| Issue the set | Emite setul | "Emitere" for the act; the issue record is "Emitere" in the drawing list |
| Revision | Revizie | |
| Revision cloud | Nor de revizie | |
| What is missing | Ce lipsește | |
| Client | Beneficiar | Title block |
| Title (of a sheet, in the title block) | Titlu planșă | |
| Untitled project | Proiect fără titlu | |
| Generated names | Planuri, Fațade sud și nord, Fațade est și vest, Secțiuni, Tabele; Fațada nord/est/sud/vest; Secțiunea A-A; Detaliu 1 - … | Resolved once at creation (`names.*`), stored as plain text, never re-translated |
| Drawn by / Checked by | Desenat / Verificat | As printed in Romanian title blocks |
| Sheet no. | Nr. planșă | |
| Paper | Hârtie | Paper format: "Format" |
| Landscape / Portrait | Orizontal / Vertical | |
| As indicated | Conform indicațiilor | |
| Hatch | Hașură | |
| Pattern (of a hatch) | Tipar | Not "model", which reads as the IFC model; "Tipare de hașură" |
| Reshaped (what changed) | Formă modificată | Not "remodelat", for the same reason |
| Leaf (of a door or window) | Canat | The leaf itself, never the way it opens: "Canat batant", "Canat glisant" |
| Swing (door) | Canat batant | Neuter "canat" takes "batant"; on its own, of a door, "batantă" |
| Double-acting (door) | Canat pendulant | As above: "pendulant", "pendulantă" of a door |
| Bottom-hung (tilt) | Oscilant | Not "basculant" |
| Top-hung | Proiectant | |
| Tilt and turn | Oscilo-batant | |
| Pivot, horizontal axis | Pivotant, ax orizontal | The only opening "basculant" may describe |
| Pivot, vertical axis | Pivotant, ax vertical | |
| Library | Bibliotecă | |
| Project navigator | Navigatorul de proiect | |

## Not translated yet

The 3D viewer around the Wall (ribbon, panels, dialogs), the drafting tools you
use inside a sheet (`drafting.*`), the PDF export dialogs (`sheetsPdf.*`) and the
drafting standards stay English; a missing key falls back to English one by one.
The "Detail marks" drafting layer name, the sheet name of a new blank schedule
sheet made before this change, and anything a person typed are stored text and stay
as they were. Storey names come from the IFC and are never translated.
