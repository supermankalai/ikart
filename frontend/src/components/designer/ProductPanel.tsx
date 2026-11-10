import { money } from "../../lib/format";
import { Img } from "../ui";
import { useDesigner } from "./context";

export function ColorSwatches({ size = "md" }: { size?: "sm" | "md" }) {
  const { product, color, setColor, locked } = useDesigner();
  const colors = [...new Map(product.variants.map((v) => [v.color, v.color_hex || "#ffffff"])).entries()];
  const inStock = (c: string) => product.variants.some((v) => v.color === c && v.stock > 0);
  return (
    <div className="dz-colors" role="radiogroup" aria-label="T-shirt colour">
      {colors.map(([name, hex]) => (
        <button key={name} role="radio" aria-checked={name === color} className={`${size} ${name === color ? "on" : ""}`} style={{ background: hex }}
          title={inStock(name) ? name : `${name} (out of stock)`} aria-label={name} disabled={locked || !inStock(name)} onClick={() => setColor(name)} />
      ))}
    </div>
  );
}

export default function ProductPanel() {
  const { products, product, setProduct, color, settings, locked } = useDesigner();
  return (
    <div>
      <h3 className="dz-h">T-shirt</h3>
      {!locked && (
        <div className="custom-products">
          {products.map((p) => (
            <button key={p.id} className={`custom-product ${product.id === p.id ? "on" : ""}`} onClick={() => setProduct(p)}>
              <Img src={p.images[0]} alt={p.name} className="thumb s56" />
              <span>
                <b>{p.name}</b>
                <span className="muted small">from {money(p.price + settings.custom_print_price)} with print</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="dz-label mt-16">Colour: <b>{color}</b></div>
      <ColorSwatches />
      {product.description && <p className="small muted mt-16">{product.description}</p>}
      {product.details && <p className="xs muted" style={{ whiteSpace: "pre-line" }}>{product.details}</p>}
      {product.slug && <a className="link xs" href={`/product/${product.slug}`} target="_blank" rel="noreferrer">Product details & size guide ↗</a>}
    </div>
  );
}
