// Whitelisted SQL generator. The visual layer changes the actual relational query.
import { SCHEMA } from "./data-lab.js";
export const TABLE_LABELS = {
  orders:"Pedidos", customers:"Clientes", order_items:"Itens", products:"Produtos", payments:"Pagamentos"
};
const aliases={orders:"o",customers:"c",order_items:"i",products:"p",payments:"pay"};
const relationships={
  orders:{customers:"LEFT JOIN customers c ON o.customer_id = c.customer_id",payments:"LEFT JOIN payments pay ON o.order_id = pay.order_id",order_items:"LEFT JOIN order_items i ON o.order_id = i.order_id"},
  order_items:{orders:"LEFT JOIN orders o ON i.order_id = o.order_id",products:"LEFT JOIN products p ON i.product_id = p.product_id"},
  payments:{orders:"LEFT JOIN orders o ON pay.order_id = o.order_id"},
  customers:{orders:"LEFT JOIN orders o ON c.customer_id = o.customer_id"},
  products:{order_items:"LEFT JOIN order_items i ON p.product_id = i.product_id"}
};
export const DIMENSIONS={
  month:{title:"Mês",expression:"DATE_TRUNC('month', o.order_date)",joins:[]},
  channel:{title:"Canal",expression:"o.channel",joins:[]},
  status:{title:"Status",expression:"o.status",joins:[]},
  region:{title:"Região",expression:"c.region",joins:["customers"]},
  segment:{title:"Segmento",expression:"c.segment",joins:["customers"]},
  category:{title:"Categoria",expression:"p.category",joins:["order_items","products"]},
  method:{title:"Pagamento",expression:"pay.method",joins:["payments"]}
};
export const METRICS={revenue:"Receita",orders:"Pedidos",ticket:"Ticket médio"};
export function getColumns(base, relation) {
  const main = SCHEMA[base].map(name=>({id:aliases[base]+"."+name,label:name}));
  return relation && SCHEMA[relation] ?
    [...main,...SCHEMA[relation].map(name=>({id:aliases[relation]+"."+name,label:relation+" · "+name}))] : main;
}
export function getRelations(base){return Object.keys(relationships[base] || {});}
export const DEFAULT_COLUMNS=["o.order_id","o.order_date","o.status","o.channel","o.total_amount"];
const safeValue=(value,allowed)=>allowed.includes(value)?value:"";
export function buildQuery(s) {
  if (s.mode==="rows") {
    const base=SCHEMA[s.base]?s.base:"orders";
    const alias=aliases[base];
    const relation=getRelations(base).includes(s.relation)?s.relation:"";
    const valid=getColumns(base,relation).map(col=>col.id);
    const selected=(s.columns||[]).filter(col=>valid.includes(col));
    const columns=selected.length?selected:[alias+"."+SCHEMA[base][0]];
    const from="FROM "+base+" "+alias+(relation?"\n"+relationships[base][relation]:"");
    const where=[];
    if(s.status && base==="orders") where.push("o.status = '"+safeValue(s.status,["delivered","shipped","cancelled"])+"'");
    if(s.region && (base==="customers" || relation==="customers")) where.push("c.region = '"+safeValue(s.region,["Sudeste","Sul","Nordeste","Centro-Oeste","Norte"])+"'");
    const limit=Math.min(100,Math.max(5,Number(s.limit)||25));
    return ["SELECT\n  "+columns.map(c=>c+" AS "+c.replace(".","_")).join(",\n  "),from,where.length?"WHERE "+where.join("\n  AND "):"", "ORDER BY "+alias+"."+SCHEMA[base][0]+" ASC","LIMIT "+limit+";"].filter(Boolean).join("\n");
  }
  const dim=DIMENSIONS[s.dimension]?s.dimension:"month";
  const d=DIMENSIONS[dim];
  const joins=new Set(d.joins);
  if(s.region) joins.add("customers");
  if(s.metric!=="orders" && dim==="category") joins.add("order_items");
  let joinSql="";
  if(joins.has("customers")) joinSql+="\nLEFT JOIN customers c ON o.customer_id = c.customer_id";
  if(joins.has("order_items")) joinSql+="\nLEFT JOIN order_items i ON o.order_id = i.order_id";
  if(joins.has("products")) joinSql+="\nLEFT JOIN products p ON i.product_id = p.product_id";
  if(joins.has("payments")) joinSql+="\nLEFT JOIN payments pay ON o.order_id = pay.order_id";
  const revenue=dim==="category"?"SUM(i.quantity * i.unit_price)":"SUM(o.total_amount)";
  const expression=s.metric==="orders"?"COUNT(DISTINCT o.order_id)":s.metric==="ticket"?"ROUND("+revenue+" / NULLIF(COUNT(DISTINCT o.order_id), 0), 2)": "ROUND("+revenue+", 2)";
  const filters=[];
  if(s.status) filters.push("o.status = '"+safeValue(s.status,["delivered","shipped","cancelled"])+"'");
  if(s.region) filters.push("c.region = '"+safeValue(s.region,["Sudeste","Sul","Nordeste","Centro-Oeste","Norte"])+"'");
  const drill=String(s.drill||"");
  if(drill && dim!=="month" && drill.length<100) filters.push(d.expression+" = '"+drill.replaceAll("'","''")+"'");
  const where=filters.length?"\nWHERE "+filters.join("\n  AND "):"";
  const compare= s.window ? (dim==="month"
      ? ",\n  LAG(value) OVER (ORDER BY label) AS previous_value"
      : ",\n  DENSE_RANK() OVER (ORDER BY value DESC) AS position") : "";
  return "WITH grouped AS (\n  SELECT\n    "+d.expression+" AS label,\n    "+expression+" AS value\n  FROM orders o"+
    joinSql+where+"\n  GROUP BY 1\n)\nSELECT\n  label,\n  value"+compare+
    "\nFROM grouped\nORDER BY "+(dim==="month"?"label ASC":"value DESC")+"\nLIMIT 30;";
}
