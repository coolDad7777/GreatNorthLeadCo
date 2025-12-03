# CLAUDE.md - North Lead Connect

## Project Overview

**North Lead Connect** is a CRM-style application designed for tracking general contractor (GC) outreach. It enables users to manage leads, log calls, track next actions, and maintain visibility into their sales pipeline.

### Purpose
- Capture and manage contractor leads with company details, contacts, and status
- Log call outcomes and maintain conversation history
- Track next actions and follow-up dates
- Provide a visual pipeline dashboard with real-time status updates

### Technology Philosophy
- **PocketBase** for backend: Self-hosted, file-based database with built-in auth and real-time subscriptions
- **React Query** for state management: Optimistic updates and aggressive caching
- **Tailwind CSS** for styling: Utility-first with custom design system
- **Vite** for build tooling: Fast development and optimized production builds

---

## Tech Stack

### Core Technologies
- **Frontend Framework**: React 18.3.1 with TypeScript 5.5.3
- **Build Tool**: Vite 5.4.1 with SWC plugin for fast refresh
- **Backend**: PocketBase 0.26.3 (self-hosted, external process)
- **State Management**: TanStack React Query 5.56.2
- **Styling**: Tailwind CSS 3.4.11 with custom design tokens
- **UI Components**: Radix UI primitives (accessible, unstyled components)
- **Forms**: React Hook Form 7.53.0 with Zod 3.23.8 validation
- **Date Handling**: date-fns 3.6.0
- **Icons**: Lucide React 0.462.0

### Development Tools
- **Linting**: ESLint 9.9.0 with TypeScript ESLint
- **TypeScript Config**: Relaxed rules (noImplicitAny: false, strictNullChecks: false)
- **PostCSS**: Autoprefixer for CSS vendor prefixing

---

## Codebase Structure

### File Organization

```
/
├── App.tsx                    # Main application component with all business logic
├── main.tsx                   # React entry point and root render
├── index.html                 # HTML shell
├── index.css                  # Global styles and Tailwind imports
├── lib/
│   └── pocketbase.ts         # PocketBase client initialization
├── pb_migrations/
│   └── 1738760000_init_collections.js  # Database schema migration
├── public/
│   ├── og.png                # Open graph image
│   └── placeholder.svg       # Placeholder assets
├── dist/                      # Production build output (generated)
├── vite.config.ts            # Vite bundler configuration
├── tailwind.config.ts        # Tailwind CSS configuration
├── tsconfig.json             # TypeScript base configuration
├── tsconfig.app.json         # App-specific TS config
├── tsconfig.node.json        # Node/build scripts TS config
├── components.json           # shadcn/ui configuration (if used)
├── eslint.config.js          # ESLint configuration
├── postcss.config.js         # PostCSS configuration
├── package.json              # Dependencies and scripts
└── README.md                 # User-facing setup instructions
```

### Key Architectural Decisions

1. **Single File Component**: All application logic lives in `App.tsx` (829 lines)
   - Auth management
   - Lead and call log CRUD operations
   - UI components (forms, tables, cards)
   - Layout and styling

2. **No src/ Directory**: Files are organized in the project root with `lib/` for utilities
   - TypeScript path alias `@/*` points to `./src/*` but currently unused
   - Consider migration to `src/` structure if codebase grows

3. **Collocated Components**: UI components are defined inline within App.tsx
   - `Input`, `StatusPill`, `PocketBaseStatus`, `AuthScreen`, `MissingConfig`
   - No separate components directory yet

---

## Development Setup

### Prerequisites

1. **Node.js**: v18+ (for React 18 and Vite)
2. **PocketBase**: Download from https://pocketbase.io/
3. **Environment Variables**: Create `.env.local` with:
   ```env
   VITE_POCKETBASE_URL=http://127.0.0.1:8090
   ```

### Installation and Running

```bash
# Install dependencies
npm install

# Start PocketBase (in separate terminal)
./pocketbase serve --http="0.0.0.0:8090"

# Run migrations (if needed)
# PocketBase will auto-apply migrations from pb_migrations/ on startup

# Start development server
npm run dev
# App runs on http://localhost:8080

# Build for production
npm run build

# Preview production build
npm run preview
```

### First-Time Setup

1. Start PocketBase and navigate to admin UI: http://127.0.0.1:8090/_/
2. PocketBase will auto-create collections from `pb_migrations/1738760000_init_collections.js`
3. Create a user account via the app's sign-up flow or admin UI
4. Sign in and start adding leads

---

## Database Schema (PocketBase)

### Collections

#### `users` (built-in auth collection)
- **Fields**: email, password (hashed)
- **Purpose**: User authentication and ownership

#### `leads`
- **owner** (relation to users, required): User who owns this lead
- **company** (text, required): Company name
- **contact_name** (text): Primary contact person
- **trade** (text): Type of trade (e.g., "Plumbing", "Electrical")
- **phone** (text): Phone number
- **email** (email): Email address
- **status** (text): Lead status (see statuses below)
- **next_action** (date): Scheduled follow-up date
- **last_outcome** (text): Most recent call outcome
- **notes** (text): General notes about the lead

**Rules**:
- List/View/Update/Delete: `owner = @request.auth.id`
- Create: `@request.auth.id != '' && owner = @request.auth.id`

#### `call_logs`
- **owner** (relation to users, required): User who logged the call
- **lead** (relation to leads, required): Associated lead
- **outcome** (text, required): Call outcome (e.g., "Connected", "Voicemail")
- **notes** (text): Call notes
- **next_action** (date): Next scheduled action from this call

**Rules**:
- List/View/Delete: `owner = @request.auth.id`
- Create: `@request.auth.id != '' && owner = @request.auth.id`
- Update: No update rule (immutable after creation)

### Lead Statuses

Defined in `App.tsx:20-27`:
- `"New"` - Initial intake
- `"In Progress"` - Actively working
- `"Connected"` - Made contact
- `"Nurture"` - Long-term follow-up
- `"Closed Won"` - Successfully converted
- `"Closed Lost"` - Opportunity lost

---

## Key Components and Architecture

### Authentication Flow (`usePocketAuth` hook)

Located in `App.tsx:105-178`

**Purpose**: Manages PocketBase authentication state and provides auth methods

**Key Features**:
- Auto-refresh on mount if valid token exists
- Reactive updates via `pb.authStore.onChange`
- Sign in, sign up, and sign out methods
- Error and success message handling

**States**:
- `isReady`: Auth check completed
- `user`: Current authenticated user or null
- `email`, `password`: Form inputs
- `message`, `error`: User feedback

### Data Fetching with React Query

Located in `App.tsx:186-273`

**Queries**:
1. `["leads", userId]` - Fetch user's leads, sorted by next_action and creation date
2. `["call_logs", userId]` - Fetch call logs with expanded lead relation

**Mutations**:
1. `createLead` - Create new lead
2. `updateLead` - Update lead status/next_action
3. `logCall` - Create call log and update lead's last_outcome/notes

**Invalidation Strategy**:
- After mutations, invalidate relevant queries to trigger refetch
- Ensures UI stays in sync with database

### Component Hierarchy

```
AppShell (entry point)
├─ If no PocketBase config: MissingConfig
└─ If config exists:
   └─ QueryClientProvider
      └─ AuthedApp
         ├─ If not ready: Loading screen
         ├─ If not authenticated: AuthScreen
         └─ If authenticated: AppContent
            ├─ Header (logo, user email, sign out)
            ├─ Hero section (stats dashboard, next action widget)
            ├─ Forms section (add lead, log call)
            ├─ Pipeline table (all leads with inline actions)
            └─ Recent calls section (call log cards)
```

---

## Development Workflows

### Adding a New Feature

1. **Backend Changes** (if needed):
   - Create a new migration file in `pb_migrations/`
   - Run PocketBase to apply migration
   - Update collection rules in PocketBase admin UI

2. **Frontend Changes**:
   - Add TypeScript types for new data models in `App.tsx`
   - Create React Query hooks for data fetching
   - Add mutations for write operations
   - Build UI components inline or extract to separate files if reusable
   - Update invalidation logic to keep UI fresh

3. **Testing**:
   - Manual testing in dev mode (`npm run dev`)
   - Test auth flows (sign in, sign out, token refresh)
   - Verify data persistence and real-time updates

### Common Development Tasks

#### Adding a New Field to Leads

1. Create PocketBase migration to add field
2. Update `Lead` type in `App.tsx:29-40`
3. Add form input in lead intake form (`App.tsx:398-471`)
4. Update `createLead` mutation payload
5. Display field in pipeline table if relevant

#### Changing Lead Statuses

1. Update `statuses` array in `App.tsx:20-27`
2. Update `StatusPill` color mapping in `App.tsx:680-687`
3. Test status transitions in UI

#### Styling Updates

- Modify Tailwind utility classes directly in JSX
- Update `tailwind.config.ts` for theme-level changes
- Custom animations and keyframes defined in tailwind.config.ts:77-100

---

## Conventions and Best Practices

### Code Style

1. **TypeScript**:
   - Prefer type inference over explicit types
   - Use `RecordModel` from PocketBase for base types
   - Extend with intersection types for collection fields

2. **React**:
   - Functional components with hooks
   - `useState` for local form state
   - React Query for server state
   - Avoid prop drilling - consider context if component tree deepens

3. **Styling**:
   - Tailwind utility classes for all styling
   - Custom design system: cyan/emerald gradients, slate backgrounds
   - Responsive design with `sm:`, `lg:` prefixes
   - Dark theme by default (slate-950 background)

4. **Naming**:
   - PascalCase for components (`AuthScreen`, `StatusPill`)
   - camelCase for functions and variables
   - Descriptive names for mutations (`createLead`, not `create`)

### PocketBase Patterns

1. **Always include owner**:
   ```typescript
   await pb.collection("leads").create({
     ...data,
     owner: userId,
   });
   ```

2. **Filter by owner in queries**:
   ```typescript
   filter: `owner = "${userId}"`
   ```

3. **Expand relations**:
   ```typescript
   .getFullList({ expand: "lead" })
   ```

4. **Disable auto-cancellation** for React Fast Refresh:
   ```typescript
   pb.autoCancellation(false);
   ```

### React Query Patterns

1. **Query keys include userId for cache isolation**:
   ```typescript
   queryKey: ["leads", userId]
   ```

2. **Invalidate after mutations**:
   ```typescript
   onSuccess: () => {
     qc.invalidateQueries({ queryKey: ["leads"] });
   }
   ```

3. **Use `enabled` to prevent premature fetching**:
   ```typescript
   enabled: !!userId
   ```

---

## Important Files and Their Purpose

### `App.tsx`
**Purpose**: Single source of truth for application logic
**Key Exports**: `AppShell` (default export)
**Contains**:
- Type definitions for `Lead`, `CallLog`, `LeadStatus`
- Auth hook (`usePocketAuth`)
- Main application component (`AppContent`)
- UI components (forms, tables, status pills)
- All business logic (CRUD operations, computed stats)

### `lib/pocketbase.ts`
**Purpose**: Initialize and export PocketBase client
**Key Exports**: `pb` (PocketBase instance or null if no URL)
**Configuration**:
- Reads `VITE_POCKETBASE_URL` from environment
- Disables auto-cancellation for React Fast Refresh compatibility

### `pb_migrations/1738760000_init_collections.js`
**Purpose**: Database schema initialization
**Contains**:
- Collection definitions for `leads` and `call_logs`
- Field schemas with types and validation rules
- Collection-level access control rules
- Rollback logic for down migrations

### `vite.config.ts`
**Purpose**: Vite bundler configuration
**Settings**:
- Dev server on port 8080
- React SWC plugin for fast refresh
- Path alias: `@` → `./src` (currently unused)

### `tailwind.config.ts`
**Purpose**: Tailwind CSS customization
**Customizations**:
- Extended color palette with CSS variables
- Custom animations (accordion, fade, slide)
- Typography plugin for rich text
- Font families: Inter (sans), JetBrains Mono (mono)

### `tsconfig.json`
**Purpose**: TypeScript compiler settings
**Notable Settings**:
- `noImplicitAny: false` - Allows implicit any types
- `strictNullChecks: false` - Relaxed null checking
- `baseUrl: "."` and `paths` for `@/*` alias

---

## Environment Variables

### Required

- **`VITE_POCKETBASE_URL`**: PocketBase server URL
  - Development: `http://127.0.0.1:8090`
  - Production: Your hosted PocketBase instance URL

### Configuration

1. Create `.env.local` in project root (gitignored)
2. Add: `VITE_POCKETBASE_URL=http://127.0.0.1:8090`
3. Restart dev server after changes

---

## Common Issues and Solutions

### "PocketBase credentials missing"
- **Cause**: `VITE_POCKETBASE_URL` not set or `.env.local` missing
- **Solution**: Create `.env.local` and set the URL, then restart `npm run dev`

### "401 Unauthorized" on queries
- **Cause**: Auth token expired or invalid
- **Solution**: App auto-refreshes on mount; sign out and back in if persists

### "Failed to fetch" errors
- **Cause**: PocketBase server not running
- **Solution**: Start PocketBase with `./pocketbase serve`

### Collections not found
- **Cause**: Migrations not applied
- **Solution**: PocketBase auto-applies migrations from `pb_migrations/` on startup

### Type errors with PocketBase records
- **Cause**: Missing type definitions or incorrect `RecordModel` usage
- **Solution**: Extend `RecordModel` with collection-specific fields:
  ```typescript
  type Lead = RecordModel & {
    owner: string;
    company: string;
    // ... other fields
  };
  ```

---

## AI Assistant Guidelines

### When Making Changes

1. **Always read before editing**: Use the Read tool on App.tsx before modifications
2. **Preserve types**: Update TypeScript types when adding fields or changing data structures
3. **Maintain data flow**:
   - Queries fetch data
   - Mutations write data
   - Invalidations refresh UI
4. **Follow styling patterns**: Use existing Tailwind utility combinations for consistency
5. **Test auth flows**: Ensure changes work for both authenticated and unauthenticated states

### Code Modification Patterns

#### Adding a Form Field
```typescript
// 1. Update type
type Lead = RecordModel & {
  newField: string; // Add this
  // ... existing fields
};

// 2. Update initial form state
const initialLeadForm = {
  newField: "", // Add this
  // ... existing fields
};

// 3. Add input to form JSX
<Input
  label="New Field"
  value={leadForm.newField}
  onChange={(e) => setLeadForm({ ...leadForm, newField: e.target.value })}
/>

// 4. Update mutation payload (if needed)
await pb!.collection("leads").create({
  ...rest,
  newField: payload.newField,
  owner: userId,
});
```

#### Adding a New Query
```typescript
const { data: newData = [] } = useQuery({
  queryKey: ["new_data", userId],
  enabled: !!userId,
  queryFn: async () => {
    return await pb!.collection("new_collection").getFullList({
      filter: `owner = "${userId}"`,
      sort: "-created",
    });
  },
});
```

#### Creating a Mutation
```typescript
const doSomething = useMutation({
  mutationFn: async (payload: SomeType) => {
    if (!userId) throw new Error("Not authenticated");
    await pb!.collection("collection_name").create({
      ...payload,
      owner: userId,
    });
  },
  onSuccess: () => {
    // Reset form state if applicable
    qc.invalidateQueries({ queryKey: ["relevant_query"] });
  },
});
```

### Debugging Checklist

1. **PocketBase connection**: Check browser console for fetch errors
2. **Auth state**: Verify `auth.user` exists before data operations
3. **Query keys**: Ensure query keys match in invalidation calls
4. **Type mismatches**: Check PocketBase returns match TypeScript types
5. **Environment**: Confirm `.env.local` loaded (restart dev server)

---

## Future Improvements

### Potential Enhancements

1. **Code Organization**:
   - Split App.tsx into multiple files (hooks, components, types)
   - Move to `src/` directory structure
   - Create reusable component library

2. **Features**:
   - Search and filter leads by company, status, or trade
   - Export leads to CSV
   - Email templates for outreach
   - Calendar integration for next actions
   - Real-time updates with PocketBase subscriptions
   - Bulk operations (status updates, exports)

3. **Testing**:
   - Add unit tests for hooks and utilities
   - Integration tests for auth and CRUD flows
   - E2E tests with Playwright or Cypress

4. **Performance**:
   - Virtual scrolling for large lead lists
   - Optimize re-renders with React.memo
   - Lazy load routes if app grows

5. **Developer Experience**:
   - Add shadcn/ui components properly (currently config exists but unused)
   - Strict TypeScript mode for better type safety
   - Pre-commit hooks for linting and formatting

---

## Quick Reference

### File Locations
- Main app logic: `App.tsx`
- PocketBase client: `lib/pocketbase.ts`
- Database schema: `pb_migrations/1738760000_init_collections.js`
- Styles: `index.css`, `tailwind.config.ts`
- Build config: `vite.config.ts`, `tsconfig.json`

### Key Concepts
- **Auth**: PocketBase email/password, auto-refresh on mount
- **Data**: React Query for caching and invalidation
- **Styling**: Tailwind CSS with cyan/emerald/slate color scheme
- **Database**: PocketBase collections with owner-based access control

### Development Commands
```bash
npm run dev        # Start dev server (port 8080)
npm run build      # Production build
npm run preview    # Preview production build
npm run lint       # Run ESLint
```

### PocketBase Commands
```bash
./pocketbase serve                # Start on default port 8090
./pocketbase serve --http=":9000" # Custom port
```

---

## Conclusion

This codebase follows a pragmatic approach: simple, direct, and optimized for rapid iteration. The single-file architecture keeps everything visible and easy to navigate for small-to-medium projects. As complexity grows, consider splitting into modules while maintaining the clear separation between server state (React Query) and local state (useState).

For any questions or clarifications, refer to the inline comments in `App.tsx` or the PocketBase documentation at https://pocketbase.io/docs.
