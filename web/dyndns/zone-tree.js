// subzonesUnder lists the subzones below a base zone in the order the list shows them: each zone followed by the zones delegated under it, at any depth. The API names as parent the closest zone a subzone sits under, which may itself be a subzone (staging.llm.services.dhbw.cloud under llm.services.dhbw.cloud under services.dhbw.cloud).
export function subzonesUnder(zones, base) {
    const byParent = {};
    for (const z of zones) {
        if (z.parent) (byParent[z.parent] ??= []).push(z);
    }
    const out = [];
    const walk = (parent, seen) => {
        for (const z of [...(byParent[parent] ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
            if (seen.has(z.name)) continue;
            out.push(z);
            walk(z.name, new Set([...seen, z.name]));
        }
    };
    walk(base, new Set([base]));
    return out;
}
