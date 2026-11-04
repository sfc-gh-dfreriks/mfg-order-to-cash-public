# Orders to Cash — public demo

A static, no-login build of the **Orders to Cash** app (manufacturing use case 09 in
[`mfg-use-cases`](https://github.com/sfc-gh-dfreriks/mfg-use-cases)), deployed to GitHub Pages:

**https://sfc-gh-dfreriks.github.io/mfg-order-to-cash-public/**

The app follows sales orders through shipping, billing and receivables to cash. It reads two SAP instances, each as SAP ECC,
S/4HANA, BW or BDC, together with Salesforce CPQ quotes, a carrier tracking feed, an AR automation platform (disputes and
deductions) and bank statements (camt.053). The data flows through dbt staging adapters, a canonical silver layer and gold
marts on Snowflake, then on to a semantic view, a Cortex Agent and this React app. All data is synthetic.

Pages: Executive Dashboard, Order Book & Quotes, Fulfillment & OTIF, Billing, Receivables & DSO, Collections & Disputes,
Cash Application, Customer 360, Data Sources, Field Mapping, SAP Metadata, Sources & Lineage (dbt), Pipeline in 3D and Ask Cortex.

**Snowflake employees:** the live app (live queries, free-text Ask Cortex, saved scenarios) is also on the internal marketplace as the Native App listing **`ORDER_TO_CASH_ORG`** in the SAP BDC demo orgs (US West, EU Frankfurt, APAC Sydney).

## How the public build works

- **Snapshot:** built with `VITE_STATIC=1`, the client reads pre-baked JSON in `public/data/` instead of a live `/api`.
  There is no Snowflake connection and there are no credentials in the browser. Source selection in the snapshot: SAP A = ECC,
  SAP B = S/4HANA, all non-SAP sources on.
- **Filters:** every company subset with all product families is baked, and so are all companies or one company with each
  single product family. Other combinations fall back to the nearest baked view (see `loadKeyed()` in `src/lib/api.ts`).
  Product family filters the order and fulfillment views; billing, receivables and cash follow the company filter.
- **Ask Cortex:** answers are pre-generated for each page's default analysis and every suggested question. Free-text questions
  need the full deployment.
- **Data Sources:** browse each source type and preview its native tables. Apply (which runs dbt in Snowflake) is disabled.

## Refresh

From `mfg-use-cases/use_cases/09_order_to_cash/app`, with the local app running (`npm run dev`, server on 3015):

```bash
EXPORT_BASE=http://localhost:3015 node scripts/export-static.mjs
rsync -a --delete --exclude node_modules --exclude dist --exclude '*.tsbuildinfo' --exclude .git --exclude .github \
  --exclude README.md --exclude .gitignore client/ ~/Documents/GitHub/mfg-order-to-cash-public/
```

Then commit and push here; the Pages workflow builds and deploys `main`.
