# FlowAccount mapping and remaining validation

Checked 2026-10-08 against the official [OpenAPI schema](https://developers.flowaccount.com/swagger.yml), [API reference](https://developers.flowaccount.com/api-reference/), [product guide](https://developers.flowaccount.com/tutorial/product-api/get-product), [VAT settings](https://developers.flowaccount.com/tutorial/product-api/price-and-vat-settings), [authentication](https://developers.flowaccount.com/tutorial/connect/client-credentials-flow/), [rounding notice](https://developers.flowaccount.com/announcements/May-15-2025), and [rate limits](https://developers.flowaccount.com/announcements/Jul-08-2026).

| Web data | Flow field / behavior |
|---|---|
| Supplier | contactId, contactName, contactAddress, contactTaxId, contactBranch, contactZipCode, contactGroup |
| Product + unit | productLists[*].id → items.id; corresponding unitName; master ID and unit ID retained in snapshot |
| Default purchase price | productLists[*].buyPrice (without VAT); buySettings.vatType retained |
| Receipt date | publishedOn, dueDate; initial creditDays=0, creditType=1 |
| User reference | reference, preserved exactly |
| Local receipt UUID | externalDocumentId=ck-UUID; not an idempotency key |
| Buyer | local database only; never salesName/contactPerson/remarks |
| Warehouse | local only; no field confirmed in SimpleDocument |
| PO | local only; POST /upgrade/purchases is a separate workflow; not implemented |
| Notes | remarks, only explicit user notes |
| Result | data.documentId, data.documentSerial; both required to classify success |

API supplier types: 5 supplier, 7 customer+supplier. Product types: 1 service, 3 noninventory, 5 inventory. Buy VAT types: 1 inclusive, 3 exclusive, 5 no tax, 7 exempt. Do not conflate none with exempt when enabling more live formats. Product-master ID must not be used as purchase item ID. Pagination uses currentPage/pageSize and data.list/data.total. Requests use pageSize=100.

Official POST /purchases description says newly created documents are awaiting approval. The implementation does not call a status-change endpoint. Thus stock increase is **not verified**; check inventory movements before and after creation and approval in the authorized test company. Do not promise immediate inventory updates.

SimpleDocument discount percentage is limited to four decimals; a baht amount may not round-trip to a matching percentage. Inclusive VAT and discount payloads are available for mock/contract investigation but blocked in live. Rounding notice specifies decimal precision but does not conclusively specify midpoint policy; local half-up fixtures still require UAT comparison. The official grandTotal prose also contains arithmetic wording that must not substitute for actual sandbox comparison.

No idempotency support was assumed. Do not retry POST after timeout or any ambiguous response. Known rejected mock submissions can be edited and resent. All live unconfirmed HTTP failures remain unknown until reviewed. Reconciliation reads an explicitly supplied Flow ID and compares the external ID and amount. A missing search result is not evidence that a document was never created.

Required UAT: actual token acquisition; contacts across pages; multiple product units; product deletion; positive-ID response contract; quantities/prices at 4 decimals; midpoint rounding; tax behavior; discount requirements; contact tax/branch fields; POST failure semantics; interruption after external success; stock behavior; PO upgrade and partial receipts if requested. No production calls have been made.
Current revision: all outgoing API requests are pinned to the Sandbox /test base, reject redirects, and cannot fall back to /v1. Transport tests use simulated HTTP and do not demonstrate actual Sandbox credentials or account contents. The dedicated read-only check emits counts/status only; never tokens, upstream bodies or supplier/product data.
