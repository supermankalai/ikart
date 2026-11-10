import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { Empty, Img, Loader } from "../../components/ui";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import type { SavedDesign } from "../../lib/types";

/** Customer's saved T-shirt designs: open to edit/order, share, delete. */
export default function MyDesigns() {
  const toast = useToast();
  const [list, setList] = useState<SavedDesign[] | null>(null);

  useEffect(() => {
    api<SavedDesign[]>("/api/custom/designs").then(setList).catch((e) => toast(e.message, "error"));
  }, [toast]);

  const remove = async (d: SavedDesign) => {
    if (!window.confirm(`Delete "${d.name}"?`)) return;
    try {
      await api(`/api/custom/designs/${d.id}`, { method: "DELETE" });
      setList((l) => l?.filter((x) => x.id !== d.id) || null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const share = async (d: SavedDesign) => {
    const link = `${window.location.origin}/customize?design=${d.token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast("Share link copied", "success");
    } catch {
      window.prompt("Copy this link", link);
    }
  };

  if (!list) return <Loader />;
  return (
    <div>
      <div className="row between wrap mb-16">
        <h2 className="serif" style={{ fontSize: 28, margin: 0 }}>My designs</h2>
        <Link to="/customize" className="btn sm"><Icon name="plus" className="icon sm" /> New design</Link>
      </div>
      {!list.length ? (
        <Empty title="No saved designs yet" icon="image">
          <p className="muted">Design a T-shirt and press <b>Save</b> to keep it here.</p>
          <Link to="/customize" className="btn mt-16">Design your own T-shirt</Link>
        </Empty>
      ) : (
        <div className="designs-grid">
          {list.map((d) => (
            <div key={d.id} className="card design-card">
              <Link to={`/customize?design=${d.token}`} className="design-thumb"><Img src={d.preview_url} alt={d.name} /></Link>
              <div className="small"><b>{d.name}</b></div>
              <div className="xs muted">{d.product_name || "T-shirt"} · {d.color} · {fmtDate(d.updated_at)}</div>
              <div className="row wrap mt-8">
                <Link to={`/customize?design=${d.token}`} className="btn sm">Open</Link>
                <button className="btn light sm" onClick={() => share(d)}><Icon name="share" className="icon sm" /> Share</button>
                <button className="icon-btn" onClick={() => remove(d)} aria-label={`Delete ${d.name}`}><Icon name="trash" className="icon sm" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
