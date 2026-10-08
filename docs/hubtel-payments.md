# Hubtel payment setup

Bookified prepares hosted Hubtel checkout for MoMo and supported cards. It sells one calendar month of Standard or Pro access, with manual renewal and no automatic debit. Currency is GHS. The owner's prices must be supplied; no production price is assumed. Usage allowances still reset on the first day of each UTC calendar month.

**Live payments are disabled.** No merchant account, approved settlement destination or prices have been provided. A personal MoMo wallet alone does not provide merchant API credentials. Ask Hubtel which eligible account holder/business can operate the account, whether a parent-operated arrangement is permitted for a 17-year-old beneficiary, whether international cards are enabled, and which bank or wallet may receive settlement. Do not assume a student bank account or the child's wallet is approved.

## Before activation

1. Complete Hubtel merchant onboarding and obtain the collection account number and server API credentials. Configure only through encrypted server environment settings. Never enter secrets in chat or commit `.env.local`.
2. Obtain approved access to the Transaction Status API. Hubtel's documentation requires outbound IP whitelisting through its Retail Systems Engineer (up to four IPs). Ordinary Vercel function egress is not a guaranteed fixed IP. Agree a supported egress arrangement with Hubtel/Vercel before enabling checkout; do not set the confirmation flag based only on having credentials. No paid static-egress service has been purchased or configured here.
3. Choose Standard and Pro prices in Ghana pesewas: `BILLING_STANDARD_AMOUNT_MINOR` and `BILLING_PRO_AMOUNT_MINOR`. Each must be an integer between 1 and 3000000. These server values control checkout and display. The application never accepts a browser-supplied amount or currency.
4. Set `HUBTEL_CLIENT_ID`, `HUBTEL_CLIENT_SECRET`, `HUBTEL_MERCHANT_ACCOUNT`, and the two prices. Use the production HTTPS `APP_BASE_URL`. Keep `HUBTEL_PAYMENTS_ENABLED=false` and `HUBTEL_STATUS_ACCESS_CONFIRMED=false` until verification is complete. Existing `BOOKIFIED_QUEUE_SECRET` and `CRON_SECRET` must be configured for delayed checks/recovery.
5. Run `npm run db:indexes` against the deployment database before activation. Payment indexes enforce one pending order per account, unique browser retry keys and unique provider transaction IDs. MongoDB must support transactions.
6. Obtain a provider-approved test environment/credentials and run real checkout, return, callback, delayed status verification, declined/abandoned payment and refund acceptance. No undocumented sandbox endpoint or simulated production confirmation exists. An actual paid test may incur fees; coordinate it with the merchant rather than silently charging.
7. Only after the account, prices, egress, settlement, card eligibility and full verification pass, set both activation flags to `true` and redeploy.

## Payment authority and recovery

Server initiation uses `https://payproxyapi.hubtel.com/items/initiate` with Basic authentication and a random 32-character reference. Redirects contain only the reference. Checkout URLs must use HTTPS on `hubtel.com` or its subdomains.

Callbacks are untrusted wake-ups. Neither their body nor the browser return grants access. The server authenticates a fresh status request to `https://api-txnstatus.hubtel.com/transactions/{collectionAccount}/status?clientReference=...`, then compares merchant configuration, reference, gross amount and currency. Hubtel documents nullable `currencyCode`; null is accepted only for the configured Ghana-cedi collection account. Verify this account's currency during onboarding. A `Paid` result with a transaction ID is stored atomically and grants access once; a verified `Refunded` result revokes that order. A cached authentication `user.plan` value is never an entitlement.

Vercel Queues starts an authenticated check after five minutes, retrying pending/provider failures every five minutes for at most 32 deliveries. Daily authenticated maintenance republishes up to 25 pending or unexpired paid orders, oldest checked first; the signed-in owner can also check status. This also reconciles refunds for active access, with a daily delay under normal recovery. A publication failure leaves the durable payment record intact. No duplicate initiation is made for the same retry key. Ambiguous initiation failures and `Unpaid` responses remain pending because they do not prove that collection can no longer occur. Do not manually delete these records to retry a charge; reconcile them with Hubtel first.

Renewing the same plan appends one calendar month to its paid-through date. Switching tiers is allowed after current paid access ends. Expiry and verified refunds remove the entitlement while retaining existing books. Refunds are detected when the callback/status endpoint is checked; this integration does not issue refunds or provide a merchant dispute-management interface.

## Evidence

Official documentation consulted: [Hubtel developer portal](https://developers.hubtel.com/docs/business/api_documentation/payment_apis/online_checkout), including its public documentation search index, and [Vercel Queues SDK](https://vercel.com/docs/queues/sdk). Provider API responses are exercised only with isolated fixtures until onboarding. Passing those tests does not prove live MoMo, international-card collection or settlement.
