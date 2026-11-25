# Task5 review fixes — local visual evidence

These eight Chromium screenshots use the real local app-block JS/CSS and simulated campaign/cart responses. OS2.1 renders the actual Handlebars template with documented local helper fixtures; OS3 uses the established native-DOM fixture. Product artwork/prices are synthetic.

- `single-before-*`: dc212d0 browser asset, initial single mode wrongly includes one paid bundle.
- `single-after-*`: corrected asset, same initial single mode includes no paid bundle and total stays $40.
- `uncertain-*`: corrected asset after one ambiguous simulated POST, viewport changes, DOM removal/reinsertion, revised campaign and an explicit unsuccessful read-only check. Add remains disabled and Check cart remains available at 1440/390.
- `browser-evidence.json`: measured state, one POST, no viewport overflow or browser errors. Later exact read-only confirmation unlocks without another POST.

Reference remains `docs/reference/screenshots/gifts-bundles-section-toggle-reference.png` (admin section header only). Existing storefront screenshots in the parent folder provide the baseline layout. No native merchant/theme checkout verification or real cart write occurred.
