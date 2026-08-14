# Polis Systems

**Operations infrastructure for distributed waste-collection teams.**

Polis Systems is a field-operations platform designed to help NGOs, coordinators, and waste-management teams assign collection work, track field activity, review submissions, manage collectors, and generate operational reports from one workspace.

The system is built around a simple idea: field teams should be able to work through lightweight interfaces while coordinators retain a reliable, auditable view of what is happening on the ground.

## What Polis Systems Does

Polis Systems provides a central operations layer for managing distributed collection workflows.

Core capabilities include:

- **Operations overview** for active tasks, collector activity, pending reviews, and completion status
- **Task management** for creating, assigning, updating, and tracking field work
- **Collector management** with zone and assignment context
- **Submission review** for validating evidence and resolving field reports
- **Event history** for tracking task-state changes
- **Reporting** for operational summaries and downloadable records
- **CSV export** for external analysis and record-keeping
- **Role-aware administration** for protected coordinator workflows
- **Supabase-backed persistence** for authentication, database access, and storage
- **WhatsApp-oriented architecture** for extending field interaction beyond the web dashboard

## Product Philosophy

Polis Systems is designed for environments where field operations cannot depend on every participant maintaining a complex dashboard account.

The architecture separates two experiences:

**Coordinators and administrators** use the web application to manage operations, review evidence, resolve exceptions, and inspect reports.

**Field collectors** can interact through lightweight workflows, with the system designed to support messaging-based interaction where appropriate.

The goal is not to replace human coordinators. Polis Systems provides the infrastructure needed to make their decisions traceable, consistent, and easier to execute at scale.

## Current Architecture

```text
                    ┌─────────────────────┐
                    │   Admin Dashboard   │
                    │   React / Web UI    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Application / API   │
                    │ Business Logic      │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │      Supabase       │
                    │ Auth • DB • Storage │
                    └──────────┬──────────┘
                               │
                   ┌───────────┴───────────┐
                   ▼                       ▼
          ┌─────────────────┐     ┌─────────────────┐
          │  Web Workflows  │     │ Messaging Layer │
          │ Admin / Review  │     │ WhatsApp-ready  │
          └─────────────────┘     └─────────────────┘
```

The primary operational entities include:

```text
profiles
zones
collectors
tasks
submissions
task_events
whatsapp_sessions
```

## Main Workspaces

### Overview

A high-level operational view for understanding what requires attention, including active work, unresolved submissions, collector activity, completion state, and operational exceptions.

### Tasks

Create and manage field assignments while preserving their status and history.

Tasks can represent:

- collection assignments
- verification visits
- follow-up actions
- zone-specific operations

### Review

Provides a dedicated workflow for inspecting field submissions before they are treated as verified operational records.

**Submission does not automatically mean approval.**

### Collectors

Maintains the operational registry for people carrying out field work, including assignment and zone context.

### Reports

Transforms operational records into coordinator-facing summaries and exportable data.

### Settings

Contains administrative and configuration controls restricted to authorized users.

## Task Lifecycle

```text
Task Created
     │
     ▼
Task Assigned
     │
     ▼
Field Work
     │
     ▼
Submission Received
     │
     ▼
Coordinator Review
     │
     ├──────────────► Changes / Follow-up Required
     │
     ▼
Approved
     │
     ▼
Recorded in Reports
```

Task events preserve a history of state changes rather than relying exclusively on the latest visible status.

## Technology

Polis Systems uses a modern TypeScript web stack with Supabase providing core backend infrastructure.

The project includes components for:

- React-based user interfaces
- TypeScript application logic
- Supabase authentication
- PostgreSQL-backed data persistence
- storage-backed submission artifacts
- server/API workflows
- operational reporting
- CSV generation
- messaging integration architecture

See the repository source and configuration files for exact dependency versions.

## Running Locally

### 1. Clone the repository

```bash
git clone https://github.com/starchild-codes/polis-systems.git
cd polis-systems
```

### 2. Install dependencies

```bash
bun install
```

or:

```bash
npm install
```

Use the package manager corresponding to the current repository configuration.

### 3. Configure environment variables

Copy the example configuration:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill in only the credentials required by your environment.

**Never commit production credentials, service-role keys, access tokens, or private administrative URLs.**

### 4. Start development

```bash
npm run dev
```

or, where configured:

```bash
bun run dev
```

### 5. Build for production

```bash
npm run build
```

A successful production build should be treated as a minimum deployment requirement.

## Security

Polis Systems handles operational data and should be deployed with explicit access controls.

Production deployments should enforce:

- authenticated access to administrative surfaces
- role-based authorization
- database-level access policies
- restricted storage access
- server-side handling of privileged secrets
- validation of incoming field data
- auditable state changes
- appropriate backup and recovery procedures

Never expose:

```text
Supabase service-role keys
private API keys
WhatsApp provider secrets
administrative tokens
database passwords
private callback secrets
production credentials
```

## Data Integrity

Polis Systems treats operational records as more than dashboard state.

Important actions should be persisted so coordinators can determine:

- what happened
- who performed an action
- when it occurred
- how state changed
- whether a submission was reviewed
- whether intervention was required

This is why task history and review workflows are first-class parts of the system rather than cosmetic UI features.

## WhatsApp Integration

Polis Systems is structured to support messaging-based field workflows.

```text
Coordinator creates task
        │
        ▼
Collector receives assignment
        │
        ▼
Collector reports progress
        │
        ▼
Polis Systems associates session with task
        │
        ▼
Submission enters review queue
        │
        ▼
Coordinator validates outcome
```

Messaging integrations should remain separated from core operational state. The database, not the messaging platform, should remain the source of truth.

## Repository Structure

```text
polis-systems/
├── api/                  # Server/API functionality
├── docs/                 # Product and technical documentation
├── src/                  # Main application source
├── attached_assets/      # Project assets
├── .env.example          # Environment variable template
├── package.json          # Project scripts and dependencies
├── bun.lock              # Dependency lockfile
└── README.md
```

## Development Principles

1. **The database is the source of truth.**
2. **Administrative actions require authorization, not just hidden UI controls.**
3. **Field submissions and approved records are distinct states.**
4. **Important state changes should be auditable.**
5. **Secrets must remain server-side.**
6. **Operational correctness takes priority over decorative complexity.**
7. **Messaging integrations should not dictate the underlying data model.**
8. **Production behavior should not depend on mock or hard-coded records.**

## Current Status

Polis Systems is under active development.

The current implementation focuses on establishing the core operational workflow:

```text
Authentication
      ↓
Authorization
      ↓
Collectors
      ↓
Tasks
      ↓
Submissions
      ↓
Review
      ↓
Overview
      ↓
Reports / CSV
      ↓
Messaging integration
```

Some functionality may still be evolving and should not automatically be treated as production-ready without deployment-specific validation.

## Planned Direction

Future development may include:

- stronger messaging-based field workflows
- richer operational analytics
- configurable task assignment
- improved review and exception handling
- more detailed audit trails
- deployment-level monitoring
- organization-level isolation
- safer automated reporting
- offline-tolerant field workflows where feasible

## Scope

Polis Systems is an **operations-management system**, not an automated authority for determining environmental impact or worker performance.

Operational metrics should not be interpreted as standalone measures of:

- worker quality
- environmental outcomes
- waste-processing effectiveness
- social impact
- program success

Those conclusions require evidence beyond application activity.

## Contributing

Issues and pull requests should:

- describe the operational problem being solved
- avoid introducing secrets or private data
- preserve authorization boundaries
- include tests or verification steps where appropriate
- document schema changes
- keep user-facing behavior consistent with stored system state

For substantial architecture changes, document the rationale before modifying database structure or critical workflows.

## License

Licensing information should be taken from the repository's current license file or project-owner documentation.

Third-party libraries and services remain governed by their respective licenses and terms.

---

**Polis Systems** is built around a practical problem: making distributed field operations easier to coordinate without losing accountability, context, or traceability.
