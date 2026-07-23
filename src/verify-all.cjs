const { spawn } = require('child_process');
const PROJECT = '/Users/surendran/Projects/macos-mcp';
const results = [];

function callTool(name, args = {}) {
  return new Promise(resolve => {
    const mcp = spawn('node', ['dist/index.js'], { cwd: PROJECT, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', done = false;
    const finish = r => { if(!done){done=true;mcp.kill();resolve(r);} };
    mcp.stdout.on('data', d => { stdout += d.toString(); try{ const r = JSON.parse(stdout); finish(r); }catch{} });
    mcp.stderr.on('data', d => { stderr += d.toString(); });
    mcp.on('close', () => finish({ error: { message: stderr.substring(0,150) } }));
    const check = setInterval(() => {
      if (stderr.includes('running') || stderr.toLowerCase().includes('warmup')) {
        clearInterval(check);
        mcp.stdin.write(JSON.stringify({ jsonrpc:'2.0', id:1, method:'tools/call', params: { name, arguments: args } }) + '\n');
      }
    }, 200);
    setTimeout(() => { if(!done){finish({error:{message:'TIMEOUT'}})}; }, 60000);
  });
}

async function run() {
  const tests = [
    // ... tool tests
  ];
  
  for (const [cat, tool, args] of tests) {
    const resp = await callTool(tool, args);
    const text = resp.result?.content?.[0]?.text || '';
    const err = resp.error?.message || '';
    results.push({ cat, tool, status: err ? '❌' : '✅', detail: err.substring(0,80) || text.substring(0,80) });
  }

  console.log(JSON.stringify({ results, total: results.length, pass: results.filter(r=>r.status==='✅').length, fail: results.filter(r=>r.status==='❌').length }));
}

run();
