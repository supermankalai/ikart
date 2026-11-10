import { useState } from "react";
import { useAuth } from "../../context/auth";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { newId } from "../../lib/designState";
import { fitPlacement, loadImage } from "../../lib/teeMockup";
import Icon from "../Icon";
import { useDesigner } from "./context";
import { ImageTools } from "./UploadPanel";

const STYLES = [
  { id: "none", label: "Any" },
  { id: "minimalist", label: "Minimalist" },
  { id: "cartoon", label: "Cartoon" },
  { id: "traditional_indian", label: "Traditional Indian" },
  { id: "modern", label: "Modern" },
  { id: "vintage", label: "Vintage" },
  { id: "bold_graphic", label: "Bold graphic" },
];

const IDEAS = ["A roaring tiger wearing sunglasses", "Lotus flower mandala", "Retro sunset over mountains", "Cute astronaut cat", "Royal Enfield on a highway"];

let generated: { url: string; prompt: string }[] = [];

export default function AiPanel() {
  const { add, spec, config, setConfig, requireAuth, active } = useDesigner();
  const { user } = useAuth();
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("none");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(generated);
  const editing = active && active.kind === "ai" ? active : null;

  const place = async (url: string, name: string) => {
    const img = await loadImage(url);
    add({ id: newId(), kind: "ai", src: url, source: img, original: img, url, natW: img.naturalWidth, natH: img.naturalHeight, name, p: fitPlacement(spec, img.naturalWidth, img.naturalHeight, 0.75, 0.05) });
  };

  const generate = () =>
    requireAuth(async () => {
      if (prompt.trim().length < 3) return toast("Describe the picture you want", "error");
      setBusy(true);
      try {
        const r = await api<{ url: string; remaining: number }>("/api/custom/ai-image", { body: { prompt: prompt.trim(), style } });
        generated = [{ url: r.url, prompt: prompt.trim() }, ...generated].slice(0, 12);
        setList(generated);
        if (config) setConfig({ ...config, ai_remaining: r.remaining });
        await place(r.url, prompt.trim());
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setBusy(false);
      }
    });

  if (!config?.ai_enabled) return <div><h3 className="dz-h">AI image</h3><p className="muted small">AI images are not available right now.</p></div>;

  return (
    <div>
      <h3 className="dz-h">AI image</h3>
      <p className="muted small" style={{ marginTop: 0 }}>Describe a picture and we'll create it for your T-shirt.</p>
      <textarea className="input" rows={3} maxLength={400} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. a lion with a crown, line art" aria-label="Describe your image" />
      <div className="chip-set mt-8">
        {IDEAS.slice(0, 3).map((i) => <button key={i} className="chip" onClick={() => setPrompt(i)}>{i}</button>)}
      </div>
      <div className="dz-label mt-16">Style</div>
      <div className="chip-set">
        {STYLES.map((s) => <button key={s.id} className={`chip ${style === s.id ? "on" : ""}`} onClick={() => setStyle(s.id)}>{s.label}</button>)}
      </div>
      <button className="btn block mt-16" disabled={busy || (user ? config.ai_remaining === 0 : false)} onClick={generate}>
        <Icon name="sparkles" className="icon sm" /> {busy ? "Creating your image… (up to a minute)" : "Generate image"}
      </button>
      <div className="xs muted center mt-8">
        {user && config.ai_remaining !== null ? `${config.ai_remaining} of ${config.ai_daily_limit} left today` : `Up to ${config.ai_daily_limit} images a day`}
      </div>
      {!!list.length && (
        <>
          <div className="dz-label mt-16">Your AI images</div>
          <div className="dz-art">
            {list.map((g) => (
              <button key={g.url} onClick={() => place(g.url, g.prompt)} title={g.prompt}><img src={g.url} alt={g.prompt} /><span>{g.prompt}</span></button>
            ))}
          </div>
        </>
      )}
      {editing && <div className="mt-16"><ImageTools layer={editing} /></div>}
    </div>
  );
}
