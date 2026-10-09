export const lessons=[
 {id:"01",level:"Fundamentos",title:"Explore uma tabela",topic:"SELECT * · FROM",table:"orders",
  description:"O comando SELECT escolhe o que retornar. O asterisco (*) representa todas as colunas e FROM indica a tabela. LIMIT impede que você traga milhares de linhas sem precisar.",
  task:"Retorne as 10 primeiras linhas completas de orders, ordenadas por order_id.",
  starter:"SELECT *\nFROM orders\nLIMIT 10;",
  solution:"SELECT *\nFROM orders\nORDER BY order_id\nLIMIT 10;",
  hint:"Adicione ORDER BY order_id antes do LIMIT. Isso garante quais são as dez primeiras linhas.",ordered:true},
 {id:"02",level:"Fundamentos",title:"Selecione colunas",topic:"Colunas · Projeção",table:"customers",
  description:"Ao escolher apenas algumas colunas, você reduz dados desnecessários e torna a consulta mais clara. Escreva os nomes separados por vírgulas.",
  task:"Mostre apenas customer_id, customer_name e region de customers. Ordene por customer_id e limite a 15 resultados.",
  starter:"SELECT *\nFROM customers\nLIMIT 15;",
  solution:"SELECT customer_id, customer_name, region\nFROM customers\nORDER BY customer_id\nLIMIT 15;",
  hint:"Troque * pela lista customer_id, customer_name, region. Use ORDER BY para fixar a ordem.",ordered:true},
 {id:"03",level:"Fundamentos",title:"Encontre uma região",topic:"WHERE · Filtros",table:"customers",
  description:"WHERE filtra linhas antes de quaisquer agregações. Para comparar textos, use aspas simples. A condição pode combinar AND, OR e comparações.",
  task:"Retorne customer_id e region dos clientes da região 'Sudeste', ordenando por customer_id.",
  starter:"SELECT customer_id, region\nFROM customers\nWHERE region = '...';",
  solution:"SELECT customer_id, region\nFROM customers\nWHERE region = 'Sudeste'\nORDER BY customer_id;",
  hint:"No WHERE use region = 'Sudeste'. Depois adicione ORDER BY customer_id."},
 {id:"04",level:"Fundamentos",title:"Encontre os maiores pedidos",topic:"ORDER BY · LIMIT",table:"orders",
  description:"ORDER BY organiza o resultado. DESC ordena do maior para o menor e LIMIT restringe o número de linhas.",
  task:"Mostre order_id e total_amount dos 5 pedidos com maior valor, desempate por order_id crescente.",
  starter:"SELECT order_id, total_amount\nFROM orders\nORDER BY total_amount\nLIMIT 5;",
  solution:"SELECT order_id, total_amount\nFROM orders\nORDER BY total_amount DESC, order_id ASC\nLIMIT 5;",
  hint:"Altere para ORDER BY total_amount DESC, order_id ASC.",ordered:true},
 {id:"05",level:"Análise",title:"Agrupe por canal",topic:"GROUP BY · COUNT",table:"orders",
  description:"GROUP BY reúne linhas por categoria. COUNT(*) contabiliza os registros de cada grupo. Toda coluna não agregada no SELECT deve constar no agrupamento.",
  task:"Conte quantos pedidos existem por channel e ordene pelo nome do canal.",
  starter:"SELECT channel,\n  COUNT(*) AS total_orders\nFROM orders",
  solution:"SELECT channel,\n  COUNT(*) AS total_orders\nFROM orders\nGROUP BY channel\nORDER BY channel;",
  hint:"Adicione GROUP BY channel e ORDER BY channel."},
 {id:"06",level:"Análise",title:"Relacione pedidos e clientes",topic:"INNER JOIN · ON",table:"orders",
  description:"JOIN conecta tabelas por suas chaves. A cardinalidade da relação importa: duplicidades podem inflar valores quando você junta duas tabelas de muitos registros.",
  task:"Calcule a soma de total_amount por region, usando INNER JOIN entre orders e customers, arredonde em duas casas e ordene por region.",
  starter:"SELECT c.region,\n  SUM(o.total_amount) AS revenue\nFROM orders o",
  solution:"SELECT c.region,\n  ROUND(SUM(o.total_amount), 2) AS revenue\nFROM orders o\nINNER JOIN customers c\n  ON o.customer_id = c.customer_id\nGROUP BY c.region\nORDER BY c.region;",
  hint:"Junte customers usando customer_id, agrupe por c.region e use ROUND(SUM(...), 2)."},
 {id:"07",level:"Avançado",title:"Filtre grupos",topic:"HAVING · SUM",table:"orders",
  description:"WHERE filtra linhas individuais; HAVING filtra grupos após GROUP BY. Ideal para responder quais segmentos ultrapassaram um determinado patamar.",
  task:"Retorne channel e COUNT(*) AS total_orders apenas para canais com mais de 300 pedidos, ordene por channel.",
  starter:"SELECT channel, COUNT(*) AS total_orders\nFROM orders\nGROUP BY channel;",
  solution:"SELECT channel, COUNT(*) AS total_orders\nFROM orders\nGROUP BY channel\nHAVING COUNT(*) > 300\nORDER BY channel;",
  hint:"Use HAVING COUNT(*) > 300 após GROUP BY."},
 {id:"08",level:"Avançado",title:"Crie um ranking",topic:"CTE · DENSE_RANK · OVER",table:"orders",
  description:"Funções de janela preservam linhas enquanto calculam informações sobre um conjunto. DENSE_RANK gera rankings sem pular posições quando existe empate.",
  task:"Calcule a quantidade de pedidos por channel e adicione um ranking decrescente com DENSE_RANK. Nomeie as colunas channel, total_orders e ranking, ordene pelo ranking e por channel.",
  starter:"WITH counts AS (\n  SELECT channel, COUNT(*) AS total_orders\n  FROM orders\n  GROUP BY channel\n)\nSELECT * FROM counts;",
  solution:"WITH counts AS (\n  SELECT channel, COUNT(*) AS total_orders\n  FROM orders\n  GROUP BY channel\n)\nSELECT channel, total_orders,\n  DENSE_RANK() OVER (ORDER BY total_orders DESC) AS ranking\nFROM counts\nORDER BY ranking, channel;",
  hint:"Na consulta externa use DENSE_RANK() OVER (ORDER BY total_orders DESC) AS ranking."}
];
export function grade(actual,expected,ordered=false) {
  const cols=actual.columns;
  if(JSON.stringify(cols)!==JSON.stringify(expected.columns)) return {passed:false,detail:"As colunas não correspondem ao resultado esperado. Confira nomes, seleção e aliases."};
  if(actual.total!==expected.total) return {passed:false,detail:"Quantidade de linhas diferente: retornadas "+actual.total+", esperadas "+expected.total+"."};
  const normalize=value=>value===null?"∅":typeof value==="object"?JSON.stringify(value):String(value);
  const tokens=result=>result.rows.map(row=>JSON.stringify(cols.map(key=>normalize(row[key]))));
  const a=tokens(actual), b=tokens(expected);
  if(!ordered){a.sort();b.sort();}
  const passed=JSON.stringify(a)===JSON.stringify(b);
  return {passed,detail:passed?"Resultado correto! Você produziu a mesma tabela de referência.":"A consulta executou, mas os valores ou a ordenação não coincidem. Revise sua lógica."};
}
