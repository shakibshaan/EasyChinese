import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'hello' })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

test();
