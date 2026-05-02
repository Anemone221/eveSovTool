import { evesov } from "@/api/evesov";
import { useUi } from "@/state/uiStore";
import type {
    StructureLocation,
    StructureNode,
    StructureType,
} from "@shared/index";
import { useCallback, useEffect, useState } from "react";

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

interface AddFormState {
    systemId: number;
    type: StructureType;
    name: string;
    location: StructureLocation | "";
}

interface ImportFormState {
    systemId: number;
    text: string;
    result: string | null;
}

export function StructuresPage() {
    const activePlanId = useUi((s) => s.activePlanId);
    const [nodes, setNodes] = useState<StructureNode[]>([]);
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
    const [adding, setAdding] = useState<AddFormState | null>(null);
    const [importing, setImporting] = useState<ImportFormState | null>(null);

    const refresh = useCallback(async () => {
        if (activePlanId == null) {
            setNodes([]);
            return;
        }
        const result = await evesov.structures.list(activePlanId);
        setNodes(result);
    }, [activePlanId]);

    useEffect(() => {
        void refresh();
        const off = evesov.events.on("plan-changed", () => {
            void refresh();
        });
        return off;
    }, [refresh]);

    const toggleCollapse = (constellationId: number) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(constellationId)) next.delete(constellationId);
            else next.add(constellationId);
            return next;
        });
    };

    const startAdd = (systemId: number) => {
        setImporting(null);
        setAdding({ systemId, type: "Ansiblex", name: "", location: "" });
    };

    const commitAdd = async () => {
        if (!adding || activePlanId == null) return;
        await evesov.structures.add(activePlanId, adding.systemId, {
            structureType: adding.type,
            name: adding.name.trim() || undefined,
            location: adding.location || undefined,
        });
        setAdding(null);
    };

    const startImport = (systemId: number) => {
        setAdding(null);
        setImporting({ systemId, text: "", result: null });
    };

    const commitImport = async () => {
        if (!importing || activePlanId == null) return;
        const { count } = await evesov.structures.importClipboard(
            activePlanId,
            importing.systemId,
            importing.text,
        );
        setImporting({
            ...importing,
            result: `Imported ${count} structure${count !== 1 ? "s" : ""}.`,
        });
    };

    const removeStructure = async (structureId: number) => {
        if (activePlanId == null) return;
        await evesov.structures.remove(activePlanId, structureId);
    };

    if (activePlanId == null) {
        return (
            <div className="structures">
                <p className="structures__empty">
                    Select a plan to view structures.
                </p>
            </div>
        );
    }

    // Group nodes by constellation
    const byConstellation = new Map<
        number,
        {
            constellationName: string;
            regionName: string;
            nodes: StructureNode[];
        }
    >();
    for (const node of nodes) {
        if (!byConstellation.has(node.constellationId)) {
            byConstellation.set(node.constellationId, {
                constellationName: node.constellationName,
                regionName: node.regionName,
                nodes: [],
            });
        }
        byConstellation.get(node.constellationId)!.nodes.push(node);
    }

    return (
        <div className="structures">
            {byConstellation.size === 0 && (
                <p className="structures__empty">
                    No structures planned. Use the add button next to a system
                    to get started.
                </p>
            )}
            {Array.from(byConstellation.entries()).map(([cid, group]) => {
                const totalCount = group.nodes.reduce(
                    (s, n) => s + n.structures.length,
                    0,
                );
                const isCollapsed = collapsed.has(cid);
                return (
                    <div key={cid} className="structures__constellation">
                        <button
                            type="button"
                            className="structures__constellation-header"
                            onClick={() => toggleCollapse(cid)}
                        >
                            <span className="structures__chevron">
                                {isCollapsed ? "▸" : "▾"}
                            </span>
                            <span className="structures__constellation-name">
                                {group.constellationName}
                            </span>
                            <span className="structures__region-name">
                                ({group.regionName})
                            </span>
                            <span className="structures__count">
                                {totalCount}
                            </span>
                        </button>
                        {!isCollapsed && (
                            <div className="structures__systems">
                                {group.nodes.map((node) => (
                                    <div
                                        key={node.systemId}
                                        className="structures__system"
                                    >
                                        <div className="structures__system-header">
                                            <span className="structures__system-name">
                                                {node.systemName}
                                            </span>
                                            <button
                                                type="button"
                                                className="structures__btn-add"
                                                title="Add structure"
                                                onClick={() =>
                                                    startAdd(node.systemId)
                                                }
                                            >
                                                + Add
                                            </button>
                                            <button
                                                type="button"
                                                className="structures__btn-import"
                                                title="Import from clipboard"
                                                onClick={() =>
                                                    startImport(node.systemId)
                                                }
                                            >
                                                ⎘ Import
                                            </button>
                                        </div>
                                        {adding?.systemId === node.systemId && (
                                            <form
                                                className="structures__add-form"
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    void commitAdd();
                                                }}
                                            >
                                                <select
                                                    value={adding.type}
                                                    onChange={(e) =>
                                                        setAdding({
                                                            ...adding,
                                                            type: e.target
                                                                .value as StructureType,
                                                        })
                                                    }
                                                >
                                                    {STRUCTURE_TYPES.map(
                                                        (t) => (
                                                            <option
                                                                key={t}
                                                                value={t}
                                                            >
                                                                {t}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                                <input
                                                    type="text"
                                                    placeholder="Name (optional)"
                                                    value={adding.name}
                                                    onChange={(e) =>
                                                        setAdding({
                                                            ...adding,
                                                            name: e.target
                                                                .value,
                                                        })
                                                    }
                                                />
                                                <select
                                                    value={adding.location}
                                                    onChange={(e) =>
                                                        setAdding({
                                                            ...adding,
                                                            location: e.target
                                                                .value as
                                                                | StructureLocation
                                                                | "",
                                                        })
                                                    }
                                                >
                                                    <option value="">
                                                        Location (optional)
                                                    </option>
                                                    {STRUCTURE_LOCATIONS.map(
                                                        (l) => (
                                                            <option
                                                                key={l}
                                                                value={l}
                                                            >
                                                                {l}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                                <button type="submit">
                                                    Save
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setAdding(null)
                                                    }
                                                >
                                                    Cancel
                                                </button>
                                            </form>
                                        )}
                                        {importing?.systemId ===
                                            node.systemId && (
                                            <div className="structures__import-form">
                                                <textarea
                                                    rows={4}
                                                    placeholder="Paste structure names, one per line"
                                                    value={importing.text}
                                                    onChange={(e) =>
                                                        setImporting({
                                                            ...importing,
                                                            text: e.target
                                                                .value,
                                                            result: null,
                                                        })
                                                    }
                                                />
                                                <div className="structures__import-actions">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void commitImport()
                                                        }
                                                    >
                                                        Import
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setImporting(null)
                                                        }
                                                    >
                                                        Cancel
                                                    </button>
                                                    {importing.result && (
                                                        <span className="structures__import-result">
                                                            {importing.result}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        <ul className="structures__cards">
                                            {node.structures.map((s) => (
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
                                                            void removeStructure(
                                                                s.id,
                                                            )
                                                        }
                                                    >
                                                        ×
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
            {/* Systems that have no structures yet still need add/import buttons */}
            {nodes.length === 0 && activePlanId != null && (
                <SystemlessAdder
                    activePlanId={activePlanId}
                    onRefresh={refresh}
                />
            )}
        </div>
    );
}

function SystemlessAdder({
    activePlanId,
    onRefresh,
}: {
    activePlanId: number;
    onRefresh: () => Promise<void>;
}) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<
        { systemId: number; systemName: string }[]
    >([]);
    const [adding, setAdding] = useState<AddFormState | null>(null);
    const [importing, setImporting] = useState<ImportFormState | null>(null);

    const search = async (q: string) => {
        setQuery(q);
        if (q.trim().length < 2) {
            setResults([]);
            return;
        }
        const found = await evesov.plans.searchSystems(q);
        setResults(found);
    };

    const startAdd = (systemId: number) => {
        setImporting(null);
        setAdding({ systemId, type: "Ansiblex", name: "", location: "" });
    };

    const commitAdd = async () => {
        if (!adding) return;
        await evesov.structures.add(activePlanId, adding.systemId, {
            structureType: adding.type,
            name: adding.name.trim() || undefined,
            location: adding.location || undefined,
        });
        setAdding(null);
        await onRefresh();
    };

    const startImport = (systemId: number) => {
        setAdding(null);
        setImporting({ systemId, text: "", result: null });
    };

    const commitImport = async () => {
        if (!importing) return;
        const { count } = await evesov.structures.importClipboard(
            activePlanId,
            importing.systemId,
            importing.text,
        );
        setImporting({
            ...importing,
            result: `Imported ${count} structure${count !== 1 ? "s" : ""}.`,
        });
        await onRefresh();
    };

    return (
        <div className="structures__search-add">
            <input
                type="text"
                placeholder="Search for a system to add a structure…"
                value={query}
                onChange={(e) => void search(e.target.value)}
            />
            {results.map((r) => (
                <div key={r.systemId} className="structures__search-result">
                    <span>{r.systemName}</span>
                    <button type="button" onClick={() => startAdd(r.systemId)}>
                        + Add
                    </button>
                    <button
                        type="button"
                        onClick={() => startImport(r.systemId)}
                    >
                        ⎘ Import
                    </button>
                    {adding?.systemId === r.systemId && (
                        <form
                            className="structures__add-form"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void commitAdd();
                            }}
                        >
                            <select
                                value={adding.type}
                                onChange={(e) =>
                                    setAdding({
                                        ...adding,
                                        type: e.target.value as StructureType,
                                    })
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
                                value={adding.name}
                                onChange={(e) =>
                                    setAdding({
                                        ...adding,
                                        name: e.target.value,
                                    })
                                }
                            />
                            <select
                                value={adding.location}
                                onChange={(e) =>
                                    setAdding({
                                        ...adding,
                                        location: e.target.value as
                                            | StructureLocation
                                            | "",
                                    })
                                }
                            >
                                <option value="">Location (optional)</option>
                                {STRUCTURE_LOCATIONS.map((l) => (
                                    <option key={l} value={l}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                            <button type="submit">Save</button>
                            <button
                                type="button"
                                onClick={() => setAdding(null)}
                            >
                                Cancel
                            </button>
                        </form>
                    )}
                    {importing?.systemId === r.systemId && (
                        <div className="structures__import-form">
                            <textarea
                                rows={4}
                                placeholder="Paste structure names, one per line"
                                value={importing.text}
                                onChange={(e) =>
                                    setImporting({
                                        ...importing,
                                        text: e.target.value,
                                        result: null,
                                    })
                                }
                            />
                            <div className="structures__import-actions">
                                <button
                                    type="button"
                                    onClick={() => void commitImport()}
                                >
                                    Import
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setImporting(null)}
                                >
                                    Cancel
                                </button>
                                {importing.result && (
                                    <span className="structures__import-result">
                                        {importing.result}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
