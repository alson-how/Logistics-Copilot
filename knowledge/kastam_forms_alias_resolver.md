
# Malaysian Customs Forms (K-series) — Alias Resolver

Use this guide to map user requests like **“Kastam 2”**, **“Kastam No 2”**, or **“K2”** to the canonical **K2** form under **`/assets/forms`**. Same pattern for **K1, K3, K8, K9**.

---

## Directory & File Naming

- **Directory:** `/assets/forms`
- **Canonical filenames (PDF):**
  - `Kastam No.1.pdf`
  - `Kastam No.2.pdf`
  - `Kastam No.3.pdf`
  - `Kastam No.8.pdf`
  - `Kastam No.9.pdf`

> You can store other formats (e.g., `.docx`), but the resolver returns the `.pdf` path by default.

---

## Canonical Forms & Aliases

| Canonical | Preferred filename | Aliases (map any of these to the canonical) |
|---|---|---|
| **K1** | `/assets/forms/Kastam No.1.pdf` | K1, K 1, K-1, Kastam 1, Kastam No 1, Kastam No. 1, Borang K1, Customs Form 1, Form K1 |
| **K2** | `/assets/forms/Kastam No.2.pdf` | K2, K 2, K-2, Kastam 2, Kastam No 2, Kastam No. 2, Borang K2, Customs Form 2, Form K2 |
| **K3** | `/assets/forms/Kastam No.3.pdf` | K3, K 3, K-3, Kastam 3, Kastam No 3, Kastam No. 3, Borang K3, Customs Form 3, Form K3 |
| **K8** | `/assets/forms/Kastam No.8.pdf` | K8, K 8, K-8, Kastam 8, Kastam No 8, Kastam No. 8, Borang K8, Customs Form 8, Form K8 |
| **K9** | `/assets/forms/Kastam No.9.pdf` | K9, K 9, K-9, Kastam 9, Kastam No 9, Kastam No. 9, Borang K9, Customs Form 9, Form K9 |

**Rule of thumb:** “Kastam 2” ≈ “Kastam No 2” ≈ “K2” → **K2**.

---

## Normalization Rules (heuristic)

Before alias lookup, normalize the input string:

1. Uppercase the string.
2. Remove punctuation/spaces around the `K` and digits (`K- 2` → `K2`).
3. Drop helper tokens: `KASTAM`, `BORANG`, `CUSTOMS`, `FORM`, `NO`, `NO.`
4. Collapse whitespace.

**Examples**

- `kastam no 2` → `K2`  
- `borang   k-3` → `K3`  
- `customs form 8` → `K8`

---

## Node helper (TypeScript)

```ts
// /server/src/formsResolver.ts
const CANONICAL = ["K1","K2","K3","K8","K9"] as const;
type Canonical = typeof CANONICAL[number];

const ALIASES: Record<Canonical, string[]> = {
  K1: ["K1","KASTAM 1","KASTAM NO 1","KASTAM NO. 1","BORANG K1","CUSTOMS FORM 1","FORM K1","K-1","K 1"],
  K2: ["K2","KASTAM 2","KASTAM NO 2","KASTAM NO. 2","BORANG K2","CUSTOMS FORM 2","FORM K2","K-2","K 2"],
  K3: ["K3","KASTAM 3","KASTAM NO 3","KASTAM NO. 3","BORANG K3","CUSTOMS FORM 3","FORM K3","K-3","K 3"],
  K8: ["K8","KASTAM 8","KASTAM NO 8","KASTAM NO. 8","BORANG K8","CUSTOMS FORM 8","FORM K8","K-8","K 8"],
  K9: ["K9","KASTAM 9","KASTAM NO 9","KASTAM NO. 9","BORANG K9","CUSTOMS FORM 9","FORM K9","K-9","K 9"],
};

export function normalize(input: string): string {
  let s = input.toUpperCase().trim();
  s = s.replace(/[._:,/\\()\-]+/g, " ");          // remove punctuation
  s = s.replace(/\b(KASTAM|CUSTOMS|BORANG|FORM)\b/g, "");
  s = s.replace(/\bNO\.?\b/g, "");                // remove "NO" / "NO."
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\bK\s+(\d)\b/, "K$1");          // K 2 -> K2
  s = s.replace(/\bK-(\d)\b/, "K$1");             // K-2 -> K2
  return s;
}

export function resolveForm(input: string): { key: Canonical; path: string } | null {
  const n = normalize(input);
  if ((["K1","K2","K3","K8","K9"] as string[]).includes(n)) {
    return { key: n as Canonical, path: `/assets/forms/Kastam No.${n.substring(1)}.pdf` };
  }
  for (const key of CANONICAL) {
    for (const alias of ALIASES[key]) {
      if (normalize(alias) === n) return { key, path: `/assets/forms/Kastam No.${key.substring(1)}.pdf` };
    }
  }
  return null;
}
```

### Express route (optional)

```ts
// /server/src/routes/forms.ts
import { Router } from "express";
import { resolveForm } from "../formsResolver.js";

export const forms = Router();

forms.get("/forms/resolve", (req, res) => {
  const q = String(req.query.q || "");
  const hit = resolveForm(q);
  if (!hit) return res.status(404).json({ ok: false, error: "Unknown form" });
  res.json({ ok: true, ...hit });
});
```

### Quick tests

```ts
console.assert(resolveForm("K2")?.path === "/assets/forms/Kastam No.2.pdf");
console.assert(resolveForm("Kastam No 2")?.path === "/assets/forms/Kastam No.2.pdf");
console.assert(resolveForm("Kastam 2")?.path === "/assets/forms/Kastam No.2.pdf");
console.assert(resolveForm("Borang K3")?.path === "/assets/forms/Kastam No.3.pdf");
console.assert(resolveForm("Customs Form 8")?.path === "/assets/forms/Kastam No.8.pdf");
```

---

## How to answer the user

If user asks: **“Do you have K2 forms for me to download?”**

- Resolver → `resolveForm("K2")` ⇒ `{ key: "K2", path: "/assets/forms/K2.pdf" }`  
- Respond with a direct download link (or file blob) for `/assets/forms/K2.pdf`.  
- Offer related forms (K1, K3, K8, K9) as quick actions.
