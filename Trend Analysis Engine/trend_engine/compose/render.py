"""Renderer — report model -> the magazine HTML.

Editorial identity (user-directed): light beige paper, deep maroon accent, black
text. Didone display face (Didot) for headlines, a warm serif for body, small-caps
sans for labels/data. Output is title+style+body markup (no doctype/head/body
wrappers), usable as a standalone file and for publishing. See DESIGN.md §11.3.
"""
from __future__ import annotations

from html import escape

from trend_engine.schema.report import ReportModel

_CSS = """
<style>
/* Committed light "paper" design: beige everywhere, regardless of the viewer's
   dark mode. (A fashion print magazine is intentionally single-theme.) */
:root{
  --paper:#EFE8DA; --paper2:#E7DECB; --ink:#1C1712; --ink-soft:#6E6153;
  --accent:#7A1E2C; --accent-soft:#9B4453; --line:#D8CBB4; --line-strong:#C6B79B; --track:#DED3BE;
  --display:"Didot","Bodoni 72","Bodoni MT","Playfair Display",Georgia,serif;
  --body:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
  --label:"Helvetica Neue",Helvetica,"Arial Nova",Arial,sans-serif;
  color-scheme:light;
}
:root[data-theme=dark], :root[data-theme=light]{
  --paper:#EFE8DA; --paper2:#E7DECB; --ink:#1C1712; --ink-soft:#6E6153;
  --accent:#7A1E2C; --accent-soft:#9B4453; --line:#D8CBB4; --line-strong:#C6B79B; --track:#DED3BE;
}

*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:var(--body);line-height:1.62;margin:0;-webkit-font-smoothing:antialiased}
main{animation:rise .7s ease both}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){main{animation:none}}
.wrap{max-width:1060px;margin-inline:auto;padding-inline:clamp(22px,6vw,84px)}

.mast{text-align:center;padding-block:24px 20px;border-bottom:1px solid var(--line-strong)}
.mast .brand{font-family:var(--label);font-weight:600;letter-spacing:.5em;text-transform:uppercase;font-size:.9rem}
.mast .brand b{color:var(--accent);font-weight:600}
.mast .sub{font-family:var(--label);letter-spacing:.34em;text-transform:uppercase;font-size:.58rem;color:var(--ink-soft);margin-top:9px}

.hero{text-align:center;padding-block:clamp(52px,9vw,116px) clamp(34px,6vw,64px);border-bottom:1px solid var(--line)}
.eyebrow{font-family:var(--label);text-transform:uppercase;letter-spacing:.4em;font-size:.66rem;color:var(--accent);margin:0 0 clamp(22px,4vw,34px)}
.title{font-family:var(--display);font-weight:400;font-size:clamp(2.9rem,10vw,7.2rem);line-height:.98;margin:0;text-wrap:balance}
.standfirst{font-family:var(--body);font-style:italic;font-size:clamp(1.18rem,2.4vw,1.6rem);line-height:1.5;max-width:34ch;margin:clamp(24px,4vw,34px) auto 0;color:var(--ink-soft)}
.rule{width:52px;height:1px;background:var(--accent);margin:clamp(28px,4vw,40px) auto 0}
.hero-meta{font-family:var(--label);text-transform:uppercase;letter-spacing:.24em;font-size:.62rem;color:var(--ink-soft);margin:20px 0 0}

.glance{text-align:center;padding-block:24px;border-bottom:1px solid var(--line);font-family:var(--body);font-style:italic;font-size:1.04rem;color:var(--ink-soft)}
.glance b{display:block;font-family:var(--label);font-style:normal;text-transform:uppercase;letter-spacing:.3em;font-size:.58rem;color:var(--accent);margin-bottom:9px}
.glance .dot{color:var(--accent);margin:0 .55em}

.sec{display:grid;grid-template-columns:148px minmax(0,1fr);gap:clamp(20px,4vw,56px);padding-block:clamp(44px,6vw,82px);border-bottom:1px solid var(--line)}
.facet{position:sticky;top:24px;height:max-content;font-family:var(--label);text-transform:uppercase;letter-spacing:.28em;font-size:.64rem;color:var(--accent)}
.facet::after{content:"";display:block;width:22px;height:1px;background:var(--accent);margin-top:14px}
.coin{font-family:var(--display);font-weight:400;font-size:clamp(2rem,4.6vw,3.2rem);line-height:1.03;margin:0 0 clamp(16px,2vw,22px);text-wrap:balance}
.narr{font-size:1.12rem;line-height:1.7;max-width:60ch;margin:0}
.narr.drop::first-letter{font-family:var(--display);font-size:3.5em;line-height:.78;float:left;padding:8px 14px 0 0;color:var(--accent)}

.chips{display:flex;flex-wrap:wrap;gap:16px;margin-top:clamp(26px,3vw,36px)}
.chip{width:118px}
.chip .sw{height:94px;border:1px solid rgba(0,0,0,.14)}
.chip .nm{font-family:var(--display);font-size:1.02rem;margin-top:10px;line-height:1.1}
.chip .pan{font-family:var(--label);text-transform:uppercase;letter-spacing:.07em;font-size:.56rem;color:var(--ink-soft);margin-top:5px;line-height:1.4}
.chip .pct{font-family:var(--label);letter-spacing:.05em;font-size:.6rem;color:var(--accent);margin-top:5px}

.bars{margin-top:clamp(26px,3vw,34px);max-width:540px;display:flex;flex-direction:column;gap:14px}
.bar{display:grid;grid-template-columns:148px 1fr auto auto;align-items:center;gap:14px}
.bl{font-family:var(--body);font-size:1.02rem;text-transform:capitalize}
.track{height:5px;background:var(--track);position:relative;overflow:hidden}
.fill{position:absolute;inset:0 auto 0 0;background:var(--accent)}
.pct{font-family:var(--label);font-size:.72rem;color:var(--ink-soft);font-variant-numeric:tabular-nums;min-width:34px;text-align:right}
.move{font-family:var(--label);font-size:.62rem;letter-spacing:.03em;min-width:52px;text-align:right;font-variant-numeric:tabular-nums}
.move.up{color:var(--accent)}
.move.down{color:var(--ink-soft);opacity:.75}

.mv{font-family:var(--body);font-style:italic;font-size:1rem;margin:18px 0 0;color:var(--ink-soft)}
.mv .lab{font-family:var(--label);font-style:normal;text-transform:uppercase;letter-spacing:.16em;font-size:.58rem;margin-right:9px}
.mv.up .lab{color:var(--accent)}

.cue{margin-top:clamp(28px,3vw,38px);border-top:1px solid var(--line-strong);border-bottom:1px solid var(--line-strong);padding:18px 0}
.cue .cl{font-family:var(--label);text-transform:uppercase;letter-spacing:.2em;font-size:.58rem;color:var(--accent);margin:0 0 9px}
.cue p{margin:0;font-family:var(--body);font-style:italic;font-size:1.1rem;line-height:1.5;color:var(--ink)}

.pq{text-align:center;padding-block:clamp(50px,8vw,96px);border-bottom:1px solid var(--line)}
.pq blockquote{margin:0 auto;max-width:19ch;font-family:var(--display);font-weight:400;font-size:clamp(1.9rem,4.6vw,3.1rem);line-height:1.14}
.pq blockquote::before{content:"\\201C";display:block;color:var(--accent);font-family:var(--display);font-size:2.4em;line-height:.4;margin-bottom:.06em}
.pq cite{display:block;margin-top:22px;font-family:var(--label);font-style:normal;text-transform:uppercase;letter-spacing:.24em;font-size:.62rem;color:var(--ink-soft)}

.looks{padding-block:clamp(46px,6vw,78px)}
.looks h2{text-align:center;font-family:var(--display);font-weight:400;font-size:clamp(1.8rem,3.6vw,2.6rem);margin:0 0 6px}
.looks .sub{text-align:center;font-family:var(--label);text-transform:uppercase;letter-spacing:.24em;font-size:.58rem;color:var(--ink-soft);margin-bottom:clamp(26px,3vw,36px)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:14px}
.plate .frame{position:relative;aspect-ratio:3/4;border:1px solid var(--line-strong);background:var(--paper2);display:flex;align-items:flex-end;padding:10px;overflow:hidden}
.plate .frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.plate .tag{position:relative;font-family:var(--label);text-transform:uppercase;letter-spacing:.09em;font-size:.55rem;color:var(--ink-soft)}
.plate .frame:has(img) .tag{color:#fff;background:rgba(20,15,12,.5);padding:3px 7px}
.collage{display:flex;flex-wrap:wrap;gap:12px;margin-top:clamp(26px,3vw,34px)}
.collage figure{margin:0;width:112px}
.collage img{width:112px;height:150px;object-fit:cover;display:block;border:1px solid var(--line-strong);background:var(--paper2)}
.collage figcaption{font-family:var(--label);text-transform:uppercase;letter-spacing:.07em;font-size:.53rem;color:var(--ink-soft);margin-top:5px;line-height:1.3}

.foot{border-top:1px solid var(--line-strong);padding-block:32px 64px;text-align:center}
.foot .fb{font-family:var(--label);text-transform:uppercase;letter-spacing:.42em;font-size:.72rem;color:var(--accent);margin-bottom:14px}
.foot p{margin:0 auto;max-width:72ch;font-family:var(--body);font-style:italic;font-size:.84rem;line-height:1.7;color:var(--ink-soft)}

@media (max-width:720px){.sec{grid-template-columns:1fr;gap:10px}.facet{position:static}.facet::after{margin-bottom:2px}.bar{grid-template-columns:108px 1fr auto auto;gap:10px}}
</style>
"""


def _move(item) -> str:
    if not item.trustworthy or item.kind not in ("rising", "emerging", "fading", "dropped"):
        return '<span class="move"></span>'
    up = item.kind in ("rising", "emerging")
    d = round((item.delta or 0) * 100)
    return f'<span class="move {"up" if up else "down"}">{"▲" if up else "▼"} {d:+d}</span>'


def _bar(item, max_share: float) -> str:
    w = round(100 * item.share / max_share) if max_share else 0
    return (f'<div class="bar"><span class="bl">{escape(item.value.replace("-", " "))}</span>'
            f'<span class="track"><span class="fill" style="width:{w}%"></span></span>'
            f'<span class="pct">{round(item.share * 100)}%</span>{_move(item)}</div>')


def _chip(sw) -> str:
    pan = f"PANTONE {sw.pantone}" if sw.pantone else sw.family.title()
    return (f'<div class="chip"><div class="sw" style="background:{escape(sw.hex)}"></div>'
            f'<div class="nm">{escape(sw.family.title())}</div>'
            f'<div class="pan">{escape(pan)}</div>'
            f'<div class="pct">{round(sw.share * 100)}% of looks</div></div>')


def _moves_line(items, cls, word) -> str:
    if not items:
        return ""
    parts = ", ".join(f"{escape(i.value.replace('-', ' '))} ({round((i.delta or 0) * 100):+d})" for i in items)
    return f'<p class="mv {cls}"><span class="lab">{word}</span>{parts}</p>'


def _collage_html(sec) -> str:
    if not sec.collage:
        return ""
    figs = "".join(
        f'<figure><img loading="lazy" src="{escape(c.image)}" '
        f'alt="{escape(c.value.replace("-", " "))} — look {c.look_number}">'
        f'<figcaption>{escape(c.value.replace("-", " "))} · {c.look_number}</figcaption></figure>'
        for c in sec.collage)
    return f'<div class="collage">{figs}</div>'


def _section(sec, first: bool = False) -> str:
    max_share = max((i.share for i in sec.top), default=1.0)
    bars = "".join(_bar(i, max_share) for i in sec.top)
    chips = f'<div class="chips">{"".join(_chip(s) for s in sec.palette)}</div>' if sec.palette else ""
    rising = _moves_line(sec.rising, "up", "Rising")
    fading = _moves_line(sec.fading, "down", "Fading")
    cue = (f'<aside class="cue"><p class="cl">Designer’s cue</p><p>{escape(sec.designer_cue)}</p></aside>'
           if sec.designer_cue else "")
    narr_cls = "narr drop" if first else "narr"
    return (f'<section class="sec"><div><span class="facet">{escape(sec.label)}</span></div>'
            f'<div class="body"><h2 class="coin">{escape(sec.coined_name or sec.label)}</h2>'
            f'<p class="{narr_cls}">{escape(sec.narrative)}</p>{chips}'
            f'<div class="bars">{bars}</div>{rising}{fading}{_collage_html(sec)}{cue}</div></section>')


def render_html(model: ReportModel) -> str:
    w = model.window
    yrs = w.get("years", [])
    yr_txt = f"{min(yrs)}–{max(yrs)}" if yrs else ""
    meta = f"{yr_txt}  ·  {w.get('collections', '')} collections  ·  {w.get('looks', '')} looks  ·  Source: Vogue Runway"

    glance = ""
    if model.at_a_glance:
        pills = '<span class="dot">·</span>'.join(escape(p) for p in model.at_a_glance)
        glance = f'<section class="glance"><div class="wrap"><b>At a glance</b>{pills}</div></section>'

    pq = ""
    if model.pull_quote.text:
        pq = (f'<section class="pq"><div class="wrap"><blockquote>{escape(model.pull_quote.text)}</blockquote>'
              f'<cite>{escape(model.pull_quote.attribution)}</cite></div></section>')

    seen, plates = set(), []
    for sec in model.sections:
        for ev in sec.evidence:
            key = (ev.collection_id, ev.look_number)
            if key in seen:
                continue
            seen.add(key)
            label = ev.collection_id.replace(f"{model.brand.lower()}-", "").replace("-", " ")
            img = f'<img loading="lazy" src="{escape(ev.image)}" alt="look {ev.look_number}">' if ev.image else ""
            plates.append(f'<div class="plate"><div class="frame">{img}<span class="tag">{escape(label)} · look {ev.look_number}</span></div></div>')
            if len(plates) >= 8:
                break
        if len(plates) >= 8:
            break
    gallery = (f'<section class="looks"><div class="wrap"><h2>The Looks</h2>'
               f'<p class="sub">Evidence · Vogue Runway</p><div class="grid">{"".join(plates)}</div></div></section>'
               ) if plates else ""

    sections = "".join(f'<div class="wrap">{_section(s, first=(i == 0))}</div>'
                       for i, s in enumerate(model.sections))

    return (
        f'<title>{escape(model.brand)} — Fashionaire Trend Report</title>{_CSS}'
        f'<header class="mast"><div class="brand">Fashion<b>aire</b></div>'
        f'<div class="sub">Runway Trend Report · {escape(model.report_type.title())}</div></header>'
        f'<main><section class="hero"><div class="wrap">'
        f'<p class="eyebrow">{escape(model.brand)} · {escape(model.report_type.title())} · {escape(yr_txt)}</p>'
        f'<h1 class="title">{escape(model.headline or model.brand)}</h1>'
        f'<p class="standfirst">{escape(model.standfirst)}</p><div class="rule"></div>'
        f'<p class="hero-meta">{escape(meta)}</p></div></section>'
        f'{glance}{sections}{pq}{gallery}'
        f'<footer class="foot"><div class="wrap"><div class="fb">Fashionaire</div>'
        f'<p>Figures are share-of-looks across {escape(yr_txt)}. Momentum is year-over-year; '
        f'seasonally-unconfirmed moves are omitted. Colours shown by Pantone; trend names are '
        f'Fashionaire’s labels for observed clusters. Generated by the Trend Analysis Engine from Vogue Runway data.</p>'
        f'</div></footer></main>'
    )
