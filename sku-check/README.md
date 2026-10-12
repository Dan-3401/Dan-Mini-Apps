# SKU CHECK β 0.3 — Shopify CSV import preflight (Japanese UI)

Free offline browser demo for inspecting generic product CSVs and **preflight warnings on risky Shopify product CSV updates**. **Not affiliated with Shopify.** This is not an importer, does not alter stores, and does not guarantee import success.

## Launch

Open `index.html` next to `app.js` in any modern desktop browser. No installation, sign-in, network or store credential is required. **No analytics or remote uploads** are coded into this demo.

## Try

- Click **サンプルデータで試す** for generic CSV diagnostics: 8 rows / 6 issues.
- Choose `sample_shopify_risk_update.csv` as the main file and `sample_shopify_risk_before.csv` as the older baseline. The UI should show a possible description blank overwrite and a changed option value, as well as stock/price differences.
- Download risk and difference reports as CSV (spreadsheets might interpret cell data as formulae; the exported *reports* escape potentially dangerous formula-like cells).

## Features

- Generic product checks: missing/duplicate SKU, missing names, numeric prices and quantities, ragged CSV rows.
- Shopify product format: conservative handle/title-group checks, CSV changes by SKU, and import-risk warnings (blank overwrites, option-value changes, missing dependent option columns).
- UTF-8 and Shift_JIS decoding, separator choice, RFC-style quoted fields, local-only processing. Up to 10 MiB and 50,000 rows per file.

## Important limits

- Risk checks are **heuristics based on two provided CSVs**, not your actual live inventory. They may miss risks or flag intentional changes. Perform a backup before uploading, and validate using a test import. Shopify's variant and multi-location semantics are more complex than this demo.
- For Shopify, an *omitted* non-required column may leave an existing value unchanged, but an *included, blank* column may overwrite it. Option1 name and Option1 value can be dependencies of variant fields; changing an option value may recreate the variant ID. See the official documentation: https://help.shopify.com/ja/manual/products/import-export/using-csv and https://help.shopify.com/ja/manual/products/import-export/import-products
- Do not upload real customer/order personal data; use masked product CSV examples when inquiring about custom work. No passwords/API keys.
- Original data re-export keeps potentially formula-like values unchanged. Never open untrusted CSVs in a spreadsheet before inspecting them.
- This demo has been covered by Node.js logic tests. **Real browser UI end-to-end verification is still required.**

## Tests

`node test_logic.js` (Node.js 18+).

## Author and licensing

Demonstration for a prospective paid customization service. Copyright 2026 Dan. **No public open-source license is granted by this directory;** contact the author for reuse or commercial redistribution rights. The demo itself is free to try.