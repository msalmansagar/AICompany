import zlib from 'node:zlib';
const MEMO = 1_048_576;
const b64 = (buf) => Math.ceil(buf.length / 3) * 4;

/* A pool of genuinely distinct sentences, so no two paragraphs are identical.
   Repeated text compresses artificially well and would flatter the result. */
const EN_POOL = [
 'Eligibility is assessed against commercial registration, trading history and sector.',
 'Applicants must hold a valid registration issued by the Ministry of Commerce and Industry.',
 'Facilities are priced according to tenor, collateral quality and the borrower risk grade.',
 'Disbursement follows completion of security perfection and satisfaction of conditions precedent.',
 'Early settlement is permitted subject to the fee schedule published on this page.',
 'The bank may request audited statements covering the preceding three financial years.',
 'Working capital lines are reviewed annually and renewal is not automatic.',
 'Applications are acknowledged within five business days of receipt of a complete file.',
 'Guarantees issued under this programme are capped at the limit stated in the offer letter.',
 'Sector concentration limits may restrict availability irrespective of individual standing.',
 'Foreign currency exposure is hedged at the borrower expense unless otherwise agreed.',
 'A relationship manager is assigned once the facility moves to documentation.',
 'Covenant breaches must be reported within ten days of the borrower becoming aware.',
 'Amendments to approved terms require fresh credit approval and may attract a fee.',
];
const AR_POOL = [
 'يتم تقييم الأهلية بناءً على السجل التجاري وتاريخ التداول والقطاع.',
 'يجب أن يحمل مقدمو الطلبات سجلاً ساري المفعول صادراً عن وزارة التجارة والصناعة.',
 'يتم تسعير التسهيلات وفقاً للأجل وجودة الضمان ودرجة مخاطر المقترض.',
 'يتم الصرف بعد استكمال الضمانات واستيفاء الشروط المسبقة.',
 'يُسمح بالسداد المبكر وفقاً لجدول الرسوم المنشور على هذه الصفحة.',
 'قد يطلب البنك بيانات مدققة تغطي السنوات المالية الثلاث السابقة.',
 'تتم مراجعة خطوط رأس المال العامل سنوياً والتجديد ليس تلقائياً.',
 'يتم الإقرار بالطلبات خلال خمسة أيام عمل من استلام الملف كاملاً.',
 'الضمانات الصادرة بموجب هذا البرنامج محدودة بالحد المذكور في خطاب العرض.',
 'قد تقيد حدود تركز القطاع التوافر بغض النظر عن الوضع الفردي.',
 'يتم تحوط التعرض للعملات الأجنبية على نفقة المقترض ما لم يُتفق على خلاف ذلك.',
 'يتم تعيين مدير علاقات بمجرد انتقال التسهيل إلى التوثيق.',
 'يجب الإبلاغ عن مخالفات التعهدات خلال عشرة أيام من علم المقترض بها.',
 'تتطلب التعديلات موافقة ائتمانية جديدة وقد تخضع لرسوم.',
];
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const para = (pool, n) => Array.from({length:n}, () => pool[Math.floor(rnd()*pool.length)]).join(' ');

const richify = (t) => '<p>' + t.split('. ').filter(Boolean).map((s,i) =>
  i % 3 === 1 ? `<strong>${s}.</strong>` : `${s}.`).join('</p><p>') + '</p>' +
  `<ul><li>${t.slice(0,55)}</li><li>${t.slice(55,110)}</li></ul>` +
  `<p><a href="/en/terms">Full terms</a></p>`;

function page({blocks, sentences, rich}) {
  const body=[];
  for (let i=0;i<blocks;i++){
    const en=para(EN_POOL,sentences), ar=para(AR_POOL,sentences);
    body.push({id:`blk-${i}`, type: rich?'RichText':'Text',
      props:{heading:{en:`Section ${i}`,ar:`القسم ${i}`},
             body:{en: rich?richify(en):en, ar: rich?richify(ar):ar}, accent:'brand-primary'}});
  }
  return {schemaVersion:1, root:{props:{title:{en:'Financing',ar:'التمويل'}}}, blocks:body};
}
const rows=[];
const M=(label,tree)=>{const j=JSON.stringify(tree);const g=zlib.gzipSync(Buffer.from(j,'utf8'));const s=b64(g);
  rows.push({label, rawKB:+(Buffer.byteLength(j,'utf8')/1024).toFixed(1), ratio:+(Buffer.byteLength(j,'utf8')/g.length).toFixed(1),
             storedKB:+(s/1024).toFixed(1), pct:+((s/MEMO)*100).toFixed(2)});};

M('Structural only — 2,000 blocks, no prose', page({blocks:2000, sentences:0, rich:false}));
M('Typical page — 20 rich blocks, 4 sentences',  page({blocks:20,  sentences:4,  rich:true}));
M('Heavy page — 60 rich blocks, 8 sentences',    page({blocks:60,  sentences:8,  rich:true}));
M('Very heavy — 200 rich blocks, 12 sentences',  page({blocks:200, sentences:12, rich:true}));
M('Pathological — 800 rich blocks, 14 sentences',page({blocks:800, sentences:14, rich:true}));

console.log('\n  Memo limit 1,048,576 chars · stored gzip + Base64 · varied (non-repeating) prose\n');
console.log('  '+'case'.padEnd(46)+'raw KB'.padStart(9)+'gzip x'.padStart(9)+'stored KB'.padStart(11)+'% memo'.padStart(9));
console.log('  '+'-'.repeat(84));
for(const r of rows) console.log('  '+r.label.padEnd(46)+String(r.rawKB).padStart(9)+String(r.ratio).padStart(9)+String(r.storedKB).padStart(11)+String(r.pct).padStart(9));
