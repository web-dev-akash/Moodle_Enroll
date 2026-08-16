# Moodle Enrolment & Scheduling Service

Node.js/Express service that automates the operational glue between a Moodle LMS, Zoho CRM, Google Sheets and WhatsApp. It provisions LMS accounts, enrols and un-enrols students in courses, issues one-time login links, publishes class schedules and pushes templated result messages to students.

## Overview

Onboarding one student meant creating a Moodle account by hand, enrolling them in the course matching their grade, updating the CRM record, and messaging them the week's schedule. At a few hundred students a week that stops being feasible.

This service turns each of those steps into an endpoint, so the CRM and the front-end apps can trigger them directly and the recurring work runs on a schedule.

## Key Features

- **LMS account provisioning** — creates Moodle users (including trial accounts) through Moodle's REST web services
- **Course enrolment** — manual enrol/unenrol, paid one-month and three-month tiers, and one-off competition enrolment
- **One-time login links** — generates authenticated Moodle entry links for first login and regular login flows
- **Subject reports** — per-subject report endpoints (maths, English, science, GK) with percentile-based ranking inside a grade
- **Referrals** — referral link generation and capture written back to the CRM
- **Schedules** — daily, weekly, workshop and reminder schedules read from Google Sheets and exposed as JSON
- **WhatsApp templates** — templated result messages (topic, highest score, average score, participant count) delivered through WATI
- **Scheduled jobs** — `node-cron` job for recurring schedule publication

## Tech Stack

Node.js · Express · Axios · Google Sheets API · node-cron · dayjs · percentile · node-fetch · CORS · dotenv

Moodle web services · Zoho CRM · WATI (WhatsApp Business API) · PM2 · GitHub Actions

## Architecture / How It Works

```
index.js          Express app - 35 endpoints
tags.json         Zoho CRM tag definitions used for deal tagging
ecosystem.json    PM2 process definition
.github/          deploy workflow
```

The service is a single Express application that sits between four external systems:

- **Moodle** — called over Moodle's REST web-service API (`wstoken` / `wsfunction`), using `core_user_create_users` to provision accounts and `enrol_manual` to place them in courses
- **Zoho CRM** — OAuth client-credential refresh, then reads and writes contact and deal records so enrolment state and referrals stay in sync
- **Google Sheets** — the schedule spreadsheets are the source of truth for class timings; the service reads them and serves normalised JSON
- **WATI** — outbound WhatsApp templates for reports and reminders

A typical flow: the CRM (or a front-end app) posts to `/newUser`, the service creates the Moodle account, enrols the student into the grade-appropriate course, writes the LMS id back to the CRM record, then returns a one-time login link the student can be sent directly.

## Engineering Challenges

**Idempotent provisioning.** Enrolment requests arrive from more than one place, so create-and-enrol paths check for an existing Moodle user before creating one; a retried request should not produce a duplicate account.

**Zoho OAuth lifecycle.** Access tokens expire hourly while enrolment traffic is continuous, so the refresh token flow is run ahead of CRM calls rather than reactively on failure.

**Human-edited spreadsheets as an API.** Schedules are maintained by non-engineers in Google Sheets. Parsing is defensive about blank rows, changed column order and inconsistent time formats rather than assuming a fixed shape.

**Ranking inside a cohort.** Report endpoints rank a student against their own grade using percentiles rather than raw scores, so a report stays meaningful as cohort size changes week to week.

## Running Locally

```bash
git clone https://github.com/web-dev-akash/Moodle_Enroll.git
cd Moodle_Enroll
npm install
# create a .env file with the variables below
npm start
```

## Environment Variables

All configuration is read from the environment — no credentials are committed to this repository.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port |
| `WSTOKEN` | Moodle web-service token |
| `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN`, `AUTH_TOKEN` | Zoho CRM OAuth credentials |
| `WATI_TOKEN` | WATI WhatsApp Business API token |
| `SPREADSHEET_ID`, `SCHEDULE_SPREADSHEET_ID`, `NEW_SCHEDULE_SPREADSHEET_ID` | Google Sheets sources |
| `SHORTNER_API` | URL shortener used for login and schedule links |

## Future Improvements

- Split `index.js` into routers and service modules by domain (users, enrolment, schedule, reports)
- Replace ad-hoc validation with a schema layer
- Cache Google Sheets reads instead of fetching per request
