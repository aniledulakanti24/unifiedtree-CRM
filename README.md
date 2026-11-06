# Unifiedtree CRM

Role-based CRM front end: pipeline, leads, contacts, customers, internal transfers, tasks, calendar,
orders, products, quotes and invoices, inventory, logistics, support cases, reports, audit log and settings.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run lint` catches undefined names. `npm run build` creates `dist/index.html`, a single file that also opens by double-click.

## Roles

Each role has its own workspace: its own home screen, menu, page names and actions. Pick a role on the login page, or switch with "View as" in the account panel, opened from your name at the bottom of the sidebar. That panel also holds your profile, Settings, the Light and Dark theme switch and Log out. For Admins it holds the Administration pages too: Users & roles, Access control, Sales teams and the Audit log.

- **Admin (Admin console):** company overview, users and roles, sales teams, settings, audit log, all records, inventory and logistics, company reports.
- **Manager (Manager workspace):** team dashboard with rep scorecard and deals at risk, transfer approvals, team activities and calendar, pipeline by rep, lead assignment, team reports.
- **Sales Person (Sales workspace):** my day, my tasks and calendar, my pipeline, leads, contacts and customers, transfer requests, my orders and quotes, product catalogue, my forecast and performance.

## Companies

Admins can click the company name at the top of the sidebar to switch company or add a new one. Each company has its own customers, deals, users, settings and audit log, and nothing is shared between them. A new company starts empty, with the admin who created it, default settings and one warehouse. Other people stay in their own company; when more than one exists, the login page asks which to open. To remove a company, open it and go to Settings > Data > Delete company. This can't be undone, and the last remaining company can't be deleted.

## Dropdown options

Everyone can add their own options to the CRM's dropdowns while filling in a form: pick **+ Add new option…**. An Admin can turn this off per role or person in **Access control**. The same works for customers, warehouses, activity types and lost reasons. Admins manage every list in **Settings > Dropdown options**, where options can also be renamed or removed. Renaming updates existing records. Removing keeps the value on existing records but stops offering it. Each company has its own lists. Options marked **Built in** drive the CRM's rules, so renaming one changes the word everywhere it appears while the rules keep working. Workflow lists, such as order status and role names, can be renamed but have no add or remove. Lists are defined in `src/picklists.js`.

## Deal stages

Admins can add, rename, reorder and remove deal stages and set each one's win probability in **Settings > Deal stages**. Each company has its own stages. New deals start on the first stage. Won is always last and can only be renamed. Removing a stage that has deals asks where to move them.

## Sales automation and simulated services

No server is involved. `src/engine.js` holds the logic a backend would own, and nothing here sends real email, messages or calls.

- **Automation** (account panel): when an event happens, optionally if conditions match, create tasks or follow-ups, send alerts or simulated emails, or assign the next salesperson.
- **Lead scoring and assignment:** each score lists its reasons. New leads from web forms, and from imports or generated leads when rule-based assignment is on, go to the salesperson with the fewest new leads.
- **Form fields** (Settings): rename, reorder, hide or require fields, and add your own.
- **Import and duplicates:** CSV import on leads, contacts and customers, with column matching and duplicate handling. Settings > Data finds and merges duplicates, and restores backups.
- **Tax** (Settings): name the tax (VAT, GST, Sales tax or your own), set a default rate, rates by country and rates per product, and mark customers as tax exempt. Check rates with an accountant. It doesn't file returns.
- **Currencies** (Settings): each customer, deal, quote, order and invoice can have its own currency. Reports total in the main currency. Exchange rates are simulated and editable, and each record keeps the rate from when it was created.
- **Worldwide settings:** every country, more currencies, number and date formats, the first day of the week and the fiscal year start.
- **Connected apps** (account panel): tiles for website, accounting, manufacturing, SCM, inventory, procurement, HR, marketing, projects and BI. Each lets you pick a system, choose what to share, connect and sync. It's simulated, so no data leaves the CRM.
- **AI Voice** (between Calls and Chat): agents with a voice, language and opening line, typed test calls read aloud by the browser, campaigns and call history with transcripts. Fully simulated: no phone is dialled and no AI model runs.
- **Chat and WhatsApp** are separate pages. Chat has group conversations, status dots (simulated), read ticks and attachment names.
- **Assistant (simulated):** an Ask panel over your own records, win chance on deals, customer health, a What to do first list, and writing help. It uses fixed rules, with no AI model, and can be turned off in Settings.
- **Calling, email and WhatsApp (simulated):** a call network with no-answers and busy lines, voicemail, recording with transcripts, scripts, transfer and call lists. An email inbox with tracking, scheduling, drafts and bulk sends. WhatsApp with delivery ticks, the 24-hour rule, templates and broadcasts. Nothing reaches a real phone or mailbox.
- **Automation:** multi-step workflows with waits, if / otherwise paths and approvals, built on a visual flow. Ten templates, test runs that change nothing, run now, a run history and an Approvals page. Workflows run while someone has the CRM open.
- **Dashboards and reports:** click any number or chart segment to see its records, add and share extra dashboards, filter by team or person, and print. The report builder has templates, filters, split-by, comparisons, totals, folders, sharing and scheduled delivery (simulated).
- **Sales pipeline:** board filters, time in stage with stuck flags, next step on every card, rules a stage can require (Settings > Deal stages), a drop zone for lost deals, people and products on deals, stage history, duplicate deal and bulk edits.
- **Leads:** quality and waiting filters, bulk status, follow-up sequences that add dated tasks, duplicate warnings and a fuller convert step.
- **Getting around:** a first-visit tour, a getting-started list, help for each page, keyboard shortcuts (press ?), a search palette that also runs commands, favourites in the menu, saved table views, Undo after deleting, and a warning before losing unsaved form changes.
- **Date filter:** dashboards, Insights, reports and most tables share one filter: a named period such as Current Fiscal Year, or any two dates from the calendar. The fiscal year's first month is set in Settings > General & roles.
- **Dashboard widgets:** every role's home screen is built from a library of number tiles, charts and short lists. Customize adds, removes, resizes and drags them, and each person's layout is saved for them. Each chart's heading is a dropdown that switches it to another chart of the same shape, and the Chart builder widget lets people choose the data, measure, grouping and chart type.
- **Insights:** plain statements and charts for the whole business, and for each employee. Admins see everyone, managers their team, and sales people only themselves. Worked out from CRM records with fixed rules, not an AI model.
- **Timed automation:** rules can fire when a deal is stuck, a lead isn't contacted, an invoice is overdue or a delivery's status changes, and any action can wait a number of days. They run only while the CRM is open.
- **Report builder** (reports menu): choose data, grouping, measure and chart, save it, pin it to your home screen and export it.
- **Custom roles** (Access control): create a role from a base role, then assign people in Users & roles. It keeps the base role's menu and home screen.
- **Customer portal:** the button on a customer record opens their private page for quotes, invoices, orders, deliveries and support. It works only in the same browser, and payments are simulated.
- **Business templates:** Add company can set up stages, lists, fields and rules for a type of business.
- **Automatic backups:** one a day in this browser, last 7 kept (Settings > Data).
- **Installable app:** once hosted, the build can be installed and opens offline using its last saved copy.
- **Web forms:** each has a public link that creates a lead. It only works in the same browser for now.
- **Customer journey, deal assistant and coaching:** the journey is on customer and deal records, and coaching is on the Manager and Admin dashboards. The assistant uses fixed rules, not an AI model.
- **Email and WhatsApp replies** are simulated, with buttons to play the customer's reply.
- **Passwords** are simulated (Settings > CRM settings). The data stays readable in the browser, so this isn't security.

## Language

Click the language icon at the top right, then search or pick a language. The world's most used languages are listed first, each in its own script, and the icon shows the current language. Company and people's names stay as written in the sidebar and next to avatars. Translation uses Google Translate's website widget, so it needs internet access, sends page text to Google, and covers the languages Google supports. The choice is saved in this browser.

## Access control

Admins can hand any of this to anyone: Access control, Companies, Settings and Users are all rows here. Whoever gets **Settings** can change dropdowns, deal stages and page names. Admins always keep their own access to Access control, Settings, Users and the Audit log.

Admins open **Access control** to decide what each role, and each individual person, can do per module: view, create, edit, delete, special actions, and whether they see their own, their team's or all company data. Each module's sections, views and tabs can also be assigned or revoked one by one. Menus, pages, tabs and buttons follow these settings immediately, and every change goes in the audit log. Personal settings override the role. An Admin's access to Users, Settings and the Audit log can't be switched off, so nobody gets locked out. Defaults live in `src/permissions.js`.

## Communication

- **Meeting requests:** anyone can ask to meet anyone in their company from **Meeting requests**. The person it's sent to can accept and set the time, decline, or pass it on, for example from the Admin to a Manager. Everyone it has reached is told what happened, and the full history stays on the request. Non-admins see only requests they're part of; Admins see them all. An accepted meeting goes on the calendar of the person who accepted and the person who asked. It shows in **Today's meetings** on the home screen and gets a reminder 15 minutes before. These only fire while the CRM is open.
- **Follow-up reminders:** pop-ups with call, snooze and done buttons, bell entries and optional desktop alerts. They only fire while the CRM is open.
- **Team chat:** works between users in the same browser, including across tabs. Real multi-user chat needs a server.
- **WhatsApp:** click-to-chat opens WhatsApp with the message ready and logs it. Receiving replies needs the WhatsApp Business API and a server.
- **Calls and video:** everything is simulated in the browser by `src/mockBackend.js`, and no real call is made or received. An outgoing call rings your mobile, then the customer, from the company's demo business number. **Simulate a customer calling** on the Calls page plays a customer ringing that number: it rings the customer's owner, then their manager, then the Admin, and a missed call is logged with a bell alert and a callback follow-up. Each person rings for 15 seconds. Real calls need a provider and a server (see Settings > Integrations).

## Current limits

- Data is sample data, saved in the browser's localStorage. There is no server, so nothing is shared between people or devices.
- Sign-in has no password check, and roles are enforced only in the browser. Add a backend and real authentication before using live customer data.
- "Send message" logs to the record's history. It does not send email.
# unifiedtree-CRM

## Mobile and alerts

On a phone, a round button adds a record, a voice note (speech turned into text by the browser) or a check-in at a customer visit with the phone's location. Alerts can go to a colleague while you're away, weekends can be quiet, and chosen kinds still come through quiet hours. Similar alerts on the same day are grouped. When the app is installed, alerts appear on the device with Open and Snooze buttons. Settings show which kinds of alert you open and which you ignore, with a one-tap way to stop pop-ups for those.

## Connections

Apps can be set to ask a person when a record changed in both places; those wait in Needs attention, next to records a sync couldn't take, which can be added anyway or dismissed. Webhooks get a signing secret, each delivery carries the record data and a real HMAC-SHA256 signature, and failed deliveries are tried again after 1, 5 and 30 minutes or sent again by hand. API keys can be limited to reading or changing chosen areas, can expire, and show when they were last used. Try the API answers requests with a key from the CRM's own data, with the checks a real API makes. Each app shows records moved over two weeks. Simulated: no real system is connected and nothing is sent.

## Backups

Backups can run every hour, day or week while the CRM is open, and keep one a week and one a month for longer. Each one has a SHA-256 fingerprint so a damaged copy is caught before restoring. Downloads can be locked with a password (AES-GCM encryption in the browser), and a downloaded file can be restored. Compare shows what changed since a backup for each kind of record, and you can bring back only chosen kinds or only deleted records. Imports take a safety backup first. Backups live in this browser; the off-site copy is simulated.

## Security and logins

People can turn on a real authenticator app (time-based codes, as used by Google and Microsoft Authenticator) with one-time recovery codes, and trust a device for a set number of days. Common passwords, passwords with the email name, and recently used ones are refused. Admins can set sign-in hours for roles, limit how many devices someone can use at once, and get told about sign-ins from new devices. An Alerts tab lists wrong-password bursts, locks, blocks, new devices, big exports, erasures and changes to people, access and rules. Simulated: it all runs in this browser, so it shows how security behaves but doesn't protect the data until a server enforces it.

## Automation

Workflows can start when a chosen field changes (to a chosen value if you like) or on a schedule, every day or one day a week at an hour. A goal stops a run early once it's met, and each workflow says whether it can run again on the same record: every time, only once, or after some days. Steps include waiting until a set hour on the next working day and creating an opportunity. Every save keeps the version before it, which can be loaded back, and a Results tab shows runs by day, by workflow and what they did.

## Report builder

Reports can show rates (win rate, lead conversion, calls answered, emails opened and replied), group money records by the customer's industry or country, and report on emails and web enquiries. Filters can compare numbers (more than, less than). Charts include a funnel, and a report can be a list of records with chosen columns. Tables can add a share of total or a running total, and mark rows that reach a goal. A report can tell its owner when its 30-day total goes above or below an amount, checked while the CRM is open.

## Requests to other teams

Orders, billing, stock and buying are run in other systems, so the CRM only reads them. Instead of editing, people send a tracked request (a quote, a discount, a credit note, an order change, a reorder and so on) to the right team. Each request has an urgency with a due time, comments both ways, and a result. Pages show which system the data comes from and when it was last updated. You can watch an invoice, order or purchase order to be told when it changes, and "Can we deliver?" works out free stock after open orders, plus what is on order and when.

## Email

Email has templates in folders with their own open and reply rates, Cc and Bcc, forwarding, linking a message to a record, and "remind me if no reply", which adds a follow-up. Campaigns send a template to contacts or leads, can test two subjects, add a footer with an unsubscribe line, respect a daily limit and can be scheduled. Bounces and unsubscribes go on a do-not-email list that campaigns skip. Results show open, reply and bounce rates, people, templates and the best hour to send. Open tracking can be turned off. Simulated: nothing leaves the CRM.

## WhatsApp

Templates have a type, a language and quick-reply buttons, and go through a simulated review before use. Campaigns send an approved template to a chosen audience, leave out people who said stop or haven't agreed to marketing, estimate the cost by country, can be scheduled, and show delivered, read, replied and failed. Automatic replies cover a greeting, an away message using the phone opening hours, keyword replies, and stop and start words. The inbox has open, unassigned and resolved chats, private notes, and can turn a new number into a lead. Simulated: nothing reaches a real phone.

## Calls and video

Calls check the do-not-call list and the customer's local time first, and show your number from their country when you have one. Incoming calls can play a phone menu, follow opening hours and take voicemail. Missed calls and voicemail have their own list to work through. Recording can start on every call and be announced. Coaching reads recorded calls for talk share, questions, mood and tracked words. Video meetings have a link with a waiting room, and calls can share your screen. Simulated: no real audio, video or phone network.

## Web forms

Build forms from lead fields and your own questions, over several pages, with fields that only show for certain answers. Each enquiry becomes a lead or is added to the person's open lead, goes to the right person by rules, and can get an automatic reply. Spam is held to one side by a hidden trap, a time check, blocked words and domains, and an optional sum. Enquiries lists every one, and Results shows views, drop-off by page and where enquiries come from. Share links can carry a campaign. Simulated: forms only work in this browser until there's a server.

## Forecast

Deals sit in forecast categories (Commit, Best case, Pipeline, Omitted). People submit a number for the period, managers can change it with a reason, and teams roll up against quotas. Forecast also lists what changed since a saved weekly copy, and shows how accurate past numbers were. Quarters follow the fiscal year in Settings.

## Tasks and calendar

Tasks can repeat, have checklists and priorities, be selected in bulk, and be viewed by person. Appointments can repeat, invite people and warn about clashes, and can be dragged to a new time. Team availability finds a time when everyone is free, calendar files download for Google, Outlook or Apple calendars, and each person can have a public booking page. Booking pages only work in the browser that holds the data until there's a server.

## Worldwide tax and currencies

Tax can be included in prices or added on top, set by state or region as well as by country, left off for businesses abroad (reverse charge), and recorded against an exemption certificate. There's a tax summary report. Currencies have rate history, exchange gains and losses, and deal revaluation, and CSV downloads show both currencies. People can choose their own number and date format, and customers can have a time zone, which AI Voice follows. Exchange rates are simulated. Nothing here files tax returns.

## Insights and assistant

Insights has a Predictions tab with a revenue forecast and likely range, deals and customers at risk with reasons and next steps, leads to call first, unusual changes this week and a what-if tool. The assistant gives a daily brief, draws charts, remembers the deal you were discussing, takes spoken questions, and changes records after you confirm, with undo. All of this is rules and sums over your records, not a trained AI model.

## Team chat

Chat has reactions, quoted replies, @mentions that always alert, editing and deleting, pinned and saved messages, search across messages, open channels to browse and join, member management, muting, sharable record cards, status, and downloadable files up to 300 KB. Messages only reach other people using this same browser until there's a server.

## AI Voice

Agents have editable questions and answers, and save what people say to the record. Campaigns can be scheduled, respect calling hours, retry unanswered calls and skip a do-not-call list. Calls can be reviewed, and reports show results by agent. No phone is dialled and no AI model runs. Test calls can use the browser's microphone where it's supported.

## Logistics

Deliveries are measured against the promised date, with a needs-attention list, late alerts, delay reasons, proof of delivery, a route planner with vehicle capacity, on-time and cost reports by carrier and destination, and a public tracking page. Tracking and route data are simulated. With the outside-CRM switch on, shipping stays view-only.

## Support cases

Cases have service targets by priority with overdue alerts, queues, escalation, merging, customer replies and internal notes, saved replies, a knowledge base, customer ratings and team performance. Replies appear in the customer portal, and no real email is sent.

## Mobile app and alerts

The CRM can be installed from the browser on a phone or computer, opens without a connection once installed, and has bottom tabs and card-style lists on a phone. Customers have a Check in button. The Alerts page has every alert, snoozing, per-kind choices, quiet hours, a daily summary and real browser pop-ups. Email and phone push are simulated, and there's no store app.

## Connections (simulated)

Connected apps has 14 kinds of system, each with an account step, what to share, field matching, automatic sync and a rule for conflicts. Syncs make up sample changes, such as payments and stock counts, and save them so you can see the effect. It also has sync history, failure alerts, API keys and webhooks. Nothing connects to a real system or leaves the browser.

## Security, logins and backups (simulated)

The Security page (account panel) has a security score, password rules, lockout, idle sign-out, two-step sign-in, single sign-on buttons, allowed network addresses, password resets, sign-in history, active sessions, a recycle bin kept for 30 days, backups with schedule, download and restore, and privacy requests to download or erase a person's details. It all runs in this browser, so it shows how real security behaves but doesn't protect the data.

## Roles and permissions

Access control also has field access (see and edit, see only, not see, per role), sharing rules between people and teams, end dates on personal access, role copying, role comparison, a who-has-access review and a history of access changes. These rules run in the browser, so they aren't real security until there's a server enforcing them.

## Orders, stock and billing

Quotes, orders, billing, shipping and reordering are handled outside the CRM by default. People can view quotes, orders, invoices, payments, shipments, stock and purchase orders and notify others, but not change them. An admin can switch this off in Settings, which turns on the features below.

- Purchasing: suppliers, purchase orders with approval, partial receipts, and reorder suggestions.
- Stock by warehouse, with transfers and stock counts. Receiving updates the average cost.
- Line discounts, price list discounts and a discount limit for salespeople.
- Partial shipments and invoices, credit notes and returns, recurring invoices, receivables ageing and customer statements.
