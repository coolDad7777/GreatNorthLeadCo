import React, { useEffect, useMemo, useState } from "react";
import type { RecordModel } from "pocketbase";
import { pb } from "./lib/pocketbase";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

type LeadStatus =
  | "New"
  | "In Progress"
  | "Connected"
  | "Nurture"
  | "Closed Won"
  | "Closed Lost";

const statuses: LeadStatus[] = [
  "New",
  "In Progress",
  "Connected",
  "Nurture",
  "Closed Won",
  "Closed Lost",
];

type Lead = RecordModel & {
  owner: string;
  company: string;
  contact_name?: string;
  trade?: string;
  phone?: string;
  email?: string;
  status: LeadStatus;
  next_action?: string;
  last_outcome?: string;
  notes?: string;
};

type CallLog = RecordModel & {
  owner: string;
  lead: string;
  outcome: string;
  notes?: string;
  next_action?: string;
  expand?: {
    lead?: Lead;
  };
};

const queryClient = new QueryClient();

const initialLeadForm = {
  company: "",
  contact_name: "",
  trade: "",
  phone: "",
  email: "",
  status: "New" as LeadStatus,
  next_action: "",
  notes: "",
};

const initialCallForm = {
  lead: "",
  outcome: "Connected",
  notes: "",
  next_action: "",
};

function AppShell() {
  if (!pb) {
    return <MissingConfig />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthedApp />
    </QueryClientProvider>
  );
}

function AuthedApp() {
  const auth = usePocketAuth();

  if (!auth.isReady) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-lg text-slate-200">Checking session...</p>
        </div>
      </div>
    );
  }

  if (!auth.user) {
    return <AuthScreen auth={auth} />;
  }

  return <AppContent auth={auth} />;
}

function usePocketAuth() {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<RecordModel | null>(pb?.authStore.model ?? null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pb) return;
    let cancelled = false;

    const unsub = pb.authStore.onChange(() => {
      if (cancelled) return;
      setUser(pb.authStore.model);
    });

    (async () => {
      try {
        if (pb.authStore.isValid) {
          await pb.collection("users").authRefresh();
        }
      } catch (_) {
        pb.authStore.clear();
      }
      if (!cancelled) {
        setIsReady(true);
        setUser(pb.authStore.model);
      }
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const signIn = async () => {
    setError("");
    setMessage("");
    try {
      await pb?.collection("users").authWithPassword(email.trim(), password);
    } catch (err: any) {
      setError(err?.message || "Sign-in failed");
    }
  };

  const signUp = async () => {
    setError("");
    setMessage("");
    if (!email.trim() || !password) {
      setError("Enter email and password");
      return;
    }
    try {
      await pb?.collection("users").create({
        email: email.trim(),
        password,
        passwordConfirm: password,
      });
      await pb?.collection("users").authWithPassword(email.trim(), password);
      setMessage("Account created and signed in.");
    } catch (err: any) {
      setError(err?.message || "Sign-up failed");
    }
  };

  const signOut = async () => {
    pb?.authStore.clear();
    setUser(null);
  };

  return { user, isReady, email, setEmail, password, setPassword, signIn, signUp, signOut, message, error };
}

function AppContent({ auth }: { auth: ReturnType<typeof usePocketAuth> }) {
  const userId = auth.user?.id as string;
  const qc = useQueryClient();
  const [leadForm, setLeadForm] = useState(initialLeadForm);
  const [callForm, setCallForm] = useState(initialCallForm);

  const {
    data: leads = [],
    isLoading: leadsLoading,
    error: leadsError,
  } = useQuery({
    queryKey: ["leads", userId],
    enabled: !!userId,
    queryFn: async () => {
      const list = await pb!
        .collection("leads")
        .getFullList<Lead>({
          filter: `owner = "${userId}"`,
          sort: "next_action,-created",
        });
      return list;
    },
  });

  const { data: callLogs = [] } = useQuery({
    queryKey: ["call_logs", userId],
    enabled: !!userId,
    queryFn: async () => {
      const list = await pb!
        .collection("call_logs")
        .getFullList<CallLog>({
          filter: `owner = "${userId}"`,
          sort: "-created",
          expand: "lead",
        });
      return list;
    },
  });

  const createLead = useMutation({
    mutationFn: async (payload: typeof initialLeadForm) => {
      if (!userId) throw new Error("Not authenticated");
      const { next_action, ...rest } = payload;
      await pb!.collection("leads").create({
        ...rest,
        owner: userId,
        next_action: next_action || null,
      });
    },
    onSuccess: () => {
      setLeadForm(initialLeadForm);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const updateLead = useMutation({
    mutationFn: async (payload: { id: string; status: LeadStatus; next_action?: string }) => {
      const { id, status, next_action } = payload;
      await pb!.collection("leads").update(id, {
        status,
        next_action: next_action || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const logCall = useMutation({
    mutationFn: async (payload: typeof initialCallForm) => {
      const { lead, outcome, notes, next_action } = payload;
      if (!lead) throw new Error("Select a lead to log the call.");
      if (!userId) throw new Error("Not authenticated");

      await pb!.collection("call_logs").create({
        owner: userId,
        lead,
        outcome,
        notes: notes || null,
        next_action: next_action || null,
      });

      await pb!.collection("leads").update(lead, {
        last_outcome: outcome,
        next_action: next_action || null,
        notes: notes || null,
      });
    },
    onSuccess: () => {
      setCallForm(initialCallForm);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["call_logs"] });
    },
  });

  const stats = useMemo(() => {
    const baseTotals = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<LeadStatus, number>;
    const totals = leads.reduce((acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, baseTotals);

    const nextAction = leads
      .filter((lead) => lead.next_action)
      .sort((a, b) => (a.next_action || "").localeCompare(b.next_action || ""))[0];

    return { totals, nextAction };
  }, [leads]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.08),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(34,197,94,0.06),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(139,92,246,0.06),transparent_30%)]" />

        <header className="relative z-10 border-b border-white/5 bg-black/30 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-lg font-semibold text-cyan-300 ring-1 ring-cyan-500/30">
                NL
              </span>
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">North Lead</p>
                <p className="text-base font-semibold text-white">GC Outreach Workspace</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
                {auth.user?.email}
              </span>
              <button
                onClick={auth.signOut}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80 transition hover:border-cyan-400/60 hover:text-white"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="relative z-10">
          <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-12 pt-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div className="space-y-8">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200/80">
                Live contractor pipeline
              </p>
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  Turn your GC outreach into a trackable, repeatable workflow.
                </h1>
                <p className="text-lg text-slate-300">
                  Intake leads, log calls, and keep next steps visible. PocketBase keeps the data persistent while React Query keeps it snappy.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {statuses.slice(0, 3).map((status) => (
                  <div key={status} className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-cyan-500/5">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{status}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{stats.totals[status] || 0}</p>
                    <p className="text-sm text-slate-400">Leads in this state</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-200">
                <span className="rounded-full bg-white/5 px-4 py-2 ring-1 ring-white/10">Scripts + notes captured</span>
                <span className="rounded-full bg-white/5 px-4 py-2 ring-1 ring-white/10">Next actions visible</span>
                <span className="rounded-full bg-white/5 px-4 py-2 ring-1 ring-white/10">Export-ready data</span>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-cyan-500/10">
              <PocketBaseStatus email={auth.user?.email || ""} />
              <div className="rounded-xl border border-white/5 bg-slate-900/50 p-4">
                <p className="text-sm font-semibold text-white">Next action</p>
                {stats.nextAction ? (
                  <div className="mt-2 space-y-1 text-sm text-slate-200">
                    <p className="text-base font-semibold text-white">{stats.nextAction.company}</p>
                    <p className="text-slate-300">{stats.nextAction.last_outcome || "No recent call logged"}</p>
                    <p className="text-xs text-cyan-200">Due {formatDate(stats.nextAction.next_action)}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-300">Add a lead to populate the next action queue.</p>
                )}
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-900/50 p-4">
                <p className="text-sm font-semibold text-white">Latest calls</p>
                <div className="mt-3 space-y-3 text-sm text-slate-200">
                  {callLogs.length === 0 && <p className="text-slate-400">No calls logged yet.</p>}
                  {callLogs.slice(0, 4).map((log) => (
                    <div key={log.id} className="rounded-lg bg-white/5 px-3 py-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{log.expand?.lead?.company || "Lead"}</span>
                        <span>{new Date(log.created).toLocaleDateString()}</span>
                      </div>
                      <p className="mt-1 font-semibold text-white">{log.outcome}</p>
                      {log.notes && <p className="text-slate-300">{log.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-white/5 bg-black/30">
            <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 rounded-3xl border border-white/5 bg-white/5 p-6 shadow-xl shadow-cyan-500/5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">Lead intake</p>
                    <h2 className="text-2xl font-semibold text-white">Add a GC lead</h2>
                  </div>
                  <span className="text-xs text-slate-400">Required: company</span>
                </div>
                <form
                  className="grid gap-4 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createLead.mutate(leadForm);
                  }}
                >
                  <Input
                    label="Company *"
                    value={leadForm.company}
                    onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
                    required
                  />
                  <Input
                    label="Contact name"
                    value={leadForm.contact_name}
                    onChange={(e) => setLeadForm({ ...leadForm, contact_name: e.target.value })}
                  />
                  <Input
                    label="Trade"
                    value={leadForm.trade}
                    onChange={(e) => setLeadForm({ ...leadForm, trade: e.target.value })}
                  />
                  <Input
                    label="Phone"
                    value={leadForm.phone}
                    onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={leadForm.email}
                    onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                  />
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Status</label>
                    <select
                      className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent transition focus:ring-cyan-400/60"
                      value={leadForm.status}
                      onChange={(e) =>
                        setLeadForm({ ...leadForm, status: e.target.value as LeadStatus })
                      }
                    >
                      {statuses.map((s) => (
                        <option key={s} value={s} className="bg-slate-900">
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Next action date"
                    type="date"
                    value={leadForm.next_action}
                    onChange={(e) => setLeadForm({ ...leadForm, next_action: e.target.value })}
                  />
                  <div className="sm:col-span-2 grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Notes</label>
                    <textarea
                      className="min-h-[100px] rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent transition focus:ring-cyan-400/60"
                      value={leadForm.notes}
                      onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      className="rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition hover:from-cyan-300 hover:to-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={createLead.isPending || !leadForm.company.trim()}
                    >
                      {createLead.isPending ? "Saving..." : "Save lead"}
                    </button>
                    {createLead.isError && (
                      <span className="text-sm text-rose-300">{String(createLead.error)}</span>
                    )}
                    {createLead.isSuccess && (
                      <span className="text-sm text-emerald-300">Lead saved</span>
                    )}
                  </div>
                </form>
              </div>

              <div className="space-y-4 rounded-3xl border border-white/5 bg-white/5 p-6 shadow-xl shadow-cyan-500/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">Call capture</p>
                    <h2 className="text-2xl font-semibold text-white">Log a call</h2>
                  </div>
                  <span className="text-xs text-slate-400">Updates last outcome + next action</span>
                </div>
                <form
                  className="grid gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    logCall.mutate(callForm);
                  }}
                >
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Lead</label>
                    <select
                      className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent transition focus:ring-cyan-400/60"
                      value={callForm.lead}
                      onChange={(e) => setCallForm({ ...callForm, lead: e.target.value })}
                    >
                      <option value="">Select a lead</option>
                      {leads.map((lead) => (
                        <option key={lead.id} value={lead.id} className="bg-slate-900">
                          {lead.company}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Outcome"
                    value={callForm.outcome}
                    onChange={(e) => setCallForm({ ...callForm, outcome: e.target.value })}
                  />
                  <Input
                    label="Next action date"
                    type="date"
                    value={callForm.next_action}
                    onChange={(e) => setCallForm({ ...callForm, next_action: e.target.value })}
                  />
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Notes</label>
                    <textarea
                      className="min-h-[120px] rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent transition focus:ring-cyan-400/60"
                      value={callForm.notes}
                      onChange={(e) => setCallForm({ ...callForm, notes: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      className="rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition hover:from-cyan-300 hover:to-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={logCall.isPending || !callForm.lead}
                    >
                      {logCall.isPending ? "Logging..." : "Log call"}
                    </button>
                    {logCall.isError && (
                      <span className="text-sm text-rose-300">{String(logCall.error)}</span>
                    )}
                    {logCall.isSuccess && (
                      <span className="text-sm text-emerald-300">Saved</span>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </section>

          <section className="border-t border-white/5 bg-black/40">
            <div className="mx-auto max-w-6xl px-6 py-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">Pipeline</p>
                  <h2 className="text-2xl font-semibold text-white">Active leads</h2>
                </div>
                {leadsError && <span className="text-sm text-rose-300">{String(leadsError)}</span>}
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-white/5 shadow-lg shadow-cyan-500/5">
                <div className="grid grid-cols-12 gap-4 border-b border-white/5 bg-slate-900/40 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                  <span className="col-span-3">Lead</span>
                  <span className="col-span-2">Status</span>
                  <span className="col-span-2">Next action</span>
                  <span className="col-span-3">Last outcome</span>
                  <span className="col-span-2">Actions</span>
                </div>
                <div className="divide-y divide-white/5">
                  {leadsLoading && <p className="p-4 text-slate-300">Loading...</p>}
                  {!leadsLoading && leads.length === 0 && (
                    <p className="p-4 text-slate-300">No leads yet. Add one above.</p>
                  )}
                  {leads.map((lead) => (
                    <div key={lead.id} className="grid grid-cols-12 gap-4 px-4 py-3 text-sm text-slate-100">
                      <div className="col-span-3">
                        <p className="font-semibold text-white">{lead.company}</p>
                        <p className="text-xs text-slate-400">
                          {lead.contact_name || "No contact"} {lead.trade ? `• ${lead.trade}` : ""}
                        </p>
                        <p className="text-xs text-slate-500">{lead.email || lead.phone || ""}</p>
                      </div>
                      <div className="col-span-2 flex flex-wrap items-center gap-2">
                        <StatusPill status={lead.status} />
                      </div>
                      <div className="col-span-2 text-sm text-slate-200">
                        {lead.next_action ? (
                          <>
                            <p>{formatDate(lead.next_action)}</p>
                            <p className="text-xs text-slate-400">Next follow-up</p>
                          </>
                        ) : (
                          <p className="text-slate-400">No date set</p>
                        )}
                      </div>
                      <div className="col-span-3 text-sm text-slate-200">
                        <p className="font-semibold text-white">{lead.last_outcome || "No calls logged"}</p>
                        {lead.notes && <p className="text-xs text-slate-400">{lead.notes}</p>}
                      </div>
                      <div className="col-span-2 flex flex-col gap-2">
                        <select
                          className="rounded-lg border border-white/10 bg-slate-900/60 px-2 py-2 text-xs text-white outline-none ring-1 ring-transparent transition focus:ring-cyan-400/60"
                          value={lead.status}
                          onChange={(e) =>
                            updateLead.mutate({
                              id: lead.id,
                              status: e.target.value as LeadStatus,
                              next_action: lead.next_action || undefined,
                            })
                          }
                        >
                          {statuses.map((s) => (
                            <option key={s} value={s} className="bg-slate-900">
                              {s}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          className="rounded-lg border border-white/10 bg-slate-900/60 px-2 py-2 text-xs text-white outline-none ring-1 ring-transparent transition focus:ring-cyan-400/60"
                          value={lead.next_action || ""}
                          onChange={(e) =>
                            updateLead.mutate({
                              id: lead.id,
                              status: lead.status,
                              next_action: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-white/5 bg-black/50">
            <div className="mx-auto max-w-6xl px-6 py-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">Call log</p>
                  <h2 className="text-2xl font-semibold text-white">Recent calls</h2>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {callLogs.length === 0 && (
                  <p className="text-slate-300">Log a call to see it here.</p>
                )}
                {callLogs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-cyan-500/5">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{log.expand?.lead?.company || "Lead"}</span>
                      <span>{new Date(log.created).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 text-lg font-semibold text-white">{log.outcome}</p>
                    {log.notes && <p className="text-sm text-slate-300">{log.notes}</p>}
                    {log.next_action && (
                      <p className="text-xs text-cyan-200">Next action: {formatDate(log.next_action)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/5 bg-black/40">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/20 text-sm font-semibold text-cyan-200 ring-1 ring-cyan-400/30">
                NL
              </span>
              <span className="font-semibold">North Lead Connect</span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              <span className="rounded-full bg-white/5 px-3 py-1">PocketBase persistence</span>
              <span className="rounded-full bg-white/5 px-3 py-1">React Query cache</span>
              <span className="rounded-full bg-white/5 px-3 py-1">Tailwind UI</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: LeadStatus }) {
  const colors: Record<LeadStatus, string> = {
    "New": "bg-slate-800 text-slate-200 ring-slate-600",
    "In Progress": "bg-cyan-500/20 text-cyan-200 ring-cyan-400/40",
    "Connected": "bg-emerald-400/20 text-emerald-200 ring-emerald-400/40",
    "Nurture": "bg-indigo-400/20 text-indigo-200 ring-indigo-400/40",
    "Closed Won": "bg-emerald-500/25 text-emerald-100 ring-emerald-400/60",
    "Closed Lost": "bg-rose-500/20 text-rose-100 ring-rose-400/60",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${colors[status]}`}>
      {status}
    </span>
  );
}

function Input({
  label,
  type = "text",
  value,
  onChange,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent transition focus:ring-cyan-400/60"
      />
    </div>
  );
}

function formatDate(date: string | null | undefined) {
  if (!date) return "No date";
  return new Date(date).toLocaleDateString();
}

function PocketBaseStatus({ email }: { email: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">PocketBase</p>
        <p className="text-sm text-white">Signed in as {email}</p>
      </div>
      <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
    </div>
  );
}

function AuthScreen({
  auth,
}: {
  auth: {
    email: string;
    setEmail: (val: string) => void;
    password: string;
    setPassword: (val: string) => void;
    signIn: () => Promise<void>;
    signUp: () => Promise<void>;
    message: string;
    error: string;
  };
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200/80">
          Sign in to continue
        </div>
        <h1 className="text-3xl font-semibold text-white">Access your GC workspace</h1>
        <p className="mt-2 text-slate-300">Use your PocketBase email/password. Or create a new account below.</p>
        <div className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Email</label>
            <input
              type="email"
              value={auth.email}
              onChange={(e) => auth.setEmail(e.target.value)}
              placeholder="you@company.com"
              className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent transition focus:ring-cyan-400/60"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Password</label>
            <input
              type="password"
              value={auth.password}
              onChange={(e) => auth.setPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-1 ring-transparent transition focus:ring-cyan-400/60"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <button
              onClick={auth.signIn}
              className="w-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition hover:from-cyan-300 hover:to-emerald-200 sm:w-auto"
            >
              Sign in
            </button>
            <button
              onClick={auth.signUp}
              className="w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-400/60 hover:text-cyan-100 sm:w-auto"
            >
              Create account
            </button>
          </div>
          {auth.message && <p className="text-sm text-emerald-300">{auth.message}</p>}
          {auth.error && <p className="text-sm text-rose-300">{auth.error}</p>}
          <p className="text-xs text-slate-400">
            Run your PocketBase instance separately. Set <code className="rounded bg-white/10 px-1">VITE_POCKETBASE_URL</code> to its API URL in <code className="rounded bg-white/10 px-1">.env.local</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

function MissingConfig() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold text-white">Add PocketBase credentials</h1>
        <p className="mt-3 text-slate-300">
          Create a <code className="rounded bg-white/10 px-1">.env.local</code> file with your PocketBase URL, then restart the dev server.
        </p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
          <p className="font-semibold text-white">Required variables</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-900/60 p-3 text-xs text-slate-200">VITE_POCKETBASE_URL=http://127.0.0.1:8090</pre>
          <p className="mt-2 text-slate-300">
            After adding it, run <code className="rounded bg-white/10 px-1">npm run dev</code> to continue.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AppShell;
