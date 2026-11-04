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

## Language

Click the language icon at the top right, then search or pick a language. Indian languages and Arabic are listed first, each in its own script, and the icon shows the current language. Company and people's names stay as written in the sidebar and next to avatars. Translation uses Google Translate's website widget, so it needs internet access, sends page text to Google, and covers the languages Google supports. The choice is saved in this browser.

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
