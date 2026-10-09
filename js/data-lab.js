// Deterministic synthetic commerce database. No external analytics or credentials.
const CDN = "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";
let connection = null;
let pending = null;
export const SCHEMA = {
  orders: ["order_id", "customer_id", "order_date", "status", "channel", "total_amount"],
  customers: ["customer_id", "customer_name", "region", "segment", "signup_date"],
  order_items: ["item_id", "order_id", "product_id", "quantity", "unit_price"],
  products: ["product_id", "product_name", "category", "list_price"],
  payments: ["payment_id", "order_id", "method", "paid_amount", "payment_status"]
};
const TABLE_DEFS = {
  customers: "customer_id VARCHAR, customer_name VARCHAR, region VARCHAR, segment VARCHAR, signup_date DATE",
  products: "product_id VARCHAR, product_name VARCHAR, category VARCHAR, list_price DOUBLE",
  orders: "order_id VARCHAR, customer_id VARCHAR, order_date DATE, status VARCHAR, channel VARCHAR, total_amount DOUBLE",
  order_items: "item_id VARCHAR, order_id VARCHAR, product_id VARCHAR, quantity INTEGER, unit_price DOUBLE",
  payments: "payment_id VARCHAR, order_id VARCHAR, method VARCHAR, paid_amount DOUBLE, payment_status VARCHAR"
};
function timeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + " demorou demais. Verifique a conexão e recarregue.")), ms); })
  ]).finally(() => clearTimeout(timer));
}
function makeSeedData() {
  let seed = 582031;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (items) => items[Math.floor(random() * items.length)];
  const dates = (n) => new Date(Date.UTC(2025,0,1+n)).toISOString().slice(0,10);
  const rows = { customers: [], orders: [], order_items: [], products: [], payments: [] };
  const regions = ["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte"];
  const categories = ["Tecnologia", "Casa", "Esporte", "Moda", "Livros"];
  for (let i = 1; i <= 200; i++) {
    rows.customers.push(["C"+String(i).padStart(4,"0"), "Cliente "+i, pick(regions), pick(["B2C", "B2B", "Premium"]), dates(Math.floor(random()*170))]);
  }
  for (let i = 1; i <= 40; i++) {
    rows.products.push(["P"+String(i).padStart(3,"0"), "Produto "+i, categories[(i-1)%5], +(22+random()*680).toFixed(2)]);
  }
  let itemId = 0;
  for (let i = 1; i <= 1200; i++) {
    const orderId = "O"+String(i).padStart(5,"0");
    const customer = pick(rows.customers);
    const status = pick(["delivered", "delivered", "delivered", "shipped", "cancelled"]);
    const channel = pick(["Web", "App", "Marketplace"]);
    const numberOfItems = 1+Math.floor(random()*3);
    let total = 0;
    for (let k=0; k<numberOfItems;k++) {
      const product = pick(rows.products);
      const qty=1+Math.floor(random()*3);
      const price=Number(product[3]);
      total += qty*price;
      rows.order_items.push(["I"+String(++itemId).padStart(6,"0"), orderId, product[0], qty, price]);
    }
    total = +total.toFixed(2);
    rows.orders.push([orderId, customer[0], dates(Math.floor(random()*360)), status, channel, total]);
    rows.payments.push(["PM"+String(i).padStart(5,"0"), orderId, pick(["Pix", "Cartão", "Boleto"]), status==="cancelled"?0:total, status==="cancelled"?"void":"paid"]);
  }
  return rows;
}
function asCsv(columns, rows) {
  return [columns.join(","), ...rows.map(row => row.map(v => String(v).replace(/,/g,"")).join(","))].join("\n");
}
function mapRow(row) {
  const source = typeof row.toJSON === "function" ? row.toJSON() : row;
  return Object.fromEntries(Object.entries(source).map(([k,v]) => [k,typeof v === "bigint"? Number(v) : v instanceof Date ? v.toISOString().slice(0,10) : v]));
}
export async function initializeDatabase(onStatus = () => {}) {
  if (connection) return connection;
  if (pending) return pending;
  pending = (async () => {
    onStatus("Baixando o mecanismo SQL…");
    const duckdb = await timeout(import(CDN), 18000, "Download do DuckDB");
    const bundle = await timeout(duckdb.selectBundle(duckdb.getJsDelivrBundles()), 7000, "Seleção de engine");
    const workerURL = URL.createObjectURL(new Blob(['importScripts("'+bundle.mainWorker+'");'], {type:"text/javascript"}));
    const worker = new Worker(workerURL);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    try {
      onStatus("Iniciando o banco local…");
      await timeout(db.instantiate(bundle.mainModule, bundle.pthreadWorker), 25000, "Inicialização");
      URL.revokeObjectURL(workerURL);
      const conn = await db.connect();
      onStatus("Preparando as cinco tabelas…");
      const data = makeSeedData();
      for (const [name, columns] of Object.entries(SCHEMA)) {
        const filename=name+".csv";
        await db.registerFileBuffer(filename,new TextEncoder().encode(asCsv(columns,data[name])));
        await timeout(conn.query("CREATE TABLE "+name+" AS SELECT * FROM read_csv_auto('"+filename+"', HEADER=true, ALL_VARCHAR=true);"),10000,"Carregamento da tabela "+name);
        // The source is textual by design. Cast relevant types explicitly for analytics.
        const types = Object.fromEntries(TABLE_DEFS[name].split(", ").map(field => { const [column,type]=field.split(" ");return [column,type]; }));
        for (const [column,type] of Object.entries(types)) {
          if (type!=="VARCHAR") await conn.query("ALTER TABLE "+name+" ALTER COLUMN "+column+" TYPE "+type+" USING TRY_CAST("+column+" AS "+type+")");
        }
      }
      await conn.query("SET enable_external_access = false");
      connection = conn;
      onStatus("Banco pronto");
      return conn;
    } catch(err) {
      worker.terminate();
      URL.revokeObjectURL(workerURL);
      throw err;
    }
  })();
  try { return await pending; } catch (e) { pending=null; throw e; }
}
export async function query(sql, maxRows=150) {
  if (!connection) throw new Error("Banco ainda não inicializado.");
  const text=String(sql).trim();
  // Read-only query editor. Never permit multiple statements or PRAGMA/ATTACH/COPY.
  if (!/^(SELECT|WITH|EXPLAIN|DESCRIBE|SHOW)\b/i.test(text)) throw new Error("O sandbox aceita apenas consultas de leitura (SELECT/WITH/EXPLAIN/DESCRIBE/SHOW).");
  if (/;\s*\S/.test(text) || /(^|[^a-z_])(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|COPY|ATTACH|INSTALL|LOAD|CALL|EXPORT|IMPORT|PRAGMA)\b/i.test(text)) {
    throw new Error("Não são permitidas alterações no banco nem múltiplas instruções.");
  }
  const result = await timeout(connection.query(text), 13000, "Execução SQL");
  const all = result.toArray();
  return { columns: result.schema.fields.map(f => f.name), rows: all.slice(0,maxRows).map(mapRow), total: all.length, limited: all.length>maxRows };
}
export function isReady(){return Boolean(connection);}
