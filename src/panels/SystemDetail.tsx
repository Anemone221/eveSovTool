import { evesov } from "@/api/evesov";
import { aggregateGrants, formatGrants, siteEffectsFor } from "@/data/effects";
import { a0Sun, PI_PRODUCT_ICONS, PLANET_TYPE_ICONS } from "@/data/mapIcons";
import {
    highestProducibleTier,
    producibleFromPlanets,
    type PlanetType,
} from "@/data/piRecipes";
import { badgesForUpgrades } from "@/data/systemEffects";
import { upgradeTypeKey } from "@shared/upgradeTypes";
import { useUi } from "@/state/uiStore";
import type {
    AlnLink,
    AlnTarget,
    PlanStructure,
    PlanUpgradeRow,
    StructureAddPayload,
    StructureLocation,
    StructureType,
    SystemBalance,
    SystemDetail as SystemDetailDto,
    SystemStatus,
    Upgrade,
    WorkforceTransfer,
} from "@shared/index";
import { useCallback, useEffect, useMemo, useState } from "react";

const STRUCTURE_TYPES: StructureType[] = [
    "Keepstar",
    "Fortizar",
    "Astrahus",
    "Azbel",
    "Raitaru",
    "Tenebrex",
    "Pharolux",
    "Ansiblex",
    "Metenox",
    "Athanor",
    "Tatara",
    "Sotiyo",
    "Other",
];
const STRUCTURE_LOCATIONS: StructureLocation[] = [
    "Deep",
    "Planet",
    "Moon",
    "Gate",
    "Ansiblex",
];

const STATUS_OPTIONS: SystemStatus[] = ["local", "export", "import", "transit"];
const STATUS_LABEL: Record<SystemStatus, string> = {
    local: "Local",
    export: "Export",
    import: "Import",
    transit: "Transit",
};

type ResourceMode = "consumed" | "remaining";

export function SystemDetail() {
    const systemId = useUi((s) => s.selectedSystemId);
    const activePlanId = useUi((s) => s.activePlanId);
    const [detail, setDetail] = useState<SystemDetailDto | null>(null);
    const [allUpgrades, setAllUpgrades] = useState<Upgrade[]>([]);
    const [assigned, setAssigned] = useState<PlanUpgradeRow[]>([]);
    const [balance, setBalance] = useState<SystemBalance | null>(null);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState("");
    const [onlyFits, setOnlyFits] = useState(false);
    const [working, setWorking] = useState<string | null>(null);
    const [starOpen, setStarOpen] = useState(true);
    const [planetsOpen, setPlanetsOpen] = useState(true);
    const [transfers, setTransfers] = useState<WorkforceTransfer[]>([]);
    const [exportDest, setExportDest] = useState<number | "">("");
    const [exportAmount, setExportAmount] = useState("");
    const [exportAllUnused, setExportAllUnused] = useState(false);
    const [exportWorking, setExportWorking] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [reachableImport, setReachableImport] = useState<
        { systemId: number; systemName: string }[]
    >([]);
    const [alnLink, setAlnLink] = useState<AlnLink | null>(null);
    const [alnTargets, setAlnTargets] = useState<AlnTarget[]>([]);
    const [alnDest, setAlnDest] = useState<number | "">("");
    const [alnManual, setAlnManual] = useState(false);
    const [alnManualName, setAlnManualName] = useState("");
    const [alnWorking, setAlnWorking] = useState(false);
    const [alnError, setAlnError] = useState<string | null>(null);
    const [systemSuggestions, setSystemSuggestions] = useState<
        { systemId: number; systemName: string }[]
    >([]);
    const [structuresOpen, setStructuresOpen] = useState(true);
    const [piOpen, setPiOpen] = useState(true);
    const [structures, setStructures] = useState<PlanStructure[]>([]);
    const [structAddType, setStructAddType] =
        useState<StructureType>("Ansiblex");
    const [structAddName, setStructAddName] = useState("");
    const [structAddLocation, setStructAddLocation] = useState<
        StructureLocation | ""
    >("");
    const [structAdding, setStructAdding] = useState(false);
    const [structImporting, setStructImporting] = useState(false);
    const [structImportText, setStructImportText] = useState("");
    const [structImportResult, setStructImportResult] = useState<string | null>(
        null,
    );

    useEffect(() => {
        void evesov.prefs.get("detail.section.star").then((v) => {
            if (v !== null) setStarOpen(v !== "0");
        });
        void evesov.prefs.get("detail.section.planets").then((v) => {
            if (v !== null) setPlanetsOpen(v !== "0");
        });
        void evesov.prefs.get("detail.section.structures").then((v) => {
            if (v !== null) setStructuresOpen(v !== "0");
        });
        void evesov.prefs.get("detail.section.pi").then((v) => {
            if (v !== null) setPiOpen(v !== "0");
        });
    }, []);

    const toggleStar = () => {
        setStarOpen((prev) => {
            const next = !prev;
            void evesov.prefs.set("detail.section.star", next ? "1" : "0");
            return next;
        });
    };
    const togglePlanets = () => {
        setPlanetsOpen((prev) => {
            const next = !prev;
            void evesov.prefs.set("detail.section.planets", next ? "1" : "0");
            return next;
        });
    };
    const toggleStructures = () => {
        setStructuresOpen((prev) => {
            const next = !prev;
            void evesov.prefs.set(
                "detail.section.structures",
                next ? "1" : "0",
            );
            return next;
        });
    };
    const togglePi = () => {
        setPiOpen((prev) => {
            const next = !prev;
            void evesov.prefs.set("detail.section.pi", next ? "1" : "0");
            return next;
        });
    };

    useEffect(() => {
        void evesov.data.upgrades().then(setAllUpgrades);
    }, []);

    const fetchPlanState = useCallback(async (sid: number, pid: number) => {
        const [planSnap, b, allTransfers, structNodes] = await Promise.all([
            evesov.plans.get(pid),
            evesov.plans.systemBalance(pid, sid),
            evesov.plans.getWorkforceTransfers(pid),
            evesov.structures.list(pid, sid),
        ]);
        const systemUpgrades = (planSnap?.upgrades ?? []).filter(
            (u) => u.systemId === sid,
        );
        setAssigned(systemUpgrades);
        setBalance(b);
        setTransfers(allTransfers);
        setStructures(structNodes[0]?.structures ?? []);
        if (b?.status === "export") {
            const reachable = await evesov.plans.getReachableImportSystems(
                pid,
                sid,
            );
            setReachableImport(reachable);
        } else {
            setReachableImport([]);
        }
        if (
            systemUpgrades.some(
                (u) => u.upgradeName === "Advanced Logistics Network",
            )
        ) {
            const { targets, currentLink } = await evesov.plans.getAlnTargets(
                pid,
                sid,
            );
            setAlnTargets(targets);
            setAlnLink(currentLink);
        } else {
            setAlnTargets([]);
            setAlnLink(null);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (systemId === null) {
            setDetail(null);
            setAssigned([]);
            setBalance(null);
            return;
        }
        setLoading(true);
        void (async () => {
            const d = await evesov.data.system(systemId);
            if (cancelled) return;
            setDetail(d);
            if (activePlanId !== null && d) {
                await fetchPlanState(systemId, activePlanId);
            } else {
                setAssigned([]);
                setBalance(null);
            }
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [systemId, activePlanId, fetchPlanState]);

    useEffect(() => {
        if (systemId === null || activePlanId === null) return;
        const off = evesov.events.on("plan-changed", () => {
            void fetchPlanState(systemId, activePlanId);
        });
        return off;
    }, [systemId, activePlanId, fetchPlanState]);

    useEffect(() => {
        setExportDest("");
        setExportAmount("");
        setExportAllUnused(false);
        setExportError(null);
        setAlnDest("");
        setAlnManual(false);
        setAlnManualName("");
        setAlnError(null);
        setStructAdding(false);
        setStructImporting(false);
        setStructImportText("");
        setStructImportResult(null);
    }, [systemId, activePlanId]);

    const upgradeMap = useMemo(() => {
        const m = new Map<string, Upgrade>();
        for (const u of allUpgrades) m.set(u.name, u);
        return m;
    }, [allUpgrades]);

    const wouldFit = useCallback(
        (u: Upgrade): boolean => {
            if (!balance) return true;
            return (
                balance.consumedPower + u.power <= balance.availablePower &&
                balance.consumedWorkforce + u.workforce <=
                    balance.availableWorkforce
            );
        },
        [balance],
    );

    const visibleAvailable = useMemo(() => {
        const assignedNames = new Set(assigned.map((a) => a.upgradeName));
        const assignedTypes = new Set<string>();
        for (const a of assigned) {
            const k = upgradeTypeKey(a.upgradeName);
            if (k) assignedTypes.add(k);
        }
        let list = allUpgrades.filter((u) => {
            if (assignedNames.has(u.name)) return false;
            const k = upgradeTypeKey(u.name);
            if (k && assignedTypes.has(k)) return false;
            return true;
        });
        if (onlyFits) list = list.filter(wouldFit);
        if (filter.trim()) {
            const q = filter.toLowerCase();
            list = list.filter((u) => u.name.toLowerCase().includes(q));
        }
        return list;
    }, [allUpgrades, assigned, filter, onlyFits, wouldFit]);

    const sec = detail?.system.securityStatus ?? null;

    const aggregatedGrants = useMemo(
        () =>
            aggregateGrants(
                assigned.map((a) => siteEffectsFor(a.upgradeName, sec)),
            ),
        [assigned, sec],
    );

    const producible = useMemo(() => {
        const types = (detail?.planets ?? []).map(
            (p) => (p.planetType as PlanetType | null) ?? null,
        );
        return producibleFromPlanets(types);
    }, [detail]);
    const topTier = highestProducibleTier(producible);

    if (systemId === null) {
        return (
            <div className="detail detail--empty">
                Select a system from the tree to view its details.
            </div>
        );
    }
    if (loading || !detail) {
        return <div className="detail detail--empty">Loading…</div>;
    }

    const { system, region, constellation, star, planets, budget } = detail;

    const assign = async (name: string) => {
        if (activePlanId === null) return;
        setWorking(name);
        try {
            const r = await evesov.plans.assignUpgrade(
                activePlanId,
                systemId,
                name,
            );
            if (!r.ok) alert(r.error ?? "Failed to assign upgrade.");
        } finally {
            setWorking(null);
        }
    };
    const remove = async (name: string) => {
        if (activePlanId === null) return;
        setWorking(name);
        try {
            await evesov.plans.removeUpgrade(activePlanId, systemId, name);
        } finally {
            setWorking(null);
        }
    };

    return (
        <div className="detail">
            <header className="detail__header">
                <div className="detail__title-row">
                    <h2>{system.name}</h2>
                    {badgesForUpgrades(assigned.map((a) => a.upgradeName)).map(
                        (b) => (
                            <img
                                key={b.key}
                                src={b.icon}
                                alt={b.label}
                                title={b.description}
                                className="effect-badge__icon effect-badge__icon--lg"
                            />
                        ),
                    )}
                    {star?.description && /\bA0\b/.test(star.description) && (
                        <img
                            src={a0Sun}
                            alt="A0 Sun"
                            title={`A0 Sun — ${star.description}`}
                            className="effect-badge__icon effect-badge__icon--lg"
                        />
                    )}
                    {topTier > 0 && (
                        <span
                            className={`detail__pi-tier detail__pi-tier--p${topTier}`}
                            title={`Producible in this system: ${[...producible[`p${topTier}` as 'p1' | 'p2' | 'p3' | 'p4']].sort().join(', ')}`}
                        >
                            P{topTier}
                        </span>
                    )}
                    {activePlanId !== null && budget.sovEligible && (
                        <label
                            className={`status-pill status-pill--${balance?.status ?? "local"}`}
                            title="Workforce status in this plan"
                        >
                            <span className="status-pill__dot" />
                            <select
                                className="status-pill__select"
                                value={balance?.status ?? "local"}
                                onChange={(e) => {
                                    void evesov.plans.setSystemStatus(
                                        activePlanId,
                                        systemId,
                                        e.target.value as SystemStatus,
                                    );
                                }}
                            >
                                {STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>
                                        {STATUS_LABEL[s]}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
                <div className="detail__breadcrumb">
                    {region.name} <span className="detail__sep">›</span>{" "}
                    {constellation.name}
                    {system.securityStatus !== null && (
                        <span className="detail__sec">
                            sec {system.securityStatus.toFixed(2)}
                        </span>
                    )}
                    {!budget.sovEligible && (
                        <span className="detail__badge">non-sov</span>
                    )}
                </div>
            </header>

            <section className="detail__section">
                <h3>
                    Resource budget
                    {activePlanId === null && (
                        <span className="detail__muted-inline">
                            {" "}
                            (no active plan)
                        </span>
                    )}
                </h3>
                <BudgetBar
                    label="Power"
                    available={budget.availablePower}
                    consumed={balance?.consumedPower ?? 0}
                    mode="consumed"
                />
                <BudgetBar
                    label="Workforce"
                    available={balance?.availableWorkforce ?? budget.availableWorkforce}
                    consumed={balance?.consumedWorkforce ?? 0}
                    mode="consumed"
                />
                <BudgetBar
                    label="Superionic Ice / h"
                    available={budget.availableIce}
                    consumed={balance?.consumedIce ?? 0}
                    mode="remaining"
                />
                <BudgetBar
                    label="Magmatic Gas / h"
                    available={budget.availableGas}
                    consumed={balance?.consumedGas ?? 0}
                    mode="remaining"
                />
                {balance && balance.startupFuel > 0 && (
                    <div className="detail__muted" style={{ marginTop: 8 }}>
                        One-time startup fuel:{" "}
                        <strong>{balance.startupFuel.toLocaleString()}</strong>
                    </div>
                )}
            </section>

            {activePlanId !== null && (
                <section
                    className={`detail__section${structuresOpen ? "" : " detail__section--collapsed"}`}
                >
                    <button
                        type="button"
                        className="detail__section-toggle"
                        onClick={toggleStructures}
                        aria-expanded={structuresOpen}
                    >
                        <span className="tree__chevron">
                            {structuresOpen ? "▾" : "▸"}
                        </span>
                        <h3>Structures ({structures.length})</h3>
                    </button>
                    {structuresOpen && (
                        <>
                            {structures.length > 0 && (
                                <ul className="structures__cards">
                                    {structures.map((s) => (
                                        <li
                                            key={s.id}
                                            className="structures__card"
                                        >
                                            <span className="structures__card-type">
                                                {s.structureType}
                                            </span>
                                            {s.name && (
                                                <span className="structures__card-name">
                                                    {s.name}
                                                </span>
                                            )}
                                            {s.location && (
                                                <span className="structures__card-location">
                                                    {s.location}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                className="structures__card-remove"
                                                title="Remove structure"
                                                onClick={() =>
                                                    void evesov.structures.remove(
                                                        activePlanId,
                                                        s.id,
                                                    )
                                                }
                                            >
                                                ×
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {!structAdding && !structImporting && (
                                <div className="structures__actions">
                                    <button
                                        type="button"
                                        className="structures__btn-add"
                                        onClick={() => setStructAdding(true)}
                                    >
                                        + Add
                                    </button>
                                    <button
                                        type="button"
                                        className="structures__btn-import"
                                        onClick={() => setStructImporting(true)}
                                    >
                                        ⎘ Import
                                    </button>
                                </div>
                            )}
                            {structAdding && (
                                <form
                                    className="structures__add-form"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (systemId === null) return;
                                        const payload: StructureAddPayload = {
                                            structureType: structAddType,
                                            name:
                                                structAddName.trim() ||
                                                undefined,
                                            location:
                                                structAddLocation || undefined,
                                        };
                                        void evesov.structures
                                            .add(
                                                activePlanId,
                                                systemId,
                                                payload,
                                            )
                                            .then(() => {
                                                setStructAdding(false);
                                                setStructAddName("");
                                                setStructAddLocation("");
                                            });
                                    }}
                                >
                                    <select
                                        value={structAddType}
                                        onChange={(e) =>
                                            setStructAddType(
                                                e.target.value as StructureType,
                                            )
                                        }
                                    >
                                        {STRUCTURE_TYPES.map((t) => (
                                            <option key={t} value={t}>
                                                {t}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        placeholder="Name (optional)"
                                        value={structAddName}
                                        onChange={(e) =>
                                            setStructAddName(e.target.value)
                                        }
                                    />
                                    <select
                                        value={structAddLocation}
                                        onChange={(e) =>
                                            setStructAddLocation(
                                                e.target.value as
                                                    | StructureLocation
                                                    | "",
                                            )
                                        }
                                    >
                                        <option value="">
                                            Location (optional)
                                        </option>
                                        {STRUCTURE_LOCATIONS.map((l) => (
                                            <option key={l} value={l}>
                                                {l}
                                            </option>
                                        ))}
                                    </select>
                                    <button type="submit">Save</button>
                                    <button
                                        type="button"
                                        onClick={() => setStructAdding(false)}
                                    >
                                        Cancel
                                    </button>
                                </form>
                            )}
                            {structImporting && (
                                <div className="structures__import-form">
                                    <textarea
                                        rows={4}
                                        placeholder="Paste structure names, one per line"
                                        value={structImportText}
                                        onChange={(e) => {
                                            setStructImportText(e.target.value);
                                            setStructImportResult(null);
                                        }}
                                    />
                                    <div className="structures__import-actions">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (systemId === null) return;
                                                void evesov.structures
                                                    .importClipboard(
                                                        activePlanId,
                                                        systemId,
                                                        structImportText,
                                                    )
                                                    .then(({ count }) => {
                                                        setStructImportResult(
                                                            `Imported ${count} structure${count !== 1 ? "s" : ""}.`,
                                                        );
                                                        setStructImportText("");
                                                    });
                                            }}
                                        >
                                            Import
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setStructImporting(false)
                                            }
                                        >
                                            Cancel
                                        </button>
                                        {structImportResult && (
                                            <span className="structures__import-result">
                                                {structImportResult}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </section>
            )}

            {activePlanId !== null && balance?.status === "export" && (
                <section className="detail__section">
                    <h3>Workforce Transfer — Export</h3>
                    {reachableImport.length === 0 ? (
                        <p className="detail__muted">
                            No systems with import status within 3 jumps. Set a
                            neighbouring system to import status first.
                        </p>
                    ) : (
                        <form
                            className="transfer-form"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (exportDest === "") return;
                                setExportWorking(true);
                                setExportError(null);
                                void evesov.plans
                                    .setWorkforceTransfer(
                                        activePlanId,
                                        systemId,
                                        exportDest,
                                        exportAllUnused
                                            ? 0
                                            : Number(exportAmount),
                                        exportAllUnused,
                                    )
                                    .then((r) => {
                                        if (!r.ok)
                                            setExportError(
                                                r.error ?? "Unknown error",
                                            );
                                    })
                                    .finally(() => setExportWorking(false));
                            }}
                        >
                            <div className="transfer-form__row">
                                <label className="transfer-form__label">
                                    Destination
                                </label>
                                <select
                                    className="transfer-form__select"
                                    value={exportDest}
                                    onChange={(e) =>
                                        setExportDest(Number(e.target.value))
                                    }
                                >
                                    <option value="">— select system —</option>
                                    {reachableImport.map((s) => (
                                        <option
                                            key={s.systemId}
                                            value={s.systemId}
                                        >
                                            {s.systemName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="transfer-form__row">
                                <label className="transfer-form__label">
                                    Amount
                                </label>
                                <input
                                    type="number"
                                    className="transfer-form__input"
                                    min={1}
                                    step={1}
                                    value={exportAmount}
                                    onChange={(e) =>
                                        setExportAmount(e.target.value)
                                    }
                                    disabled={exportAllUnused}
                                    placeholder="0"
                                />
                                <label className="transfer-form__check">
                                    <input
                                        type="checkbox"
                                        checked={exportAllUnused}
                                        onChange={(e) =>
                                            setExportAllUnused(e.target.checked)
                                        }
                                    />
                                    Export all unused
                                </label>
                            </div>
                            {exportError && (
                                <p className="transfer-form__error">
                                    {exportError}
                                </p>
                            )}
                            <div className="transfer-form__actions">
                                <button
                                    type="submit"
                                    className="transfer-form__submit"
                                    disabled={
                                        exportWorking ||
                                        exportDest === "" ||
                                        (!exportAllUnused &&
                                            !Number(exportAmount))
                                    }
                                >
                                    {exportWorking ? "Saving…" : "Set Transfer"}
                                </button>
                                {transfers.some(
                                    (t) => t.sourceSystemId === systemId,
                                ) && (
                                    <button
                                        type="button"
                                        className="transfer-form__remove"
                                        onClick={() => {
                                            void evesov.plans.removeWorkforceTransfer(
                                                activePlanId,
                                                systemId,
                                            );
                                        }}
                                    >
                                        Remove Transfer
                                    </button>
                                )}
                            </div>
                        </form>
                    )}
                    {(() => {
                        const t = transfers.find(
                            (tr) => tr.sourceSystemId === systemId,
                        );
                        if (!t) return null;
                        return (
                            <p className="transfer-form__summary">
                                Currently exporting{" "}
                                {t.exportAllUnused
                                    ? "all unused workforce"
                                    : t.transferAmount.toLocaleString()}{" "}
                                to <strong>{t.destName}</strong>.
                            </p>
                        );
                    })()}
                </section>
            )}

            {activePlanId !== null && balance?.status === "import" && (
                <section className="detail__section">
                    <h3>Workforce Transfer — Incoming</h3>
                    {(() => {
                        const incoming = transfers.filter(
                            (t) => t.destSystemId === systemId,
                        );
                        if (incoming.length === 0) {
                            return (
                                <p className="detail__muted">
                                    No export systems are targeting this system
                                    yet.
                                </p>
                            );
                        }
                        return (
                            <table className="kv">
                                <tbody>
                                    {incoming.map((t) => (
                                        <tr key={t.sourceSystemId}>
                                            <th>{t.sourceName}</th>
                                            <td>
                                                {t.exportAllUnused
                                                    ? "All unused workforce"
                                                    : t.transferAmount.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    })()}
                </section>
            )}

            {activePlanId !== null &&
                assigned.some(
                    (a) => a.upgradeName === "Advanced Logistics Network",
                ) && (
                    <section className="detail__section">
                        <h3>Advanced Logistics Network — Jump Bridge Link</h3>
                        {alnLink && (
                            <p className="transfer-form__summary">
                                Currently linked to:{" "}
                                <strong>{alnLink.linkedSystemName}</strong>
                                {alnLink.linkedSystemId === null && (
                                    <span className="detail__muted-inline">
                                        {" "}
                                        (manual entry)
                                    </span>
                                )}
                            </p>
                        )}
                        <form
                            className="transfer-form"
                            onSubmit={(e) => {
                                e.preventDefault();
                                setAlnWorking(true);
                                setAlnError(null);
                                let id: number | null = null;
                                let name = "";
                                if (!alnManual) {
                                    const t = alnTargets.find(
                                        (t) => t.systemId === alnDest,
                                    );
                                    if (!t) {
                                        setAlnWorking(false);
                                        return;
                                    }
                                    id = t.systemId;
                                    name = t.systemName;
                                } else {
                                    const match = systemSuggestions.find(
                                        (s) =>
                                            s.systemName ===
                                            alnManualName.trim(),
                                    );
                                    id = match?.systemId ?? null;
                                    name = alnManualName.trim();
                                }
                                void evesov.plans
                                    .setAlnLink(
                                        activePlanId,
                                        systemId,
                                        id,
                                        name,
                                    )
                                    .then((r) => {
                                        if (!r.ok)
                                            setAlnError(
                                                r.error ?? "Unknown error",
                                            );
                                    })
                                    .finally(() => setAlnWorking(false));
                            }}
                        >
                            <div className="transfer-form__row">
                                <label className="transfer-form__check">
                                    <input
                                        type="checkbox"
                                        checked={alnManual}
                                        onChange={(e) => {
                                            setAlnManual(e.target.checked);
                                            setAlnDest("");
                                            setAlnManualName("");
                                        }}
                                    />
                                    Manual entry (cross-alliance)
                                </label>
                            </div>
                            {!alnManual ? (
                                <div className="transfer-form__row">
                                    <label className="transfer-form__label">
                                        Target System
                                    </label>
                                    {alnTargets.length === 0 ? (
                                        <span className="detail__muted">
                                            No systems within 5 LY — re-seed
                                            required to compute distances
                                        </span>
                                    ) : (
                                        <select
                                            className="transfer-form__select"
                                            value={alnDest}
                                            onChange={(e) =>
                                                setAlnDest(
                                                    Number(e.target.value),
                                                )
                                            }
                                        >
                                            <option value="">
                                                — select system —
                                            </option>
                                            {alnTargets.map((t) => (
                                                <option
                                                    key={t.systemId}
                                                    value={t.systemId}
                                                >
                                                    {t.systemName} (
                                                    {t.distanceLy.toFixed(2)}{" "}
                                                    LY)
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            ) : (
                                <div className="transfer-form__row">
                                    <label className="transfer-form__label">
                                        System Name
                                    </label>
                                    <input
                                        type="text"
                                        className="transfer-form__input"
                                        list="aln-system-suggestions"
                                        value={alnManualName}
                                        onChange={async (e) => {
                                            setAlnManualName(e.target.value);
                                            if (e.target.value.length >= 2) {
                                                const results =
                                                    await evesov.plans.searchSystems(
                                                        e.target.value,
                                                    );
                                                setSystemSuggestions(results);
                                            }
                                        }}
                                        placeholder="Type system name…"
                                    />
                                    <datalist id="aln-system-suggestions">
                                        {systemSuggestions.map((s) => (
                                            <option
                                                key={s.systemId}
                                                value={s.systemName}
                                            />
                                        ))}
                                    </datalist>
                                </div>
                            )}
                            {alnError && (
                                <p className="transfer-form__error">
                                    {alnError}
                                </p>
                            )}
                            <div className="transfer-form__actions">
                                <button
                                    type="submit"
                                    className="transfer-form__submit"
                                    disabled={
                                        alnWorking ||
                                        (!alnManual && alnDest === "") ||
                                        (alnManual && !alnManualName.trim())
                                    }
                                >
                                    {alnWorking ? "Saving…" : "Set Link"}
                                </button>
                                {alnLink && (
                                    <button
                                        type="button"
                                        className="transfer-form__remove"
                                        onClick={() => {
                                            void evesov.plans
                                                .removeAlnLink(
                                                    activePlanId,
                                                    systemId,
                                                )
                                                .then(() => {
                                                    setAlnLink(null);
                                                    setAlnDest("");
                                                    setAlnManualName("");
                                                });
                                        }}
                                    >
                                        Remove Link
                                    </button>
                                )}
                            </div>
                        </form>
                    </section>
                )}

            <div className="detail__columns">
                <div className="detail__columns-inner">
                    <section
                        className={`detail__section detail__col-star${starOpen ? "" : " detail__section--collapsed"}`}
                    >
                        <button
                            type="button"
                            className="detail__section-toggle"
                            onClick={toggleStar}
                            aria-expanded={starOpen}
                        >
                            <span className="tree__chevron">
                                {starOpen ? "▾" : "▸"}
                            </span>
                            <h3>Star</h3>
                        </button>
                        {starOpen &&
                            (star ? (
                                <table className="kv">
                                    <tbody>
                                        <tr>
                                            <th>Description</th>
                                            <td>{star.description ?? "—"}</td>
                                        </tr>
                                        <tr>
                                            <th>Spectral class</th>
                                            <td>{star.spectralClass ?? "—"}</td>
                                        </tr>
                                        <tr>
                                            <th>Power</th>
                                            <td>
                                                {star.power.toLocaleString()}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            ) : (
                                <p className="detail__muted">No star record.</p>
                            ))}
                    </section>

                    <section
                        className={`detail__section detail__col-planets${planetsOpen ? "" : " detail__section--collapsed"}`}
                    >
                        <button
                            type="button"
                            className="detail__section-toggle"
                            onClick={togglePlanets}
                            aria-expanded={planetsOpen}
                        >
                            <span className="tree__chevron">
                                {planetsOpen ? "▾" : "▸"}
                            </span>
                            <h3>Planets ({planets.length})</h3>
                        </button>
                        {planetsOpen &&
                            (planets.length ? (
                                <table className="grid">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th className="num">Power</th>
                                            <th className="num">Workforce</th>
                                            <th className="num">Ice/h</th>
                                            <th className="num">Gas/h</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {planets.map((p) => {
                                            const icon = p.planetType
                                                ? PLANET_TYPE_ICONS[
                                                      p.planetType as PlanetType
                                                  ]
                                                : null;
                                            return (
                                            <tr key={p.id}>
                                                <td>
                                                    {icon && (
                                                        <img
                                                            src={icon}
                                                            alt={
                                                                p.planetType ??
                                                                ""
                                                            }
                                                            className="detail__planet-icon"
                                                        />
                                                    )}
                                                    {p.name}
                                                    {p.planetType && (
                                                        <span className="detail__planet-type">
                                                            {" "}
                                                            ({p.planetType})
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="num">
                                                    {p.power.toLocaleString()}
                                                </td>
                                                <td className="num">
                                                    {p.workforce.toLocaleString()}
                                                </td>
                                                <td className="num">
                                                    {p.superionicIcePerHour.toLocaleString()}
                                                </td>
                                                <td className="num">
                                                    {p.magmaticGasPerHour.toLocaleString()}
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="detail__muted">
                                    No planets in this system.
                                </p>
                            ))}
                    </section>
                </div>
            </div>

            {topTier > 0 && (
                <section
                    className={`detail__section${piOpen ? "" : " detail__section--collapsed"}`}
                >
                    <button
                        type="button"
                        className="detail__section-toggle"
                        onClick={togglePi}
                        aria-expanded={piOpen}
                    >
                        <span className="tree__chevron">
                            {piOpen ? "▾" : "▸"}
                        </span>
                        <h3>
                            Producible PI (
                            {producible.p1.size +
                                producible.p2.size +
                                producible.p3.size +
                                producible.p4.size}
                            )
                        </h3>
                    </button>
                    {piOpen && (
                        <div className="detail__pi-products">
                            {([1, 2, 3, 4] as const).map((tier) => {
                                const set =
                                    producible[
                                        `p${tier}` as "p1" | "p2" | "p3" | "p4"
                                    ];
                                if (set.size === 0) return null;
                                const items = [...set].sort();
                                return (
                                    <div
                                        key={tier}
                                        className="detail__pi-row"
                                    >
                                        <span className="detail__pi-row-label">
                                            P{tier}
                                        </span>
                                        <div className="detail__pi-row-items">
                                            {items.map((name) => {
                                                const src =
                                                    PI_PRODUCT_ICONS[name];
                                                return src ? (
                                                    <img
                                                        key={name}
                                                        src={src}
                                                        alt={name}
                                                        title={name}
                                                        className="detail__pi-product"
                                                    />
                                                ) : (
                                                    <span
                                                        key={name}
                                                        className="detail__pi-product detail__pi-product--text"
                                                        title={name}
                                                    >
                                                        {name}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {aggregatedGrants.length > 0 && (
                <section className="detail__section">
                    <h3>Sites granted in this system</h3>
                    <ul className="grants">
                        {aggregatedGrants.map((g) => (
                            <li key={g.site}>
                                <span className="grants__count">
                                    {g.count}×
                                </span>{" "}
                                {g.site}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section className="detail__section">
                <h3>Plan upgrades for this system</h3>
                {activePlanId === null ? (
                    <p className="detail__muted">
                        Activate a plan to assign upgrades.
                    </p>
                ) : !budget.sovEligible ? (
                    <p className="detail__muted">
                        This system is not sov-eligible.
                    </p>
                ) : assigned.length === 0 ? (
                    <p className="detail__muted">
                        No upgrades assigned. Pick from the list below.
                    </p>
                ) : (
                    <table className="grid">
                        <thead>
                            <tr>
                                <th title="Installed">Inst.</th>
                                <th>Name</th>
                                <th className="num">Power</th>
                                <th className="num">Workforce</th>
                                <th className="num">Ice</th>
                                <th className="num">Gas</th>
                                <th className="num">Fuel</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {assigned.flatMap((a) => {
                                const u = upgradeMap.get(a.upgradeName);
                                const grants = siteEffectsFor(
                                    a.upgradeName,
                                    sec,
                                );
                                const rows = [
                                    <tr
                                        key={a.upgradeName}
                                        className={
                                            a.installed ? "row-installed" : ""
                                        }
                                    >
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={a.installed}
                                                onChange={(e) => {
                                                    if (activePlanId === null)
                                                        return;
                                                    void evesov.plans.setUpgradeInstalled(
                                                        activePlanId,
                                                        systemId,
                                                        a.upgradeName,
                                                        e.target.checked,
                                                    );
                                                }}
                                                title={
                                                    a.installed
                                                        ? "Installed"
                                                        : "Todo — mark installed"
                                                }
                                                aria-label={`Mark ${a.upgradeName} installed`}
                                            />
                                        </td>
                                        <td>
                                            {a.upgradeName}
                                            {a.upgradeName ===
                                                "Advanced Logistics Network" &&
                                                !alnLink && (
                                                    <span
                                                        className="detail__badge detail__badge--warn"
                                                        title="Set a jump bridge link below"
                                                    >
                                                        ⚠ link required
                                                    </span>
                                                )}
                                            {a.upgradeName ===
                                                "Advanced Logistics Network" &&
                                                alnLink && (
                                                    <span
                                                        className="detail__badge"
                                                        title={`Linked to ${alnLink.linkedSystemName}`}
                                                    >
                                                        →{" "}
                                                        {
                                                            alnLink.linkedSystemName
                                                        }
                                                    </span>
                                                )}
                                        </td>
                                        <td
                                            className={`num${u && u.power < 0 ? " cost-produces" : ""}`}
                                        >
                                            {u?.power.toLocaleString() ?? "—"}
                                        </td>
                                        <td
                                            className={`num${u && u.workforce < 0 ? " cost-produces" : ""}`}
                                        >
                                            {u?.workforce.toLocaleString() ??
                                                "—"}
                                        </td>
                                        <td
                                            className={`num${u && u.superionicIce < 0 ? " cost-produces" : ""}`}
                                        >
                                            {u?.superionicIce.toLocaleString() ??
                                                "—"}
                                        </td>
                                        <td
                                            className={`num${u && u.magmaticGas < 0 ? " cost-produces" : ""}`}
                                        >
                                            {u?.magmaticGas.toLocaleString() ??
                                                "—"}
                                        </td>
                                        <td className="num">
                                            {u?.startup.toLocaleString() ?? "—"}
                                        </td>
                                        <td className="row-action">
                                            <button
                                                type="button"
                                                className="btn-icon btn-icon--danger"
                                                onClick={() =>
                                                    void remove(a.upgradeName)
                                                }
                                                disabled={
                                                    working === a.upgradeName
                                                }
                                                title={`Remove ${a.upgradeName}`}
                                                aria-label={`Remove ${a.upgradeName}`}
                                            >
                                                ×
                                            </button>
                                        </td>
                                    </tr>,
                                ];
                                if (grants.length > 0) {
                                    rows.push(
                                        <tr
                                            key={`${a.upgradeName}-grants`}
                                            className="row-grants"
                                        >
                                            <td
                                                colSpan={8}
                                                className="row-grants__cell"
                                            >
                                                → {formatGrants(grants)}
                                            </td>
                                        </tr>,
                                    );
                                }
                                return rows;
                            })}
                        </tbody>
                    </table>
                )}
            </section>

            <section className="detail__section">
                <h3>Available upgrades</h3>
                {activePlanId === null ? (
                    <p className="detail__muted">Activate a plan first.</p>
                ) : !budget.sovEligible ? (
                    <p className="detail__muted">Not sov-eligible.</p>
                ) : (
                    <>
                        <div className="detail__filter-row">
                            <input
                                type="search"
                                placeholder="Filter upgrades…"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                className="detail__filter"
                            />
                            <label className="detail__check">
                                <input
                                    type="checkbox"
                                    checked={onlyFits}
                                    onChange={(e) =>
                                        setOnlyFits(e.target.checked)
                                    }
                                />
                                Only available with remaining resources
                            </label>
                        </div>
                        <table className="grid">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th className="num">Power</th>
                                    <th className="num">Workforce</th>
                                    <th className="num">Ice</th>
                                    <th className="num">Gas</th>
                                    <th className="num">Fuel</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleAvailable.flatMap((u) => {
                                    const fits = wouldFit(u);
                                    const grants = siteEffectsFor(u.name, sec);
                                    const rows = [
                                        <tr
                                            key={u.name}
                                            className={fits ? "" : "row-over"}
                                        >
                                            <td>{u.name}</td>
                                            <td
                                                className={`num${u.power < 0 ? " cost-produces" : ""}`}
                                            >
                                                {u.power.toLocaleString()}
                                            </td>
                                            <td
                                                className={`num${u.workforce < 0 ? " cost-produces" : ""}`}
                                            >
                                                {u.workforce.toLocaleString()}
                                            </td>
                                            <td
                                                className={`num${u.superionicIce < 0 ? " cost-produces" : ""}`}
                                            >
                                                {u.superionicIce.toLocaleString()}
                                            </td>
                                            <td
                                                className={`num${u.magmaticGas < 0 ? " cost-produces" : ""}`}
                                            >
                                                {u.magmaticGas.toLocaleString()}
                                            </td>
                                            <td className="num">
                                                {u.startup.toLocaleString()}
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="assigned__add"
                                                    onClick={() =>
                                                        void assign(u.name)
                                                    }
                                                    disabled={
                                                        working === u.name
                                                    }
                                                    title={
                                                        fits
                                                            ? "Assign"
                                                            : "Will exceed available capacity"
                                                    }
                                                >
                                                    {fits
                                                        ? "Assign"
                                                        : "Assign anyway"}
                                                </button>
                                            </td>
                                        </tr>,
                                    ];
                                    if (grants.length > 0) {
                                        rows.push(
                                            <tr
                                                key={`${u.name}-grants`}
                                                className="row-grants"
                                            >
                                                <td
                                                    colSpan={7}
                                                    className="row-grants__cell"
                                                >
                                                    → {formatGrants(grants)}
                                                </td>
                                            </tr>,
                                        );
                                    }
                                    return rows;
                                })}
                            </tbody>
                        </table>
                    </>
                )}
            </section>
        </div>
    );
}

function BudgetBar({
    label,
    available,
    consumed,
    mode,
}: {
    label: string;
    available: number;
    consumed: number;
    mode: ResourceMode;
}) {
    const usageRatio =
        available > 0
            ? Math.min(consumed / available, 1)
            : consumed > 0
              ? 1
              : 0;
    const over = consumed > available;
    const fillRatio = mode === "remaining" ? 1 - usageRatio : usageRatio;
    const overBy = consumed - available;

    // green (low usage) → yellow (50%) → red (100%); explicit red when over
    const hue = over ? 0 : 120 * (1 - usageRatio);
    const fillColor = over
        ? "var(--danger)"
        : `hsl(${hue.toFixed(0)}, 65%, 50%)`;

    return (
        <div className="budget">
            <div className="budget__head">
                <span className="budget__label">{label}</span>
                <span className={`budget__values${over ? " cost-over" : ""}`}>
                    {consumed.toLocaleString()} / {available.toLocaleString()}
                    {over && (
                        <span className="budget__over">
                            {" "}
                            (over by {overBy.toLocaleString()})
                        </span>
                    )}
                </span>
            </div>
            <div
                className={`budget__track${over ? " budget__track--over" : ""}`}
            >
                <div
                    className="budget__fill"
                    style={{
                        width: `${fillRatio * 100}%`,
                        background: fillColor,
                    }}
                />
            </div>
        </div>
    );
}
