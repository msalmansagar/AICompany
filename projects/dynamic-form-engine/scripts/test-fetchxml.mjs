const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';

const t = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DV}/.default` }) }
).then(r => r.json());

const H = { Authorization: `Bearer ${t.access_token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json' };

const xml = `<fetch version="1.0" mapping="logical" page="1" count="5" returntotalrecordcount="true">
  <entity name="contact">
    <attribute name="fullname"/>
    <attribute name="parentcustomerid"/>
    <attribute name="gendercode"/>
    <attribute name="contactid"/>
    <filter type="and"><condition attribute="statecode" operator="eq" value="0"/></filter>
  </entity>
</fetch>`;

const url = `${DV}/api/data/v9.2/contacts?fetchXml=${encodeURIComponent(xml)}`;
const r = await (await fetch(url, { headers: H })).json();

console.log('\nRaw keys in first record:');
console.log(Object.keys(r.value[0] ?? {}));

console.log('\nSeeded contacts:');
r.value
  .filter(c => c.fullname && ['Ahmed','Fatima','Mohammed','Aisha','Omar','Noura','Khalid','Yusuf'].some(n => c.fullname?.includes(n)))
  .forEach(c => {
    console.log(`  ${c.fullname} | gender: ${c.gendercode} | company: ${c['_parentcustomerid_value@OData.Community.Display.V1.FormattedValue'] ?? '—'}`);
  });
