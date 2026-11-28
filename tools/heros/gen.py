# Génère les images des cartes du prototype et web/public/heros/cards.json.
# Usage : python3 tools/heros/gen.py  (depuis la racine du dépôt)
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from data import CARDS, QUESTS, EQUIP, DECKS

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "web", "public", "heros")
os.makedirs(OUT, exist_ok=True)
W, H = 504, 704
F_TITLE = "/usr/share/fonts/truetype/google-fonts/ofl/cardo/Cardo-Bold.ttf"
F_BODY = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
F_BOLD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
F_BLACK = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
font = lambda p, s: ImageFont.truetype(p, s)

PAL = {
    "Feu": ((122, 30, 14), (36, 10, 6), (240, 120, 50)),
    "Garde": ((26, 56, 98), (8, 16, 32), (120, 170, 230)),
    "": ((70, 52, 92), (20, 14, 28), (190, 160, 230)),
    "quete": ((96, 76, 36), (30, 22, 10), (236, 196, 110)),
    "equipement": ((60, 64, 70), (16, 18, 20), (200, 170, 120)),
}
TIER = {"simple": ("SIMPLE", (86, 170, 96)), "intermediaire": ("INTERMÉDIAIRE", (220, 160, 60)), "complexe": ("COMPLEXE", (210, 70, 70))}


def bg(pal):
    top, bot, acc = pal
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(3)))
    return im


def wrap(d, text, f, maxw):
    out = []
    for para in text.split("\n"):
        line = ""
        for w in para.split(" "):
            t = (line + " " + w).strip()
            if d.textlength(t, font=f) <= maxw:
                line = t
            else:
                if line:
                    out.append(line)
                line = w
        out.append(line)
    return out


def fit(d, blocks, box_w, box_h, start=30, minsize=17):
    # blocks : [(texte, gras?)] ; renvoie la taille de police qui tient dans la boîte
    for s in range(start, minsize - 1, -1):
        h = 0
        for txt, bold in blocks:
            f = font(F_BOLD if bold else F_BODY, s)
            h += len(wrap(d, txt, f, box_w)) * int(s * 1.28) + int(s * 0.5)
        if h <= box_h:
            return s
    return minsize


def frame(im, acc):
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([6, 6, W - 7, H - 7], radius=26, outline=acc, width=5)
    d.rounded_rectangle([16, 16, W - 17, H - 17], radius=20, outline=tuple(int(c * 0.55) for c in acc), width=2)
    return d


def emblem(d, kind, fam, cx, cy, r, acc):
    col = tuple(int(c * 0.9) for c in acc)
    dim = tuple(int(c * 0.35) for c in acc)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dim, outline=col, width=4)
    if fam == "Feu":  # flamme : deux gouttes pointées vers le haut
        def drop(sc, dy, fill):
            pts = []
            for i in range(61):
                t = i / 60 * 2 * math.pi
                pts.append((cx + r * 0.5 * sc * math.sin(t) * abs(math.sin(t / 2)) ** 1.3, cy + dy - r * 0.62 * sc * math.cos(t)))
            d.polygon(pts, fill=fill)
        drop(1.0, 4, col)
        drop(0.55, 22, (255, 214, 120))
    elif fam == "Garde" or kind == "reaction":  # bouclier
        w, h = r * 0.62, r * 0.75
        d.polygon([(cx - w, cy - h), (cx + w, cy - h), (cx + w, cy), (cx, cy + h), (cx - w, cy)], fill=col)
        d.line([(cx, cy - h + 8), (cx, cy + h - 12)], fill=dim, width=6)
    elif kind == "quete":  # parchemin
        d.rounded_rectangle([cx - r * 0.55, cy - r * 0.6, cx + r * 0.55, cy + r * 0.6], radius=10, fill=col)
        for k in range(4):
            y = cy - r * 0.35 + k * r * 0.22
            d.line([(cx - r * 0.38, y), (cx + r * 0.38, y)], fill=dim, width=5)
    elif kind == "equipement":  # épée
        d.polygon([(cx, cy - r * 0.75), (cx + r * 0.1, cy + r * 0.2), (cx - r * 0.1, cy + r * 0.2)], fill=col)
        d.rectangle([cx - r * 0.36, cy + r * 0.2, cx + r * 0.36, cy + r * 0.3], fill=col)
        d.rectangle([cx - r * 0.07, cy + r * 0.3, cx + r * 0.07, cy + r * 0.62], fill=col)
    else:  # étoile
        pts = []
        for i in range(10):
            a = i * math.pi / 5 - math.pi / 2
            rr = r * (0.62 if i % 2 == 0 else 0.26)
            pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
        d.polygon(pts, fill=col)


def badge(d, cx, cy, r, txt, fill, outline, s=40, fg=(255, 255, 255)):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill, outline=outline, width=4)
    f = font(F_BLACK, s)
    d.text((cx, cy + 1), txt, font=f, fill=fg, anchor="mm")


def title(d, name, y, acc, maxw=W - 80):
    s = 44
    while s > 24 and d.textlength(name, font=font(F_TITLE, s)) > maxw:
        s -= 2
    d.text((W / 2, y), name, font=font(F_TITLE, s), fill=(250, 244, 230), anchor="mm", stroke_width=2, stroke_fill=(0, 0, 0))


def textbox(im, blocks, top, bottom, acc):
    d = ImageDraw.Draw(im, "RGBA")
    d.rounded_rectangle([30, top, W - 30, bottom], radius=16, fill=(250, 245, 232, 236), outline=acc, width=3)
    bw, bh = W - 96, bottom - top - 36
    s = fit(d, blocks, bw, bh)
    y = top + 18
    for txt, bold in blocks:
        f = font(F_BOLD if bold else F_BODY, s)
        for ln in wrap(d, txt, f, bw):
            d.text((48, y), ln, font=f, fill=(28, 22, 18))
            y += int(s * 1.28)
        y += int(s * 0.5)


def footer(d, code, acc):
    d.text((W / 2, H - 34), f"{code} · Prototype v0.2", font=font(F_BODY, 16), fill=tuple(int(c * 0.9) for c in acc), anchor="mm")


def card_img(c):
    fam = c.get("fam", "")
    pal = PAL[fam]
    im = bg(pal)
    acc = pal[2]
    d = frame(im, acc)
    emblem(d, c["kind"], fam, W / 2, 215, 86, acc)
    badge(d, 64, 64, 38, str(c["cost"]), (30, 80, 170), (170, 210, 255))
    d.text((64, 112), "MANA", font=font(F_BOLD, 14), fill=(200, 220, 255), anchor="mm")
    badge(d, W - 64, 64, 38, str(c["lvl"]), (60, 40, 20), (240, 200, 120), fg=(255, 230, 170))
    d.text((W - 64, 112), "NIVEAU", font=font(F_BOLD, 14), fill=(255, 225, 160), anchor="mm")
    title(d, c["name"], 340, acc)
    typ = ("RÉACTION" if c["kind"] == "reaction" else "ACTION") + (f"  ·  [{fam}]" if fam else "")
    d.text((W / 2, 384), typ, font=font(F_BOLD, 20), fill=acc, anchor="mm")
    blocks = [(c["text"], False)]
    if c.get("chain"):
        diff, rest = c["chain"].split(" : ", 1)
        blocks.append((f"Enchaînement ({diff.lower()}) : {rest}", True))
    textbox(im, blocks, 410, H - 62, acc)
    footer(ImageDraw.Draw(im), c["code"], acc)
    return im


def quest_img(q):
    pal = PAL["quete"]
    im = bg(pal)
    acc = pal[2]
    d = frame(im, acc)
    lbl, tcol = TIER[q["tier"]]
    emblem(d, "quete", "", W / 2, 200, 74, acc)
    badge(d, 64, 64, 38, str(q["cost"]), (30, 80, 170), (170, 210, 255))
    d.text((64, 112), "MANA", font=font(F_BOLD, 14), fill=(200, 220, 255), anchor="mm")
    d.rounded_rectangle([W - 210, 40, W - 34, 88], radius=12, fill=tcol, outline=(255, 255, 255), width=2)
    d.text((W - 122, 64), lbl, font=font(F_BLACK, 20 if len(lbl) < 10 else 17), fill=(255, 255, 255), anchor="mm")
    d.text((W / 2, 300), "QUÊTE", font=font(F_BOLD, 20), fill=acc, anchor="mm")
    title(d, q["name"], 342, acc)
    tag = {"⚔": "Situationnelle", "⏳": "Pas en ouverture"}.get(q.get("tag"), "")
    blocks = [("Objectif", True), (q["goal"], False), ("Récompense", True), (q["reward"], False),
              ("À la validation : +1 niveau, la récompense, +3 points d'équipement, +1 mana.", False)]
    textbox(im, blocks, 384, H - 62, acc)
    d = ImageDraw.Draw(im)
    footer(d, q["code"] + (f" · {tag}" if tag else ""), acc)
    return im


def equip_img(e):
    pal = PAL["equipement"]
    im = bg(pal)
    acc = pal[2]
    d = frame(im, acc)
    emblem(d, "equipement", "", W / 2, 205, 80, acc)
    badge(d, 64, 64, 38, str(e["cost"]), (120, 90, 20), (250, 210, 120))
    d.text((64, 112), "POINTS", font=font(F_BOLD, 14), fill=(250, 220, 150), anchor="mm")
    d.rounded_rectangle([W - 196, 40, W - 34, 88], radius=12, fill=(40, 44, 50), outline=acc, width=2)
    d.text((W - 115, 64), e["slot"].upper(), font=font(F_BLACK, 19), fill=(240, 220, 180), anchor="mm")
    d.text((W / 2, 306), "ÉQUIPEMENT", font=font(F_BOLD, 20), fill=acc, anchor="mm")
    title(d, e["name"], 346, acc)
    mode = "Activé (une fois par tour, sans mana)" if e["mode"] == "Activé" else "Passif"
    textbox(im, [(mode, True), (e["text"], False), ("Inactif tant qu'il n'est pas débloqué : tournez la pièce de côté.", False)], 388, H - 62, acc)
    footer(ImageDraw.Draw(im), e["code"], acc)
    return im


# Les images sont dessinées dans le navigateur (web/src/lib/herosCard.js) : ici seulement les données.
# python3 tools/heros/gen.py --images : aperçus JPEG dans /tmp/heros_apercu (non publiés).
out = []
for c in CARDS:
    out.append({**c, "fam": c.get("fam", ""), "chain": c.get("chain", "")})
for q in QUESTS:
    out.append(dict(q))
for e in EQUIP:
    out.append(dict(e))
if "--images" in sys.argv:
    os.makedirs("/tmp/heros_apercu", exist_ok=True)
    for c in CARDS: card_img(c).save(f"/tmp/heros_apercu/{c['code']}.jpg", quality=86)
    for q in QUESTS: quest_img(q).save(f"/tmp/heros_apercu/Q{q['code']}.jpg", quality=86)
    for e in EQUIP: equip_img(e).save(f"/tmp/heros_apercu/{e['code']}.jpg", quality=86)
# decks : cartes et quêtes par code (une carte A1 et une quête A1 sont distinguées par leur type)
decks = [{"name": d["name"], "cards": d["cards"], "quests": d["quests"], "equip": [e["code"] for e in EQUIP]} for d in DECKS]
for f in os.listdir(OUT):
    if f.endswith(".jpg"): os.remove(os.path.join(OUT, f))
json.dump({"version": 3, "cards": out, "decks": decks}, open(os.path.join(OUT, "cards.json"), "w"), ensure_ascii=False, indent=1)
print(len(out), "cartes")
