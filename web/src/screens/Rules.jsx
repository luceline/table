import { useMemo, useRef, useState } from "react";
import { RULES } from "../lib/rules.js";

// Minuscules sans accents, caractère par caractère (même longueur que le texte d'origine)
const fold = (s) => Array.from(s).map((c) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()[0] || c).join("");

function Hl({ text, words }) {
  if (!words.length) return text;
  const chars = Array.from(text);
  const f = fold(text);
  const mark = new Array(chars.length).fill(false);
  for (const w of words) {
    let i = f.indexOf(w);
    while (i >= 0) {
      for (let k = i; k < i + w.length; k++) mark[k] = true;
      i = f.indexOf(w, i + w.length);
    }
  }
  const out = [];
  let buf = "", on = false;
  chars.forEach((c, i) => {
    if (mark[i] !== on) {
      if (buf) out.push(on ? <mark key={i}>{buf}</mark> : buf);
      buf = "";
      on = mark[i];
    }
    buf += c;
  });
  if (buf) out.push(on ? <mark key="end">{buf}</mark> : buf);
  return out;
}

const itemText = (it) => [it.k, it.t || "", ...(it.table ? [...it.table.head, ...it.table.rows.flat()] : [])].join(" ");

// Aide-mémoire des règles avec recherche (sans accents ni majuscules, tous les mots doivent figurer)
export function RulesPanel() {
  const [q, setQ] = useState("");
  const boxRef = useRef();
  const words = useMemo(() => fold(q.trim()).split(/\s+/).filter((w) => w.length > 0), [q]);
  const sections = useMemo(() => {
    if (!words.length) return RULES;
    return RULES.map((s) => {
      const inTitle = words.every((w) => fold(s.title).includes(w));
      const items = inTitle ? s.items : s.items.filter((it) => {
        const f = fold(`${s.title} ${itemText(it)}`);
        return words.every((w) => f.includes(w));
      });
      return { ...s, items };
    }).filter((s) => s.items.length);
  }, [words]);
  const count = sections.reduce((n, s) => n + s.items.length, 0);

  const jump = (id) => {
    setQ("");
    requestAnimationFrame(() => {
      const el = boxRef.current?.querySelector(`[data-sec="${id}"]`);
      if (el) boxRef.current.scrollTop = el.offsetTop - boxRef.current.offsetTop - 4;
    });
  };

  return (
    <div className="rules">
      <div className="rules-top">
        <div className="rules-search">
          <input
            className="input"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher : riposte, gel, unification…"
          />
          {q && <button className="btn sm ghost" onClick={() => setQ("")} aria-label="Effacer">✕</button>}
        </div>
        {!q && (
          <div className="rules-chips">
            {RULES.map((s) => (
              <button key={s.id} onClick={() => jump(s.id)}>{s.title}</button>
            ))}
          </div>
        )}
        {q && <div className="muted small">{count ? `${count} résultat${count > 1 ? "s" : ""}` : "Aucun résultat."}</div>}
      </div>
      <div className="rules-body" ref={boxRef}>
        {sections.map((s) => (
          <section key={s.id} data-sec={s.id}>
            <h4><Hl text={s.title} words={words} /></h4>
            {s.items.map((it, i) => (
              <div key={i} className="rule">
                <b><Hl text={it.k} words={words} /></b>
                {it.t && <> <Hl text={it.t} words={words} /></>}
                {it.table && (
                  <table>
                    <thead><tr>{it.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {it.table.rows.map((r, j) => (
                        <tr key={j}>{r.map((c, k) => <td key={k}><Hl text={c} words={words} /></td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </section>
        ))}
        <p className="muted small rules-note">Aide-mémoire non officiel. En cas de doute, les règles officielles de Safir et le texte des cartes font foi.</p>
      </div>
    </div>
  );
}
